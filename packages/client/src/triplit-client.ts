import {
  DB,
  Migration,
  UpdateTypeFromModel,
  Models,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
  DurableClock,
  TriplitError,
  InsertTypeFromModel,
  Storage,
  FetchByIdQueryParams,
} from '@triplit/db';
import { getUserId } from './token.js';
import { UnrecognizedFetchPolicyError } from './errors.js';
import { MemoryBTreeStorage } from '@triplit/db/storage/memory-btree';
import { IndexedDbStorage } from '@triplit/db/storage/indexed-db';
import { SyncTransport } from './transport/transport.js';
import { SyncEngine } from './sync-engine.js';
import {
  ClientFetchResult,
  ClientQuery,
  ClientQueryBuilder,
  prepareFetchByIdQuery,
  prepareFetchOneQuery,
} from './utils/query.js';
import { RemoteClient } from './remote-client.js';

export interface SyncOptions {
  server?: string;
  token?: string;
  secure?: boolean;
  syncSchema?: boolean;
  transport?: SyncTransport;
}

// Not totally sold on passing in the token here, but it felt awkward to have it in the sync options since its also relevant to the database
interface AuthOptions {
  claimsPath?: string;
  token?: string;
}

// Could probably make this an option if you want client side validation
const SKIP_RULES = true;

function parseScope(query: ClientQuery<any, any>) {
  const { syncStatus } = query;
  if (!syncStatus) return ['cache', 'outbox'];
  switch (syncStatus) {
    case 'all':
      return ['cache', 'outbox'];
    case 'confirmed':
      return ['cache'];
    case 'pending':
      return ['outbox'];
  }
}

export type LocalFirstFetchOptions = {
  policy: 'local-first';
};
export type LocalOnlyFetchOptions = {
  policy: 'local-only';
};
export type RemoteFirstFetchOptions = {
  policy: 'remote-first';
};
export type RemoteOnlyFetchOptions = {
  policy: 'remote-only';
};
export type LocalAndRemoteFetchOptions = {
  policy: 'local-and-remote';
  timeout?: number;
};
export type FetchOptions =
  | LocalFirstFetchOptions
  | LocalOnlyFetchOptions
  | RemoteFirstFetchOptions
  | RemoteOnlyFetchOptions
  | LocalAndRemoteFetchOptions;

export type SubscriptionOptions =
  | { localOnly: true }
  | { localOnly: undefined | false; onRemoteFulfilled?: () => void };

type StorageOptions =
  | { cache: Storage; outbox: Storage }
  | 'indexeddb'
  | 'memory';

function getClientStorage(storageOption: StorageOptions) {
  if (
    typeof storageOption === 'object' &&
    ('cache' in storageOption || 'outbox' in storageOption)
  ) {
    if (!('cache' in storageOption) || !('outbox' in storageOption))
      throw new Error('Must define both outbox and client.');
    return storageOption;
  }

  if (storageOption === 'memory')
    return {
      cache: new MemoryBTreeStorage(),
      outbox: new MemoryBTreeStorage(),
    };

  if (storageOption === 'indexeddb') {
    return {
      cache: new IndexedDbStorage('triplit-cache'),
      outbox: new IndexedDbStorage('triplit-outbox'),
    };
  }
}

const DEFAULT_STORAGE_OPTION = 'memory';

export interface ClientOptions<M extends Models<any, any> | undefined> {
  schema?: M;
  token?: string;
  claimsPath?: string;

  serverUrl?: string;
  migrations?: Migration[];
  syncSchema?: boolean;
  transport?: SyncTransport;

  variables?: Record<string, any>;
  clientId?: string;
  storage?: StorageOptions;

  defaultQueryOptions?: {
    fetch?: FetchOptions;
    subscription?: SubscriptionOptions;
  };
}

// default policy is local-and-remote and no timeout
const DEFAULT_FETCH_OPTIONS = {
  policy: 'local-first',
} as const;

export class TriplitClient<M extends Models<any, any> | undefined = undefined> {
  db: DB<M>;

