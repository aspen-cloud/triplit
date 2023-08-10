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
  Model,
  Models,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
  FetchResult,
  DurableClock,
} from '@triplit/db';
import { Subject } from 'rxjs';
import { getUserId } from './token';

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

interface RemoteQueryParams extends Query<any> {
  collection: string;
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

  private queries: Map<string, RemoteQueryParams> = new Map();

  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;

  private db: DB<any>;
  private syncOptions: SyncOptions;

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

    // On network connection / disconnection, connect / disconnect ws
    const connectionHandler = this.connect.bind(this);
    window.addEventListener('online', connectionHandler);
    const disconnectHandler = this.closeConnection.bind(this);
    window.addEventListener('offline', () =>
      disconnectHandler(
        1000,
        JSON.stringify({ type: 'NETWORK_OFFLINE', retry: false })
      )
    );

    const throttledSignal = throttle(() => this.signalOutboxTriples(), 100);

    this.db.tripleStore.setStorageScope(['outbox']).onInsert((triples) => {
      if (triples.length === 0) return;
      throttledSignal();
    });
  }

  subscribe(params: RemoteQueryParams) {
    let id = Date.now().toString(36) + Math.random().toString(36).slice(2); // unique enough id
    this.sendMessage('CONNECT_QUERY', { id, params });
    this.queries.set(id, params);
    return () => {
      this.sendMessage('DISCONNECT_QUERY', { id });
      this.queries.delete(id);
    };
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
      for (const [id, params] of this.queries) {
        this.sendMessage('CONNECT_QUERY', { id, params });
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
    switch (this.conn?.readyState) {
      case this.conn?.OPEN:
        return 'OPEN';
      case this.conn?.CLOSING:
        return 'CLOSING';
      case this.conn?.CLOSED:
        return 'CLOSED';
      case this.conn?.CONNECTING:
        return 'CONNECTING';
      default:
        return 'UNKNOWN'; // Will hit this if you've never initialized a connection
    }
  }

  private async handleErrorMessage(message: any) {
    console.error(message);
    const { name, metadata } = message.payload;
    switch (name) {
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
}

interface DBOptions<M extends Models<any, any> | undefined> {
  schema?: { collections: M; version?: number };
  migrations?: Migration[];
  variables?: Record<string, any>;
  storage?: {
    cache?: Storage;
    outbox?: Storage;
  };
}

type SyncStatus = 'pending' | 'confirmed' | 'all';

export type ClientQuery<M extends Model<any> | undefined> =
  CollectionQuery<M> & {
    syncStatus?: SyncStatus;
  };

function ClientQueryBuilder<M extends Model<any> | undefined>(
  collectionName: string,
  schema?: M,
  params?: Query<M> & { syncStatus?: SyncStatus }
) {
  return Builder<ClientQuery<M>>({
    collectionName,
    schema,
    ...params,
    where: params?.where ?? [],
    select: params?.select ?? [],
    syncStatus: params?.syncStatus ?? 'all',
  });
}

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

export class TriplitClient<M extends Models<any, any> | undefined = undefined> {
  db: DB<M>;
  syncEngine: SyncEngine;
  authOptions: AuthOptions;

  constructor(options?: {
    db?: DBOptions<M>;
    sync?: Omit<SyncOptions, 'apiKey'>;
    auth?: AuthOptions;
  }) {
    this.authOptions = options?.auth ?? {};
    this.db = new DB({
      clock: new DurableClock('cache'),
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

  fetch(clientQueryBuilder: toBuilder<ClientQuery<ModelFromModels<M>>>) {
    const query = clientQueryBuilder.build();
    const scope = parseScope(query);
    return this.db.fetch(query, scope);
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
      entity: JSONTypeFromModel<ModelFromModels<M, CN>>
    ) => Promise<void>
  ) {
    return this.db.update(collectionName, entityId, updater, {
      read: ['outbox', 'cache'],
      write: ['outbox'],
    });
  }

  subscribe<CQ extends ClientQuery<ModelFromModels<M>>>(
    query: CQ,
    callback: (results: FetchResult<CQ>) => void
  ) {
    const scope = parseScope(query);
    const unsubscribeLocal = this.db.subscribe(
      query,
      (localResults) => {
        callback(localResults);
      },
      scope
    );
    const { select, where, collectionName, order, limit } = query;
    // TODO: do we need to pass along params arg from local query subscription?
    let unsubscribeRemote = scope.includes('cache')
      ? this.syncEngine.subscribe({
          collection: collectionName,
          select,
          where,
          order,
          limit,
        })
      : undefined;
    return () => {
      unsubscribeLocal();
      unsubscribeRemote && unsubscribeRemote();
    };
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
