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
  FetchResult,
  compareCursors,
  ValueCursor,
  DBFetchOptions as AllDBFetchOptions,
  Attribute,
  TupleValue,
  schemaToJSON,
} from '@triplit/db';
import { getUserId } from './token.js';
import { UnrecognizedFetchPolicyError } from './errors.js';
import { MemoryBTreeStorage } from '@triplit/db/storage/memory-btree';
import { IndexedDbStorage } from '@triplit/db/storage/indexed-db';
import { SyncTransport } from './transport/transport.js';
import { SyncEngine } from './sync-engine.js';
import {
  ClientFetchResult,
  ClientFetchResultEntity,
  ClientQuery,
  ClientQueryBuilder,
  ClientSchema,
  prepareFetchByIdQuery,
  prepareFetchOneQuery,
} from './utils/query.js';
import { RemoteClient } from './remote-client.js';
import { Logger } from '@triplit/types/logger.js';
import { DefaultLogger } from './client-logger.js';

export interface SyncOptions {
  server?: string;
  token?: string;
  secure?: boolean;
  syncSchema?: boolean;
  transport?: SyncTransport;
  logger: Logger;
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

type DBFetchOptions = Pick<AllDBFetchOptions, 'noCache'>;

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
export type FetchOptions = DBFetchOptions &
  (
    | LocalFirstFetchOptions
    | LocalOnlyFetchOptions
    | RemoteFirstFetchOptions
    | RemoteOnlyFetchOptions
    | LocalAndRemoteFetchOptions
  );

type ClientSubscriptionOptions = {
  localOnly: boolean;
  onRemoteFulfilled?: () => void;
};
export type SubscriptionOptions = DBFetchOptions & ClientSubscriptionOptions;

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

export interface ClientOptions<M extends ClientSchema | undefined> {
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

  autoConnect?: boolean;
  logger?: Logger;
  logLevel?: 'info' | 'warn' | 'error' | 'debug';
}

// default policy is local-and-remote and no timeout
const DEFAULT_FETCH_OPTIONS = {
  policy: 'local-first',
} as const;

export class TriplitClient<M extends ClientSchema | undefined = undefined> {
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
  logger: Logger;
  readonly logs: any[] = [];

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
      logger,
      logLevel = 'info',
    } = options ?? {};
    this.logger =
      logger ??
      new DefaultLogger({
        scope: 'client',
        level: logLevel,
        // Use debug mode as a proxy for dev mode
        onLog: logLevel === 'debug' ? (log) => this.logs.push(log) : () => {},
      });