  /**
   * The sync engine is responsible for managing the connection to the server and syncing data
   */
  syncEngine: SyncEngine;
  authOptions: AuthOptions;
  remote: RemoteClient<M>;

  private defaultFetchOptions: {
    fetch: FetchOptions;
  };

  constructor(options?: ClientOptions<M>) {
    const {
      schema,
      token,
      claimsPath,
      serverUrl,
      syncSchema,
      transport,
      migrations,
      clientId,
      variables,
      storage,
      defaultQueryOptions,
    } = options ?? {};
    const clock = new DurableClock('cache', clientId);
    this.authOptions = { token, claimsPath };
    this.db = new DB({
      clock,
      schema: schema ? { collections: schema, version: 0 } : undefined,
      migrations: migrations
        ? {
            definitions: migrations,
            scopes: ['cache'],
          }
        : undefined,
      variables,
      sources: getClientStorage(storage ?? DEFAULT_STORAGE_OPTION),
    });

    this.defaultFetchOptions = {
      fetch: DEFAULT_FETCH_OPTIONS,
      ...defaultQueryOptions,
    };

    const syncOptions: SyncOptions = {
      syncSchema,
      transport,
      ...(serverUrl ? mapServerUrlToSyncOptions(serverUrl) : {}),
    };

    this.remote = new RemoteClient({ server: serverUrl, token });

    if (this.authOptions.token) {
      syncOptions.token = this.authOptions.token;
      const userId = getUserId(
        this.authOptions.token,
        this.authOptions.claimsPath
      );
      this.db.updateVariables({ SESSION_USER_ID: userId });
    }

    this.syncEngine = new SyncEngine(syncOptions, this.db);
    this.db.ensureMigrated.then(() => {
      this.syncEngine.connect();
    });
  }

  async transact<Output>(callback: (tx: DBTransaction<M>) => Promise<Output>) {
    return this.db.transact(callback, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
  }

  // TODO: is this better done with generics?
  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): ClientQueryBuilder<M, CN> {
    return ClientQueryBuilder<M, CN>(collectionName);
  }

  async fetch<CQ extends ClientQuery<M, CollectionNameFromModels<M>>>(
    query: CQ,
    options?: FetchOptions
  ): Promise<ClientFetchResult<CQ>> {
    const opts = options ?? this.defaultFetchOptions.fetch;
    if (opts.policy === 'local-only') {
      return this.fetchLocal(query);
    }

    if (opts.policy === 'local-first') {
      const localResults = await this.fetchLocal(query);
      if (localResults.size > 0) return localResults;
      try {
        await this.syncEngine.syncQuery(query);
      } catch (e) {
        warnError(e);
      }
      return this.fetchLocal(query);
    }

    if (opts.policy === 'remote-first') {
      try {
        await this.syncEngine.syncQuery(query);
      } catch (e) {
        warnError(e);
      }
      return this.fetchLocal(query);
    }

    if (opts.policy === 'remote-only') {
      return this.syncEngine.fetchQuery(query);
    }

    if (opts.policy === 'local-and-remote') {
      const timeout = opts.timeout ?? 0;
      await Promise.race([
        this.syncEngine.syncQuery(query),
        new Promise((res) => setTimeout(res, timeout)),
      ]).catch(warnError);
      return this.fetchLocal(query);
    }

    throw new UnrecognizedFetchPolicyError((opts as FetchOptions).policy);
  }

  private async fetchLocal<CQ extends ClientQuery<M, any>>(
    query: CQ
  ): Promise<ClientFetchResult<CQ>> {
    const scope = parseScope(query);
    const res = await this.db.fetch(query, { scope, skipRules: SKIP_RULES });
    return res;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    queryParams?: FetchByIdQueryParams<M, CN>,
    options?: FetchOptions
  ) {
    const query = prepareFetchByIdQuery(collectionName, id, queryParams);
    const results = await this.fetch(
      query as ClientQuery<M, CollectionNameFromModels<M>>,
      options
    );
    return results.get(id);
  }

