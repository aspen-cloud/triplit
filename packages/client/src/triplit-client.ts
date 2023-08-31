import {
  DB,
  MemoryStorage,
  Migration,
  CollectionQuery,
  Builder,
  toBuilder,
  CachedIndexedDbStorage as IndexedDbStorage,
  Query,
  JSONTypeFromModel,
  ProxyTypeFromModel,
  Model,
  Models,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
  FetchResult,
  DurableClock,
  TriplitError,
  constructEntities,
  timestampedObjectToPlainObject,
  stripCollectionFromId,
} from '@triplit/db';
import { Subject } from 'rxjs';
import { getUserId } from './token';
import { ConnectionStatus, friendlyReadyState } from './websocket';
import {
  MissingConnectionInformationError,
  RemoteFetchFailedError,
  RemoteSyncFailedError,
  UnrecognizedFetchPolicyError,
} from './errors';
export { IndexedDbStorage, MemoryStorage };
type Storage = IndexedDbStorage | MemoryStorage;

interface SyncOptions {
  server?: string;
  apiKey?: string;
  secure?: boolean;
}

// Not totally sold on passing in the token here, but it felt awkward to have it in the sync options since its also relevant to the database
interface AuthOptions {
  claimsPath?: string;
  token?: string;
}

function throttle(callback: () => void, delay: number) {
  let wait = false;
  let refire = false;
  function refireOrReset() {
    if (refire) {
      callback();
      refire = false;
      setTimeout(refireOrReset, delay);
    } else {
      wait = false;
    }
  }
  return function () {
    if (!wait) {
      callback();
      wait = true;
      setTimeout(refireOrReset, delay);
    } else {
      refire = true;
    }
  };
}

const txCommits$ = new Subject<string>();
const txFailures$ = new Subject<{ txId: string; error: unknown }>();

class SyncEngine {
  // @ts-ignore
  private conn: WebSocket;

  private queries: Map<string, { params: CollectionQuery<any> }> = new Map();

  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;

  private db: DB<any>;
  private syncOptions: SyncOptions;

  private connectionChangeHandlers: Set<
    (status: ConnectionStatus | undefined) => void
  > = new Set();

  constructor(options: SyncOptions, db: DB<any>) {
    this.syncOptions = options;
    this.syncOptions.secure = options.secure ?? true;
    this.db = db;
    txCommits$.subscribe((txId) => {
      const callbacks = this.commitCallbacks.get(txId);
      if (callbacks) {
        for (const callback of callbacks) {
          callback();
        }
        this.commitCallbacks.delete(txId);
        this.failureCallbacks.delete(txId);
      }
    });
    txFailures$.subscribe(({ txId, error }) => {
      const callbacks = this.failureCallbacks.get(txId);
      if (callbacks) {
        for (const callback of callbacks) {
          callback(error);
        }
      }
    });
    this.initialize();
  }

  get token() {
    return this.syncOptions.apiKey;
  }

  // @ts-ignore
  private get httpUri() {
    return this.syncOptions.server
      ? `${this.syncOptions.secure ? 'https' : 'http'}://${
          this.syncOptions.server
        }`
      : undefined;
  }

  private async getWsURI() {
    const { secure: isSecure, apiKey, server } = this.syncOptions;
    if (!server || !apiKey) {
      console.warn(
        'Both a server and apiKey are required to sync. Skipping sync connection.'
      );
      return undefined;
    }
    const wsOptions = new URLSearchParams();
    const schemaVersion = (await this.db.getSchema())?.version;
    if (schemaVersion) {
      wsOptions.set('version', schemaVersion.toString());
    }
    wsOptions.set('client', await this.db.getClientId());
    wsOptions.set('token', apiKey);
    return `${isSecure ? 'wss' : 'ws'}://${server}?${wsOptions.toString()}`;
  }

