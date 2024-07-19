import {
  DB,
  Migration,
  UpdateTypeFromModel,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
  DurableClock,
  TriplitError,
  InsertTypeFromModel,
  Storage,
  FetchResult,
  compareCursors,
  ValueCursor,
  DBFetchOptions as AllDBFetchOptions,
  Attribute,
  TupleValue,
  schemaToJSON,
  Unalias,
  SchemaJSON,
} from '@triplit/db';
import { getUserId } from '../token.js';
import { UnrecognizedFetchPolicyError } from '../errors.js';
import { MemoryBTreeStorage } from '@triplit/db/storage/memory-btree';
import { IndexedDbStorage } from '@triplit/db/storage/indexed-db';
import { SyncTransport } from '../transport/transport.js';
import { SyncEngine } from '../sync-engine.js';
import {
  ClientFetchResult,
  ClientFetchResultEntity,
  ClientQuery,
  ClientQueryDefault,
  ClientSchema,
} from './types';
import { clientQueryBuilder } from './query-builder.js';
import { HttpClient } from '../http-client/http-client.js';
import { Logger } from '@triplit/types/logger';
import { DefaultLogger } from '../client-logger.js';

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
  /**
   * The schema used to validate database operations and provide type-hinting. Read more about schemas {@link https://www.triplit.dev/docs/schemas | here }
   */
  schema?: M;
  /**
   * The token used to authenticate with the server. If not provided, the client will not connect to a server. Read more about tokens {@link https://www.triplit.dev/docs/auth | here }
   */
  token?: string;
  /**
   * The path to the claims in the token, if they are nested.
   */
  claimsPath?: string;

  /**
   * The URL of the server to connect to. If not provided, the client will not connect to a server.
   */
  serverUrl?: string;
  /**
   * @deprecated use `schema` instead
   */
  migrations?: Migration[];
  syncSchema?: boolean;
  transport?: SyncTransport;
  /**
   * Variables to initialized the database with. Read more about variables {@link https://www.triplit.dev/docs/client/query/variables | here }
   */
  variables?: Record<string, any>;
  clientId?: string;

  /**
   * The storage for the client cache. Can be `memory`, `indexeddb` or an object with `cache` and `outbox` properties. Defaults to `memory`. Read more about storage {@link https://www.triplit.dev/docs/client/storage | here }
   */
  storage?: StorageOptions;

  /**
   * Default options for fetch queries. Read more about fetch options {@link https://www.triplit.dev/docs/client/fetch#policy | here }
   */
  defaultQueryOptions?: {
    fetch?: FetchOptions;
    subscription?: SubscriptionOptions;
  };

  /**
   * Whether the client should automatically connect to the server on initialization.
   */
  autoConnect?: boolean;
  logger?: Logger;

  /**
   * The log level for the client.
   * - `info`: Logs all messages
   * - `warn`: Logs warnings and errors
   * - `error`: Logs errors
   * - `debug`: Logs all messages and additional debug information
   */
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

  /**
   * @deprecated use `http` instead
   */
  remote: HttpClient<M>;
  http: HttpClient<M>;

  private defaultFetchOptions: {
    fetch: FetchOptions;
  };
  logger: Logger;
  /**
   * Logs are only stored in `debug` mode
   */
  readonly logs: any[] = [];
  /**
   *
   * @param options - The {@link ClientOptions | options} for the client
   */
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
    const dbSchema = schema ? { collections: schema, version: 0 } : undefined;
    this.db = new DB<M>({
      clock,
      schema: dbSchema,
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

    this.http = this.remote = new HttpClient<M>({
      serverUrl,
      token,
      schemaFactory: async () => (await this.db.getSchema())?.collections as M,
    });
    this.db.onSchemaChange((schema) => {
      this.http.updateOptions({ schema: schema?.collections });
    });

    if (this.authOptions.token) {
      syncOptions.token = this.authOptions.token;
      const userId = getUserId(
        this.authOptions.token,
        this.authOptions.claimsPath
      );
      this.db = this.db.withSessionVars({ SESSION_USER_ID: userId });
    }

    this.syncEngine = new SyncEngine(this, syncOptions);
    // Look into how calling connect / disconnect early is handled
    this.db.ready.then(() => {
      if (autoConnect) this.syncEngine.connect();
    });
  }

  /**
   * Gets the schema of the database
   *
   * @returns The schema of the database as a JSON object
   */
  async getSchema(): Promise<SchemaJSON | undefined> {
    return schemaToJSON(await this.db.getSchema());
  }

  /**
   * Run a transaction with the client.
   *
   * @param callback - The callback to run within the transaction
   * @returns An object with the transaction ID and the output of the transaction
   */
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

  /**
   * Initializes a query builder for a collection. Chain methods such as `where`, `order`, `limit`, etc. to build a query.
   *
   * @param collectionName - The name of the collection to query
   * @returns A query builder for the collection
   */
  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): ReturnType<typeof clientQueryBuilder<M, CN>> {
    return clientQueryBuilder<M, CN>(collectionName);
  }

  /**
   * Fetches data from the database.
   *
   * @param query - The query to fetch
   * @param options - The fetch options
   * @param options.policy - The fetch policy to use. Determines if the operation will retrieve data from the cache and/or the server. Defaults to `local-first`.
   * @returns The fetched data as a map of entities
   */
  async fetch<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<Unalias<ClientFetchResult<CQ>>> {
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
  ): Promise<Unalias<ClientFetchResult<CQ>>> {
    const scope = parseScope(query);
    this.logger.debug('fetchLocal START', query, scope);
    const res = await this.db.fetch(query, {
      scope,
      skipRules: SKIP_RULES,
      ...(options ?? {}),
    });
    this.logger.debug('fetchLocal END', res);
    return res;
  }

  /**
   * Fetches a single entity by its id from the database.
   *
   * @param collectionName - The name of the collection to fetch from
   * @param id - The id of the entity to fetch
   * @param options - The fetch options
   * @returns The fetched entity or null if it does not exist
   */
  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options?: Partial<FetchOptions>
  ): Promise<Unalias<
    ClientFetchResultEntity<ClientQueryDefault<M, CN>>
  > | null> {
    this.logger.debug('fetchById START', collectionName, id, options);
    const query = this.query(collectionName).id(id).build();
    const result = await this.fetchOne(query, options);
    this.logger.debug('fetchById END', collectionName, id, options);
    return result;
  }

  /**
   * Clears the local database of the client. Does not affect the server.
   *
   * @param options - The clear options
   * - `full`: If true, clears the entire database. If false, only clears your application data. Defaults to `false`.
   * @returns a promise that resolves when the database has been cleared
   */
  clear(options: { full?: boolean } = {}) {
    return this.db.clear(options);
  }

  /**
   * Fetches the first entity in the database that matches the query.
   *
   * @param query - The query to fetch
   * @param options - The fetch options
   * @returns The fetched entity or null if it does not exist
   */
  async fetchOne<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: Partial<FetchOptions>
  ): Promise<Unalias<ClientFetchResultEntity<CQ>> | null> {
    // ID is currently used to trace the lifecycle of a query/subscription across logs
    // @ts-ignore
    query = addLoggingIdToQuery(query);
    query = { ...query, limit: 1 };
    const result = await this.fetch(query, options);
    const entity = [...result.values()][0];
    if (!entity) return null;
    return entity;
  }

  /**
   * Inserts an entity into the database.
   *
   * @param collectionName - The name of the collection to insert into
   * @param object - The entity to insert
   * @returns The transaction ID and the inserted entity, if successful
   */
  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: Unalias<InsertTypeFromModel<ModelFromModels<M, CN>>>
  ): Promise<{
    txId: string | undefined;
    output:
      | Unalias<ClientFetchResultEntity<ClientQueryDefault<M, CN>>>
      | undefined;
  }> {
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

  /**
   * Updates an entity in the database.
   *
   * @param collectionName - The name of the collection to update
   * @param entityId - The id of the entity to update
   * @param updater - A function that provides the current entity and allows you to modify it
   * @returns The transaction ID
   */
  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: Unalias<UpdateTypeFromModel<ModelFromModels<M, CN>>>
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

  /**
   * Deletes an entity from the database.
   *
   * @param collectionName - The name of the collection to delete from
   * @param entityId - The id of the entity to delete
   * @returns The transaction ID
   */
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
  /**
   * Subscribes to a client query and receives the results asynchronously.
   *
   * @param query - The client query to subscribe to.
   * @param onResults - The callback function to handle the results of the subscription.
   * @param onError - The callback function to handle any errors that occur during the subscription.
   * @param options - The options for the subscription.
   * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
   * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled.
   * @returns - A function that can be called to unsubscribe from the subscription.
   */
  subscribe<CQ extends ClientQuery<M, any, any, any>>(
    query: CQ,
    onResults: (
      results: Unalias<ClientFetchResult<CQ>>,
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
            onResults(results, {
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
    let results: Unalias<FetchResult<CQ>>;
    const userResultsCallback = onResults;
    const userErrorCallback = onError;
    onResults = (results, info) => {
      // Ensure we dont re-fire the callback if we've already unsubscribed
      if (unsubscribed) return;
      userResultsCallback(results, info);
    };
    onError = userErrorCallback
      ? (error) => {
          // Ensure we dont re-fire the callback if we've already unsubscribed
          if (unsubscribed) return;
          userErrorCallback(error);
        }
      : undefined;
    const clientSubscriptionCallback = (
      newResults: Unalias<FetchResult<CQ>>
    ) => {
      results = newResults;
      this.logger.debug('subscribe RESULTS', results);
      onResults(results, { hasRemoteFulfilled });
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
          clientSubscriptionCallback(results);
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
   * @param query - The query, which should have a `limit`, to subscribe to.
   * @param onResults - The callback function to handle the results of the subscription.
   * @param onError - The callback function to handle any errors that occur during the subscription.
   * @param options - The options for the subscription.
   * @returns An object containing functions that can be called to unsubscribe from the subscription and query the previous and next pages.
   */
  subscribeWithPagination<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: Unalias<ClientFetchResult<CQ>>,
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
      query = { ...query };
      // If we have an after, the limit will increase by 1
      query.limit = requestedLimit! + 1 + (query.after ? 1 : 0);
      subscriptionResultHandler = (
        results: Unalias<ClientFetchResult<CQ>>,
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
          onResults(new Map(entries), {
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

  /**
   * Subscribes to a client query with the ability to expand size of the results.
   *
   * @param query - The query, which should have a `limit` set, to subscribe to.
   * @param onResults - The callback function to handle the query results.
   * @param onError - The callback function to handle any errors that occur during the subscription.
   * @param options - The options for the subscription.
   * @returns An object containing functions to load more data and to unsubscribe from the subscription.
   */
  subscribeWithExpand<CQ extends ClientQuery<M, any>>(
    query: CQ,
    onResults: (
      results: Unalias<ClientFetchResult<CQ>>,
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
      query = { ...query };
      query.limit = query.limit! + 1;
      subscriptionResultHandler = (
        results: Unalias<ClientFetchResult<CQ>>,
        info: { hasRemoteFulfilled: boolean }
      ) => {
        const hasMore = results.size >= query.limit!;
        let entries = Array.from(results.entries());
        if (hasMore) entries = entries.slice(0, -1);
        onResults(new Map(entries), {
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
  /**
   * Updates the `token` and/or `serverUrl` of the client. This will cause the client to close its current connection to the server and attempt reopen a new one with the provided options.
   *
   * @param options - The options to update the client with
   */
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

      this.db = this.db.withSessionVars({ SESSION_USER_ID: userId });

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
      this.http.updateOptions(updatedSyncOptions);
    }
  }

  /**
   * Updates the `token` of the client. This will cause the client to close its current connection to the server and attempt reopen a new one with the provided token.
   *
   * @param token
   */
  updateToken(token: string | undefined) {
    this.updateOptions({ token });
  }

  /**
   * Updates the `serverUrl` of the client. This will cause the client to close its current connection to the server and attempt reopen a new one with the provided server URL.
   *
   * @param serverUrl
   */
  updateServerUrl(serverUrl: string | undefined) {
    this.updateOptions({ serverUrl });
  }

  /**
   * When a transaction has been confirmed by the remote database, the callback will be called
   * @param txId
   * @param callback
   * @returns a function removing the listener callback
   */
  onTxCommitRemote(...args: Parameters<typeof this.syncEngine.onTxCommit>) {
    return this.syncEngine.onTxCommit(...args);
  }

  /**
   * If a transaction fails to commit on the remote database, the callback will be called
   * @param txId
   * @param callback
   * @returns a function removing the listener callback
   */
  onTxFailureRemote(txId: string, callback: () => void) {
    return this.syncEngine.onTxFailure(txId, callback);
  }

  /**
   * Sets up a listener for connection status changes
   * @param callback A callback that will be called when the connection status changes
   * @param runImmediately Run the callback immediately with the current connection status
   * @returns A function that removes the callback from the connection status change listeners
   */
  onConnectionStatusChange(
    ...args: Parameters<typeof this.syncEngine.onConnectionStatusChange>
  ) {
    return this.syncEngine.onConnectionStatusChange(...args);
  }

  /**
   * Attempts to connect the client to the server. This will start the client syncing data with the server.
   */
  connect() {
    return this.syncEngine.connect();
  }

  /**
   * Disconnects the client from the server. This will stop the client from syncing data with the server.
   */
  disconnect() {
    return this.syncEngine.disconnect();
  }

  /**
   * The token used to authenticate with the server
   */
  get token() {
    return this.syncEngine.token;
  }

  onSyncMessageReceived(
    ...args: Parameters<typeof this.syncEngine.onSyncMessageReceived>
  ) {
    return this.syncEngine.onSyncMessageReceived(...args);
  }
  onSyncMessageSent(
    ...args: Parameters<typeof this.syncEngine.onSyncMessageSent>
  ) {
    return this.syncEngine.onSyncMessageSent(...args);
  }

  /**
   * Retry sending a transaction to the remote database. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.
   * @param txId
   */
  retry(...args: Parameters<typeof this.syncEngine.retry>) {
    return this.syncEngine.retry(...args);
  }

  /**
   * Rollback a transaction from the client database. It will no longer be sent to the remote database as a part of the syncing process. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.
   * @param txIds
   */
  rollback(...args: Parameters<typeof this.syncEngine.rollback>) {
    return this.syncEngine.rollback(...args);
  }

  /**
   * The connection status of the client with the server
   */
  get connectionStatus() {
    return this.syncEngine.connectionStatus;
  }

  isFirstTimeFetchingQuery(
    ...args: Parameters<typeof this.syncEngine.isFirstTimeFetchingQuery>
  ) {
    return this.syncEngine.isFirstTimeFetchingQuery(...args);
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