    const autoConnect = options?.autoConnect ?? true;
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
      logger: this.logger.scope('db'),
    });

    this.defaultFetchOptions = {
      fetch: DEFAULT_FETCH_OPTIONS,
      ...defaultQueryOptions,
    };

    const syncOptions: SyncOptions = {
      syncSchema,
      transport,
      logger: this.logger.scope('sync'),
      ...(serverUrl ? mapServerUrlToSyncOptions(serverUrl) : {}),
    };

    this.remote = new RemoteClient<M>({
      server: serverUrl,
      token,
      schemaFactory: async () => (await this.db.getSchema())?.collections as M,
    });
    this.db.onSchemaChange((schema) => {
      this.remote.updateOptions({ schema: schema?.collections });
    });

    if (this.authOptions.token) {
      syncOptions.token = this.authOptions.token;
      const userId = getUserId(
        this.authOptions.token,
        this.authOptions.claimsPath
      );
      // TODO: properly use sessions
      this.db.updateGlobalVariables({ SESSION_USER_ID: userId });
    }

    this.syncEngine = new SyncEngine(syncOptions, this.db);
    // Look into how calling connect / disconnect early is handled
    this.db.ensureMigrated.then(() => {
      if (autoConnect) this.syncEngine.connect();
    });
  }

  async getSchema() {
    return schemaToJSON(await this.db.getSchema());
  }

  async transact<Output>(callback: (tx: DBTransaction<M>) => Promise<Output>) {
    this.logger.debug('transact START');
    const resp = await this.db.transact(callback, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
    this.logger.debug('transact END', resp);
    return resp;
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): ReturnType<typeof ClientQueryBuilder<M, CN>> {
    return ClientQueryBuilder(collectionName);
  }

  async fetch<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<ClientFetchResult<CQ>> {
    // ID is currently used to trace the lifecycle of a query/subscription across logs
    // @ts-ignore
    query = addLoggingIdToQuery(query);

    const opts = { ...this.defaultFetchOptions.fetch, ...(options ?? {}) };
    if (opts.policy === 'local-only') {
      return this.fetchLocal(query, opts);
    }

    if (opts.policy === 'local-first') {
      const localResults = await this.fetchLocal(query, opts);
      if (localResults.size > 0) return localResults;
      try {
        await this.syncEngine.syncQuery(query);
      } catch (e) {
        warnError(e);
      }
      return this.fetchLocal(query, opts);
    }

    if (opts.policy === 'remote-first') {
      try {
        await this.syncEngine.syncQuery(query);
      } catch (e) {
        warnError(e);
      }
      return this.fetchLocal(query, opts);
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
      return this.fetchLocal(query, opts);
    }

    throw new UnrecognizedFetchPolicyError((opts as FetchOptions).policy);
  }

  private async fetchLocal<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<DBFetchOptions>
  ): Promise<ClientFetchResult<CQ>> {
    const scope = parseScope(query);
    this.logger.debug('fetchLocal START', query, scope);
    const res = await this.db.fetch(query, {
      scope,
      skipRules: SKIP_RULES,
      ...(options ?? {}),
    });
    this.logger.debug('fetchLocal END', res);
    return res as ClientFetchResult<CQ>;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    queryParams?: FetchByIdQueryParams<M, CN>,
    options?: Partial<FetchOptions>
  ): Promise<ClientFetchResultEntity<ClientQuery<M, CN>> | null> {
    this.logger.debug(
      'fetchById START',
      collectionName,
      id,
      queryParams,
      options
    );
    const query = prepareFetchByIdQuery(collectionName, id, queryParams);
    const results = await this.fetch(
      query as ClientQuery<M, CollectionNameFromModels<M>>,
      options
    );
    this.logger.debug(
      'fetchById END',
      collectionName,
      id,
      queryParams,
      options
    );
    const entity = results.get(id);
    if (!entity) return null;
    return entity;
  }

  async fetchOne<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<ClientFetchResultEntity<CQ> | null> {
    // ID is currently used to trace the lifecycle of a query/subscription across logs
    // @ts-ignore
    query = addLoggingIdToQuery(query);
    query = prepareFetchOneQuery(query);
    const result = await this.fetch(query, options);
    const entity = [...result.values()][0];
    if (!entity) return null;
    return entity;
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: InsertTypeFromModel<ModelFromModels<M, CN>>
  ) {
    this.logger.debug('insert START', collectionName, object);
    const resp = await this.db.insert(collectionName, object, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
    this.logger.debug('insert END', resp);
    return resp;
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => void | Promise<void>
  ) {
    this.logger.debug('update START', collectionName, entityId);
    const resp = await this.db.update(collectionName, entityId, updater, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
    this.logger.debug('update END', resp);
    return resp;
  }

  async updateRaw<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => [Attribute, TupleValue][] | Promise<[Attribute, TupleValue][]>
  ) {
    this.logger.debug('updateRaw START', collectionName, entityId);
    const resp = await this.db.transact(
      async (tx) => {
        await tx.updateRaw(collectionName, entityId, updater);
      },
      {
        skipRules: true,
        storeScope: {
          read: ['outbox', 'cache'],
          write: ['outbox'],
        },
      }
    );
    this.logger.debug('updateRaw END', resp);
    return resp;
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string
  ) {
    this.logger.debug('delete START', collectionName, entityId);
    const resp = await this.db.delete(collectionName, entityId, {
      skipRules: SKIP_RULES,
      storeScope: {
        read: ['outbox', 'cache'],
        write: ['outbox'],
      },
    });
    this.logger.debug('delete END', resp);
    return resp;
  }

  // TODO: refactor so some logic is shared across policies (ex starting a local and remote sub is verbose and repetitive)
  subscribe<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: { hasRemoteFulfilled: boolean }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ) {
    let unsubscribed = false;
    const opts: SubscriptionOptions = { localOnly: false, ...(options ?? {}) };
    // ID is currently used to trace the lifecycle of a query/subscription across logs
    // @ts-ignore
    query = addLoggingIdToQuery(query);
    const scope = parseScope(query);
    this.logger.debug('subscribe start', query, scope);
    if (opts.localOnly) {
      try {
        return this.db.subscribe(
          query,
          (results) =>
            onResults(results as ClientFetchResult<CQ>, {
              hasRemoteFulfilled: false,
            }),
          onError,
          {
            scope,
            skipRules: SKIP_RULES,
            ...opts,
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
    let fulfilledTimeout: ReturnType<typeof setTimeout> | null = null;
    let results: FetchResult<CQ>;
    const userResultsCallback = onResults;
    const userErrorCallback = onError;
    onResults = (results, info) => {
      // Ensure we dont re-fire the callback if we've already unsubscribed
      if (unsubscribed) return;
      userResultsCallback(results as ClientFetchResult<CQ>, info);
    };
    onError = userErrorCallback
      ? (error) => {
          // Ensure we dont re-fire the callback if we've already unsubscribed
          if (unsubscribed) return;
          userErrorCallback(error);
        }
      : undefined;
    const clientSubscriptionCallback = (newResults: FetchResult<CQ>) => {
      results = newResults;
      this.logger.debug('subscribe RESULTS', results);
      onResults(results as ClientFetchResult<CQ>, { hasRemoteFulfilled });
    };
    unsubscribeLocal = this.db.subscribe(
      query,
      clientSubscriptionCallback,
      onError,
      {
        scope,
        skipRules: SKIP_RULES,
        ...opts,
      }
    );
    if (scope.includes('cache')) {
      const onFulfilled = () => {
        hasRemoteFulfilled = true;
        if (fulfilledTimeout !== null) {
          clearTimeout(fulfilledTimeout);
        }
        // This is a hack to make sure we don't call onRemoteFulfilled before
        // the local subscription callback has had a chance to refire
        fulfilledTimeout = setTimeout(() => {
          clientSubscriptionCallback(results as ClientFetchResult<CQ>);
          opts.onRemoteFulfilled?.();
        }, 250);
      };
      unsubscribeRemote = this.syncEngine.subscribe(query, onFulfilled);
    }
    return () => {
      unsubscribed = true;
      unsubscribeLocal();
      unsubscribeRemote();
    };
  }

  /**
   * Subscribe to a query with helpers for pagination
   * This query will "oversubscribe" by 1 on either side of the current page to determine if there are "next" or "previous" pages
   * The window generally looks like [buffer, ...page..., buffer]
   * Depending on the current paging direction, the query may have its original order reversed
   *
   * The pagination will also do its best to always return full pages
   */
  subscribeWithPagination<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: {
        hasRemoteFulfilled: boolean;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ): PaginatedSubscription {
    const returnValue: Partial<PaginatedSubscription> = {};
    const requestedLimit = query.limit;
    let subscriptionResultHandler = (results: any, info: any) => {
      onResults(results, {
        ...info,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    };
    returnValue.nextPage = () => {
      console.warn(
        'There is no limit set on the query, so nextPage() is a no-op'
      );
    };
    returnValue.prevPage = () => {
      console.warn(
        'There is no limit set on the query, so prevPage() is a no-op'
      );
    };

    // Range of the current page
    let rangeStart: ValueCursor | undefined = undefined;
    let rangeEnd: ValueCursor | undefined = undefined;

    // The current paging direction of the query
    // If we are paging backwards, we need to reverse the order of the query (flip order of query, reverse results to maintain original query order)
    let pagingDirection: 'forward' | 'reversed' = 'forward';

    // If we have a limit, handle pagination
    if (query.limit) {
      // If we have an after, the limit will increase by 1
      query.limit = requestedLimit! + 1 + (query.after ? 1 : 0);
      subscriptionResultHandler = (
        results: ClientFetchResult<CQ>,
        info: { hasRemoteFulfilled: boolean }
      ) => {
        const cursorAttr = query.order?.[0]?.[0];

        // TODO: maybe use onError?
        if (!cursorAttr)
          throw new TriplitError('No cursor attribute found in query order');

        let entries = Array.from(results.entries());
        const firstEntry = entries.at(0);

        // Calculate if can move the window forward or backward
        // This is forward/backward from the perspective of the current paging direction (not the original query)
        // If there is an after param (ie not at the start of the data), and the first entry (prev page buffer) is lte the after cursor
        const canMoveWindowBackward =
          !!query.after &&
          !!firstEntry &&
          compareCursors(query.after[0], [
            firstEntry[1][cursorAttr], // TODO need to translate things like dates
            firstEntry[0],
          ]) > -1;

        // If we have overflowing data, we can move the window forward
        const canMoveWindowForward = results.size >= query.limit!; // Pretty sure this cant be gt, but still

        // If we can page forward or backward (from the perspective of the original query)
        const hasPreviousPage =
          pagingDirection === 'reversed'
            ? canMoveWindowForward
            : canMoveWindowBackward;
        const hasNextPage =
          pagingDirection === 'forward'
            ? canMoveWindowForward
            : canMoveWindowBackward;

        // Remove buffered data
        entries = entries.slice(
          canMoveWindowBackward ? 1 : 0,
          canMoveWindowForward ? -1 : undefined
        );

        const firstDataEntry = entries.at(0);
        const lastDataEntry = entries.at(requestedLimit! - 1);

        // Track range of the current page for pagination functions
        rangeStart = firstDataEntry
          ? [firstDataEntry[1][cursorAttr], firstDataEntry[0]]
          : undefined;
        rangeEnd = lastDataEntry
          ? [lastDataEntry[1][cursorAttr], lastDataEntry[0]]
          : undefined;

        // To keep order consistent with the orignial query, reverse the entries if we are paging backwards
        if (pagingDirection === 'reversed') entries = entries.reverse();

        // If we have paged back to the start, drop the after cursor to "reset" the query
        // This helps us ensure we always have a full page of data
        if (!hasPreviousPage && !!query.after) {
          returnValue.unsubscribe?.();
          query = { ...query };
          query.after = undefined;
          query.limit = requestedLimit! + 1;
          if (pagingDirection === 'reversed')
            query.order = flipOrder(query.order);
          pagingDirection = 'forward';
          returnValue.unsubscribe = this.subscribe(
            query,
            subscriptionResultHandler,
            onError,
            options
          );
        } else {
          onResults(new Map(entries) as ClientFetchResult<CQ>, {
            ...info,
            hasNextPage: hasNextPage,
            hasPreviousPage: hasPreviousPage,
          });
        }
      };

      returnValue.nextPage = () => {
        // Unsubscribe from the current subscription
        returnValue.unsubscribe?.();
        query = { ...query };
        // Handle direction change
        if (pagingDirection === 'reversed') {
          query.order = flipOrder(query.order);
          query.after = rangeStart ? [rangeStart, true] : undefined;
        } else {
          // If moving off of first page (ie no after), update limit
          if (!query.after) query.limit = query.limit! + 1;
          query.after = rangeEnd ? [rangeEnd, true] : undefined;
        }
        pagingDirection = 'forward';

        // resubscribe with the new query
        returnValue.unsubscribe = this.subscribe(
          query,
          subscriptionResultHandler,
          onError,
          options
        );
      };
      returnValue.prevPage = () => {
        // Unsubscribe from the current subscription
        returnValue.unsubscribe?.();
        query = { ...query };
        // Handle direction change
        if (pagingDirection === 'forward') {
          query.order = flipOrder(query.order);
          query.after = rangeStart ? [rangeStart, true] : undefined;
        } else {
          query.after = rangeEnd ? [rangeEnd, true] : undefined;
        }
        pagingDirection = 'reversed';

        // resubscribe with the new query
        returnValue.unsubscribe = this.subscribe(
          query,
          subscriptionResultHandler,
          onError,
          options
        );
      };
    }

    returnValue.unsubscribe = this.subscribe(
      query,
      subscriptionResultHandler,
      onError,
      options
    );

    return returnValue as PaginatedSubscription;
  }

  subscribeWithExpand<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: ClientFetchResult<CQ>,
      info: {
        hasRemoteFulfilled: boolean;
        hasMore: boolean;
      }
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options?: Partial<SubscriptionOptions>
  ): InfiniteSubscription {
    const returnValue: Partial<InfiniteSubscription> = {};
    let subscriptionResultHandler = (results: any, info: any) => {
      onResults(results, {
        ...info,
        hasMore: false,
      });
    };
    returnValue.loadMore = () => {
      console.warn(
        'There is no limit set on the query, so loadMore is a no-op'
      );
    };
    if (query.limit) {
      const originalPageSize = query.limit;
      query.limit = query.limit + 1;
      subscriptionResultHandler = (
        results: ClientFetchResult<CQ>,
        info: { hasRemoteFulfilled: boolean }
      ) => {
        const hasMore = results.size >= query.limit!;
        let entries = Array.from(results.entries());
        if (hasMore) entries = entries.slice(0, -1);
        onResults(new Map(entries) as ClientFetchResult<CQ>, {
          hasRemoteFulfilled: info.hasRemoteFulfilled,
          hasMore,
        });
      };

      returnValue.loadMore = (pageSize?: number) => {
        returnValue.unsubscribe?.();
        query = { ...query };
        query.limit = (query.limit ?? 1) + (pageSize ?? originalPageSize);
        returnValue.unsubscribe = this.subscribe(
          query,
          subscriptionResultHandler,
          onError,
          options
        );
      };
    }
    returnValue.unsubscribe = this.subscribe(
      query,
      subscriptionResultHandler,
      onError,
      options
    );

    return returnValue as InfiniteSubscription;
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
      // TODO: properly use sessions
      this.db.updateGlobalVariables({ SESSION_USER_ID: userId });

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

  onTxCommitRemote(...args: Parameters<typeof this.syncEngine.onTxCommit>) {
    return this.syncEngine.onTxCommit(...args);
  }
  onTxFailureRemote(txId: string, callback: () => void) {
    return this.syncEngine.onTxFailure(txId, callback);
  }

  onConnectionStatusChange(
    ...args: Parameters<typeof this.syncEngine.onConnectionStatusChange>
  ) {
    return this.syncEngine.onConnectionStatusChange(...args);
  }
}

function addLoggingIdToQuery(query: any) {
  return { id: Math.random().toString().slice(2), ...query };
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

export type PaginatedSubscription = {
  unsubscribe: () => void;
  nextPage: () => void;
  prevPage: () => void;
};

export type InfiniteSubscription = {
  unsubscribe: () => void;
  loadMore: (pageSize?: number) => void;
};

function flipOrder(order: any) {
  if (!order) return undefined;
  return order.map((o: any) => [o[0], o[1] === 'ASC' ? 'DESC' : 'ASC']);
}