  private initialize() {
    this.connect();

    // Browser: on network connection / disconnection, connect / disconnect ws
    if (typeof window !== 'undefined') {
      const connectionHandler = this.connect.bind(this);
      window.addEventListener('online', connectionHandler);
      const disconnectHandler = this.closeConnection.bind(this);
      window.addEventListener('offline', () =>
        disconnectHandler(
          1000,
          JSON.stringify({ type: 'NETWORK_OFFLINE', retry: false })
        )
      );
    }

    const throttledSignal = throttle(() => this.signalOutboxTriples(), 100);

    this.db.tripleStore.setStorageScope(['outbox']).onInsert((triples) => {
      if (triples.length === 0) return;
      throttledSignal();
    });
  }

  subscribe(params: CollectionQuery<any>) {
    let id = Date.now().toString(36) + Math.random().toString(36).slice(2); // unique enough id
    this.sendMessage('CONNECT_QUERY', { id, params });
    this.queries.set(id, { params });
    return () => {
      this.disconnectQuery(id);
    };
  }

  disconnectQuery(id: string) {
    this.sendMessage('DISCONNECT_QUERY', { id });
    this.queries.delete(id);
  }

  private commitCallbacks: Map<string, Set<() => void>> = new Map();
  private failureCallbacks: Map<string, Set<(e: unknown) => void>> = new Map();

  onTxCommit(txId: string, callback: () => void) {
    this.commitCallbacks.has(txId)
      ? this.commitCallbacks.get(txId)?.add(callback)
      : this.commitCallbacks.set(txId, new Set([callback]));
    return () => this.commitCallbacks.get(txId)?.delete(callback);
  }

  onTxFailure(txId: string, callback: (e: unknown) => void) {
    this.failureCallbacks.has(txId)
      ? this.failureCallbacks.get(txId)?.add(callback)
      : this.failureCallbacks.set(txId, new Set([callback]));
    return () => this.failureCallbacks.get(txId)?.delete(callback);
  }

  private async signalOutboxTriples() {
    this.sendMessage('TRIPLES_PENDING', {});
  }

  private get isOpen() {
    return this.conn && this.conn.readyState === this.conn.OPEN;
  }

  private sendMessage(type: string, payload: any) {
    // For now, skip sending messages if we're not connected. I dont think we need a queue yet.
    if (!this.isOpen) {
      console.log('skipping', type, payload);
      return;
    }
    this.conn.send(JSON.stringify({ type, payload }));
  }