  async fetchOne<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: FetchOptions
  ) {
    query = prepareFetchOneQuery(query);
    const result = await this.fetch(query, options);
    const entity = [...result.values()][0];
    if (!entity) return null;
    return entity;
  }

  insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: InsertTypeFromModel<ModelFromModels<M, CN>>
  ) {
    return this.db.insert(collectionName, object, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
  }

  update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => void | Promise<void>
  ) {
    return this.db.update(collectionName, entityId, updater, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
  }

  delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string
  ) {
    return this.db.delete(collectionName, entityId, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
  }

  // TODO: refactor so some logic is shared across policies (ex starting a local and remote sub is verbose and repetitive)
  subscribe<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: { hasRemoteFulfilled: boolean }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: SubscriptionOptions
  ) {
    const opts: SubscriptionOptions = { localOnly: false, ...options };

    const scope = parseScope(query);

    if (opts.localOnly) {
      try {
        return this.db.subscribe(
          query,
          // @ts-ignore TODO: include hasRemoteFulfilled
          onResults,
          onError,
          {
            scope,
            skipRules: SKIP_RULES,
          }
        );
      } catch (e) {
        if (onError) onError(e);
        else warnError(e);
        return () => {};
      }
    }

    let unsubscribeLocal = () => {};
    let unsubscribeRemote = () => {};
    let hasRemoteFulfilled = false;
    const clientSubscriptionCallback = (results: any) =>
      onResults(results as ClientFetchResult<CQ>, { hasRemoteFulfilled });
    unsubscribeLocal = this.db.subscribe(
      query,
      clientSubscriptionCallback,
      onError,
      {
        scope,
        skipRules: SKIP_RULES,
      }
    );
    if (scope.includes('cache')) {
      const onFulfilled = () => {
        hasRemoteFulfilled = true;
        opts.onRemoteFulfilled?.();
        // TODO we should manually call the db subscription callback with
        // the remote status just in case there are no new results but
        // we also don't want to call it with stale results
      };
      unsubscribeRemote = this.syncEngine.subscribe(query, onFulfilled);
    }
    return () => {
      unsubscribeLocal();
      unsubscribeRemote();
    };
  }

  updateOptions(options: Pick<ClientOptions<M>, 'token' | 'serverUrl'>) {
    const { token, serverUrl } = options;
    const hasToken = options.hasOwnProperty('token');
    const hasServerUrl = options.hasOwnProperty('serverUrl');
    let updatedSyncOptions = {};

    // handle updating the token and variables for auth purposes
    if (hasToken) {
      this.authOptions = { ...this.authOptions, token };
      const { claimsPath } = this.authOptions;
      const userId = token ? getUserId(token, claimsPath) : undefined;
      this.db.updateVariables({ SESSION_USER_ID: userId });

      // and update the sync engine
      updatedSyncOptions = { ...updatedSyncOptions, token };
    }

    // handle updating the server url for sync purposes
    if (hasServerUrl) {
      const { server, secure } = serverUrl
        ? mapServerUrlToSyncOptions(serverUrl)
        : { server: undefined, secure: undefined };
      updatedSyncOptions = { ...updatedSyncOptions, server, secure };
    }

    if (hasToken || hasServerUrl) {
      this.syncEngine.updateConnection(updatedSyncOptions);
      this.remote.updateOptions(updatedSyncOptions);
    }
  }

  updateToken(token: string | undefined) {
    this.updateOptions({ token });
  }

  updateServerUrl(serverUrl: string | undefined) {
    this.updateOptions({ serverUrl });
  }
}

function mapServerUrlToSyncOptions(serverUrl: string) {
  const url = new URL(serverUrl);
  const secure = url.protocol === 'https:';
  const server = url.host;
  return { server, secure };
}

function warnError(e: any) {
  if (e instanceof TriplitError) {
    console.warn(e.toJSON());
  } else {
    console.warn(e);
  }
}