  async connect() {
    this.closeConnection(
      1000,
      JSON.stringify({ type: 'CONNECTION_OVERRIDE', retry: false })
    );
    const wsUri = await this.getWsURI();
    if (!wsUri) return;
    this.conn = new WebSocket(wsUri);
    this.conn.onmessage = async (evt) => {
      const message = JSON.parse(evt.data);
      if (message.type === 'ERROR') {
        await this.handleErrorMessage(message);
      }
      if (message.type === 'TRIPLES') {
        const { payload } = message;
        const triples = payload.triples;
        if (triples.length === 0) return;
        await this.db.tripleStore
          .setStorageScope(['cache'])
          .insertTriples(triples);
      }

      if (message.type === 'TRIPLES_ACK') {
        const { payload } = message;
        const { txIds } = payload;
        await this.db.tripleStore.transact(async (tx) => {
          const outboxOperator = tx.withScope({
            read: ['outbox'],
            write: ['outbox'],
          });
          const cacheOperator = tx.withScope({
            read: ['cache'],
            write: ['cache'],
          });
          // move all commited outbox triples to cache
          for (const clientTxId of txIds) {
            const timestamp = JSON.parse(clientTxId);
            const triplesToEvict = await outboxOperator.findByClientTimestamp(
              await this.db.getClientId(),
              'eq',
              timestamp
            );
            if (triplesToEvict.length > 0) {
              await cacheOperator.insertTriples(triplesToEvict);
              await outboxOperator.deleteTriples(triplesToEvict);
            }
          }

          // For now just flush outbox
          const triplesToSend = await outboxOperator.findByEntity();
          if (triplesToSend.length > 0) {
            this.sendMessage('TRIPLES', { triples: triplesToSend });
          }
        });
        for (const txId of txIds) {
          txCommits$.next(txId);
        }
      }

      if (message.type === 'TRIPLES_REQUEST') {
        const triplesToSend = await this.db.tripleStore
          .setStorageScope(['outbox'])
          .findByEntity();
        if (triplesToSend.length > 0) {
          this.sendMessage('TRIPLES', { triples: triplesToSend });
        }
      }
    };
    this.conn.onopen = (ev) => {
      console.log('open ws', ev);
      this.resetReconnectTimeout();

      // Reconnect any queries
      for (const [id, queryInfo] of this.queries) {
        this.sendMessage('CONNECT_QUERY', { id, params: queryInfo.params });
      }
    };
    this.conn.onclose = (ev) => {
      if (ev.reason) {
        const { type, retry } = JSON.parse(ev.reason);
        if (type === 'MIGRATION_REQUIRED') {
          console.error(
            'The server has closed the connection because the client schema is out of date. Please update your client schema.'
          );
        }
        if (!retry) {
          // early return to prevent reconnect
          return;
        }
      }
      // Attempt to reconnect with backoff
      const connectionHandler = this.connect.bind(this);
      this.reconnectTimeout = setTimeout(
        connectionHandler,
        this.reconnectTimeoutDelay
      );
      this.reconnectTimeoutDelay = Math.min(
        30000,
        this.reconnectTimeoutDelay * 2
      );
    };
    this.conn.onerror = (ev) => {
      // console.log('error ws', ev);
      console.error(ev);
      // on error, close the connection and attempt to reconnect
      this.conn.close();
    };

    // NOTE: this comes from proxy in websocket.ts
    this.conn.onconnectionchange = (state) => {
      for (const handler of this.connectionChangeHandlers) {
        handler(state);
      }
    };
  }

  updateConnection(options: Partial<SyncOptions>) {
    this.disconnect();
    this.syncOptions = { ...this.syncOptions, ...options };
    this.connect();
  }

  disconnect() {
    this.closeConnection(
      1000,
      JSON.stringify({ type: 'MANUAL_DISCONNECT', retry: false })
    );
  }

  get connectionStatus() {
    return this.conn ? friendlyReadyState(this.conn) : undefined;
  }

  private async handleErrorMessage(message: any) {
    const { error, metadata } = message.payload;
    switch (error.name) {
      case 'MalformedMessagePayloadError':
      case 'UnrecognizedMessageTypeError':
        console.warn(
          'You sent a malformed message to the server. This might occur if your client is not up to date with the server. Please ensure your client is updated.'
        );
        // TODO: If the message that fails is a triple insert, we should handle that specifically depending on the case
        break;
      case 'TriplesInsertError':
        const failures = metadata?.failures ?? [];
        for (const failure of failures) {
          const { txId, error } = failure;
          txFailures$.next({ txId, error });
        }
      // On a remote read error, default to disconnecting the query
      // You will still send triples, but you wont receive updates
      case 'QuerySyncError':
        const queryKey = metadata?.queryKey;
        if (queryKey) this.disconnectQuery(queryKey);
    }
  }

  async retry(txId: string) {
    const timestamp = JSON.parse(txId);
    const triplesToSend = await this.db.tripleStore
      .setStorageScope(['outbox'])
      .findByClientTimestamp(await this.db.getClientId(), 'eq', timestamp);
    if (triplesToSend.length > 0)
      this.sendMessage('TRIPLES', { triples: triplesToSend });
  }

  async rollback(txIds: string | string[]) {
    const txIdList = Array.isArray(txIds) ? txIds : [txIds];
    await this.db.transact(async (tx) => {
      const scopedTx = tx.storeTx.withScope({
        read: ['outbox'],
        write: ['outbox'],
      });
      for (const txId of txIdList) {
        const timestamp = JSON.parse(txId);
        const triples = await scopedTx.findByClientTimestamp(
          await this.db.getClientId(),
          'eq',
          timestamp
        );
        await scopedTx.deleteTriples(triples);
      }
    });
  }

  onConnectionStatusChange(
    callback: (status: ConnectionStatus | undefined) => void,
    runImmediately: boolean = false
  ) {
    this.connectionChangeHandlers.add(callback);
    if (runImmediately) callback(this.connectionStatus);
    return () => this.connectionChangeHandlers.delete(callback);
  }

  private closeConnection(
    code?: number | undefined,
    reason?: string | undefined
  ) {
    if (this.conn) this.conn.close(code, reason);
  }

  private resetReconnectTimeout() {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeoutDelay = 250;
  }

  async syncQuery(query: ClientQuery<any>) {
    try {
      const triples = await this.getRemoteTriples(query);
      await this.db.tripleStore
        .setStorageScope(['cache'])
        .insertTriples(triples);
    } catch (e) {
      if (e instanceof TriplitError) throw e;
      if (e instanceof Error) throw new RemoteSyncFailedError(query, e.message);
      throw new RemoteSyncFailedError(query, 'An unknown error occurred.');
    }
  }

  async fetchQuery<CQ extends ClientQuery<any>>(query: CQ) {
    try {
      // Simpler to serialize triples and reconstruct entities on the client
      // TODO: set up a method that handles this (triples --> friendly entity)
      const triples = await this.getRemoteTriples(query);
      const entities = constructEntities(triples);
      return new Map(
        [...entities].map(([id, entity]) => [
          stripCollectionFromId(id),
          timestampedObjectToPlainObject(entity),
        ])
      ) as FetchResult<CQ>;
    } catch (e) {
      if (e instanceof TriplitError) throw e;
      if (e instanceof Error)
        throw new RemoteFetchFailedError(query, e.message);
      throw new RemoteFetchFailedError(query, 'An unknown error occurred.');
    }
  }

  private async getRemoteTriples(query: ClientQuery<any>) {
    const res = await this.fetchFromServer(`/queryTriples`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      // TODO: add more context
      throw new RemoteFetchFailedError(query, res.statusText);
    }
    return await res.json();
  }

  private fetchFromServer(
    path: string,
    init?: RequestInit | undefined
  ): Promise<Response> {
    if (!this.httpUri || !this.token) {
      const messages = [];
      if (!this.httpUri) messages.push('No server specified.');
      if (!this.token) messages.push('No token specified.');
      throw new MissingConnectionInformationError(messages.join(' '));
    }
    return fetch(`${this.httpUri}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init?.headers },
    });
  }
}

interface DBOptions<M extends Models<any, any> | undefined> {
  // TODO: can probably pull in a type from @triplit/db
  schema?: { collections: NonNullable<M>; version?: number };
  migrations?: Migration[];
  variables?: Record<string, any>;
  storage?: {
    cache?: Storage;
    outbox?: Storage;
  };
  clientId?: string;
}

type SyncStatus = 'pending' | 'confirmed' | 'all';

export type ClientQuery<M extends Model<any> | undefined> =
  CollectionQuery<M> & {
    syncStatus?: SyncStatus;
  };

function ClientQueryBuilder<M extends Model<any> | undefined>(
  collectionName: string,
  params?: Query<M> & { syncStatus?: SyncStatus }
): ClientQueryBuilder<ClientQuery<M>> {
  return Builder<ClientQuery<M>, Omit<ClientQuery<M>, 'collectionName'>>({
    collectionName,
    ...params,
    where: params?.where ?? [],
    select: params?.select ?? [],
    syncStatus: params?.syncStatus ?? 'all',
  });
}

export type ClientQueryBuilder<CQ extends ClientQuery<any>> = toBuilder<
  CQ,
  Omit<CQ, 'collectionName'>
>;

function parseScope(query: ClientQuery<any>) {
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

type LocalFirstFetchOptions = {
  policy: 'local-first';
};
type LocalOnlyFetchOptions = {
  policy: 'local-only';
};
type RemoteFirstFetchOptions = {
  policy: 'remote-first';
};
type RemoteOnlyFetchOptions = {
  policy: 'remote-only';
};
type LocalAndRemoteFetchOptions = {
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
  | LocalFirstFetchOptions
  | LocalOnlyFetchOptions
  | RemoteFirstFetchOptions
  | LocalAndRemoteFetchOptions;

export interface ClientOptions<M extends Models<any, any> | undefined> {
  db?: DBOptions<M>;
  sync?: Omit<SyncOptions, 'apiKey'>;
  auth?: AuthOptions;
  defaultFetchOptions?: {
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
  syncEngine: SyncEngine;
  authOptions: AuthOptions;

  private defaultFetchOptions: {
    fetch: FetchOptions;
    subscription: SubscriptionOptions;
  };

  constructor(options?: ClientOptions<M>) {
    this.authOptions = options?.auth ?? {};
    this.db = new DB({
      clock: new DurableClock('cache', options?.db?.clientId),
      schema: options?.db?.schema,
      migrations: options?.db?.migrations,
      variables: options?.db?.variables,
      sources: {
        //@ts-ignore
        cache:
          options?.db?.storage?.cache ?? new IndexedDbStorage('triplit-cache'),
        //@ts-ignore
        outbox:
          options?.db?.storage?.outbox ??
          new IndexedDbStorage('triplit-outbox'),
      },
    });

    this.defaultFetchOptions = {
      fetch: DEFAULT_FETCH_OPTIONS,
      subscription: DEFAULT_FETCH_OPTIONS,
      ...options?.defaultFetchOptions,
    };

    const syncOptions: SyncOptions = options?.sync ?? {};
    if (this.authOptions.token) {
      syncOptions.apiKey = this.authOptions.token;
      const userId = getUserId(
        this.authOptions.token,
        this.authOptions.claimsPath
      );
      this.db.updateVariables({ SESSION_USER_ID: userId });
    }

    this.syncEngine = new SyncEngine(options?.sync ?? {}, this.db);
  }

  async transact(callback: (tx: DBTransaction<M>) => Promise<void>) {
    return this.db.transact(callback, {
      read: ['outbox', 'cache'],
      write: ['outbox'],
    });
  }

  // TODO: is this better done with generics?
  query<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    return ClientQueryBuilder<ModelFromModels<M, CN>>(collectionName as string);
  }

  async fetch<
    CN extends CollectionNameFromModels<M>,
    CQ extends ClientQuery<ModelFromModels<M, CN>>
  >(query: CQ, options?: FetchOptions) {
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

  private fetchLocal<
    CN extends CollectionNameFromModels<M>,
    CQ extends ClientQuery<ModelFromModels<M, CN>>
  >(query: CQ) {
    const scope = parseScope(query);
    return this.db.fetch(query, { scope, skipRules: true });
  }

  async fetchOne<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options?: FetchOptions
  ) {
    const query = this.query(collectionName).entityId(id).build();
    const results = await this.fetch(query, options);
    // TODO: fixup some type loss here..
    return results.get(id);
  }

  insert(
    collectionName: CollectionNameFromModels<M>,
    object: JSONTypeFromModel<M[typeof collectionName]>,
    id?: string
  ) {
    return this.db.insert(collectionName, object, id, {
      read: ['outbox', 'cache'],
      write: ['outbox'],
    });
  }

  update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: ProxyTypeFromModel<ModelFromModels<M, CN>>
    ) => Promise<void>
  ) {
    return this.db.update(collectionName, entityId, updater, {
      read: ['outbox', 'cache'],
      write: ['outbox'],
    });
  }

  // TODO: refactor so some logic is shared across policies (ex starting a local and remote sub is verbose and repetitive)
  subscribe<CQ extends ClientQuery<ModelFromModels<M>>>(
    query: CQ,
    onResults: (results: FetchResult<CQ>) => void,
    onError?: (error: any) => void,
    options?: SubscriptionOptions
  ) {
    const opts = options ?? this.defaultFetchOptions.subscription;

    const scope = parseScope(query);

    if (opts.policy === 'local-only') {
      try {
        return this.db.subscribe(query, onResults, onError, {
          scope,
          skipRules: true,
        });
      } catch (e) {
        if (onError) onError(e);
        else warnError(e);
        return () => {};
      }
    }

    if (opts.policy === 'local-first') {
      let cancel = false;
      let unsubscribeLocal = () => {};
      let unsubscribeRemote = () => {};
      // check cache first, if there are results, subscribe to local changes
      // size zero is a poor proxy
      this.fetchLocal(query).then((res) => {
        if (res.size > 0) {
          if (!cancel) {
            unsubscribeLocal = this.db.subscribe(query, onResults, onError, {
              scope,
              skipRules: true,
            });
            if (scope.includes('cache'))
              unsubscribeRemote = this.syncEngine.subscribe(query);
          }
        } else {
          this.syncEngine
            .syncQuery(query)
            .catch(warnError)
            .then(() => {
              if (!cancel) {
                unsubscribeLocal = this.db.subscribe(
                  query,
                  onResults,
                  onError,
                  {
                    scope,
                    skipRules: true,
                  }
                );
                if (scope.includes('cache'))
                  unsubscribeRemote = this.syncEngine.subscribe(query);
              }
            })
            .catch((e) => {
              if (onError) onError(e);
              else warnError(e);
            });
        }
      });
      return () => {
        cancel = true;
        unsubscribeLocal();
        unsubscribeRemote();
      };
    }

    if (opts.policy === 'remote-first') {
      let cancel = false;
      let unsubscribeLocal = () => {};
      let unsubscribeRemote = () => {};
      this.syncEngine
        .syncQuery(query)
        .catch(warnError)
        .then(() => {
          if (!cancel) {
            unsubscribeLocal = this.db.subscribe(query, onResults, onError, {
              scope,
              skipRules: true,
            });
            if (scope.includes('cache'))
              unsubscribeRemote = this.syncEngine.subscribe(query);
          }
        })
        .catch((e) => {
          if (onError) onError(e);
          else warnError(e);
        });

      return () => {
        cancel = true;
        unsubscribeLocal();
        unsubscribeRemote();
      };
    }

    if (opts.policy === 'local-and-remote') {
      let cancel = false;
      let unsubscribeLocal = () => {};
      let unsubscribeRemote = () => {};
      const timeout = opts.timeout || 0;
      Promise.race([
        this.syncEngine.syncQuery(query),
        new Promise((res) => setTimeout(res, timeout)),
      ])
        .catch(warnError)
        .then(() => {
          if (!cancel) {
            unsubscribeLocal = this.db.subscribe(query, onResults, onError, {
              scope,
              skipRules: true,
            });
            if (scope.includes('cache'))
              unsubscribeRemote = this.syncEngine.subscribe(query);
          }
        })
        .catch((e) => {
          if (onError) onError(e);
          else warnError(e);
        });

      return () => {
        cancel = true;
        unsubscribeLocal();
        unsubscribeRemote();
      };
    }
    throw new UnrecognizedFetchPolicyError(
      (opts as SubscriptionOptions).policy
    );
  }

  updateAuthOptions(options: Partial<AuthOptions>) {
    this.authOptions = { ...this.authOptions, ...options };
    if (options.hasOwnProperty('token')) {
      const { claimsPath, token } = this.authOptions;
      this.syncEngine.updateConnection({ apiKey: token });
      const userId = token ? getUserId(token, claimsPath) : undefined;
      this.db.updateVariables({ SESSION_USER_ID: userId });
    }
  }
}

function warnError(e: any) {
  if (e instanceof TriplitError) {
    console.warn(e.toJSON());
  } else {
    console.warn(e);
  }
}
