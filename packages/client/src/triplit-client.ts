import {
  DB,
  Migration,
  CollectionQuery,
  Builder,
  UpdateTypeFromModel,
  Models,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
  DurableClock,
  TriplitError,
  constructEntities,
  timestampedObjectToPlainObject,
  stripCollectionFromId,
  QUERY_INPUT_TRANSFORMERS,
  InsertTypeFromModel,
  hashSchemaJSON,
  TripleRow,
  schemaToJSON,
  ResultTypeFromModel,
  toBuilder,
  Storage,
  FetchResultEntity,
} from '@triplit/db';
import { Subject } from 'rxjs';
import { getUserId } from './token.js';
import { ConnectionStatus } from './websocket.js';
import {
  MissingConnectionInformationError,
  RemoteFetchFailedError,
  RemoteSyncFailedError,
  UnrecognizedFetchPolicyError,
} from './errors.js';
import { WebSocketTransport } from './websocket-transport.js';
import { ClientSyncMessage, ServerSyncMessage } from '@triplit/types/sync';
import { MemoryBTreeStorage } from '@triplit/db/storage/memory-btree';

/**
 * There is some odd behavior when using infer with intersection types
 * Our query types are set up as:
 * CollectionQuery<...> = Query<...> & { ... }
 * ClientQuery<...> = CollectionQuery<...> & { ... }
 *
 * However, if you attempt to infer the generic of a base object (ex. CollectionQuery<infer M>) with the intersected object (ClientQuery<any>) the inferred type M is overly generic
 *
 * Recreating the fetch result type here to avoid this issue
 * Playground: https://www.typescriptlang.org/play?#code/KYDwDg9gTgLgBDAnmYcCyEAmwA2BnAHgCg44BhCHHYAYxgEsIA7AOQEMBbVUGYJzPHDwwo9JgHMANCTgAVODz4C4AJVrRMBYaImShIseIB8RI3AC8q9VE0UqtBs3Zc9sowG4iRJCjgAhNjxgAjQFEF5+QQxsfAI2JkQ9eMQjPTIWMIjlAGtgRAgAM3QzSwBvGTYYEQBGAC50AG10gF1PAF8vH1QAUXClYE1QxUj0LFxCZKSE1PIM4Zy8wuKLf0DgtDSWMwAyOFLKkQAmeu1DNs9vZFRZYGFqgnl5wQCguISplJK5TKVntbfEnBkmYAPxwADkYECeHBcHq4IKbHoOHBni6cluMEODx+IxewUmQOmX0efTx-zEBWAUDgAFUPqC6XCIYjkajOlc4ABJJhgACu8EsvSyAwIpV4wnq+3hBQgEHBbTaenBEpg4I8HN8ajwfJwMGqKxudwIPP5MA16O1uqxhsx2NNAo8QA
 */
export type ClientFetchResult<C extends ClientQuery<any, any>> = Map<
  string,
  ClientFetchResultEntity<C>
>;

export type ClientFetchResultEntity<C extends ClientQuery<any, any>> =
  C extends ClientQuery<infer M, infer CN>
    ? ResultTypeFromModel<ModelFromModels<M, CN>>
    : never;

export type TransportConnectParams = {
  server?: string;
  secure?: boolean;
  apiKey?: string;
  clientId: string;
  schema?: number;
  syncSchema?: boolean;
};

export interface SyncTransport {
  isOpen: boolean;
  connectionStatus: ConnectionStatus | undefined;
  onOpen(callback: (ev: any) => void): void;
  sendMessage<Msg extends ClientSyncMessage>(
    type: Msg['type'],
    payload: Msg['payload']
  ): void;
  onMessage(callback: (message: any) => void): void;
  onError(callback: (ev: any) => void): void;
  connect(params: TransportConnectParams): void;
  close(code?: number, reason?: string): void;
  onClose(callback: (ev: any) => void): void;
  onConnectionChange(callback: (state: ConnectionStatus) => void): void;
}

export interface SyncOptions {
  server?: string;
  apiKey?: string;
  secure?: boolean;
  syncSchema?: boolean;
  transport?: SyncTransport;
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
  private transport: SyncTransport;

  private queries: Map<
    string,
    { params: CollectionQuery<any, any>; fulfilled: boolean }
  > = new Map();

  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;

  private db: DB<any>;
  private syncOptions: SyncOptions;

  private connectionChangeHandlers: Set<
    (status: ConnectionStatus | undefined) => void
  > = new Set();

  queryFulfillmentCallbacks: Map<string, (response: any) => void>;

  constructor(options: SyncOptions, db: DB<any>) {
    this.syncOptions = options;
    this.syncOptions.secure = options.secure ?? true;
    this.syncOptions.syncSchema = options.syncSchema ?? false;
    this.db = db;
    this.transport = options.transport ?? new WebSocketTransport();
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
    this.queryFulfillmentCallbacks = new Map();
    this.setupWindowListeners();
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

  async getConnectionParams(): Promise<TransportConnectParams> {
    const clientId = await this.db.getClientId();
    const schemaHash = hashSchemaJSON(
      schemaToJSON(await this.db.getSchema())?.collections
    );
    return {
      clientId,
      schema: schemaHash,
      syncSchema: this.syncOptions.syncSchema,
      apiKey: this.syncOptions.apiKey,
      server: this.syncOptions.server,
      secure: this.syncOptions.secure,
    };
  }

  private async setupWindowListeners() {
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

  subscribe(params: CollectionQuery<any, any>, onQueryFulfilled?: () => void) {
    let id = Date.now().toString(36) + Math.random().toString(36).slice(2); // unique enough id
    this.transport.sendMessage('CONNECT_QUERY', { id, params });
    this.queries.set(id, { params, fulfilled: false });
    this.onQueryFulfilled(id, () => {
      this.queries.set(id, { params, fulfilled: true });
      if (onQueryFulfilled) onQueryFulfilled();
    });
    return () => {
      this.disconnectQuery(id);
    };
  }

  onQueryFulfilled(queryId: string, callback: (response: any) => void) {
    this.queryFulfillmentCallbacks.set(queryId, callback);
  }

  hasQueryBeenFulfilled(queryId: string) {
    return this.queries.get(queryId)?.fulfilled ?? false;
  }

  disconnectQuery(id: string) {
    this.transport.sendMessage('DISCONNECT_QUERY', { id });
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

  // private async signalOutboxTriples() {
  //   // this.transport.sendMessage('TRIPLES_PENDING', {});
  //   return throttle(() => this.transport.sendMessage('TRIPLES_PENDING', {}), 100);
  // }

  private signalOutboxTriples() {
    this.transport.sendMessage('TRIPLES_PENDING', {});
  }

  async connect() {
    this.closeConnection(
      1000,
      JSON.stringify({ type: 'CONNECTION_OVERRIDE', retry: false })
    );
    const params = await this.getConnectionParams();
    this.transport.connect(params);
    this.transport.onMessage(async (evt) => {
      const message: ServerSyncMessage = JSON.parse(evt.data);
      if (message.type === 'ERROR') {
        await this.handleErrorMessage(message);
      }
      if (message.type === 'TRIPLES') {
        const { payload } = message;
        const triples = payload.triples;
        const queryIds = payload.forQueries;
        for (const qId of queryIds) {
          const callback = this.queryFulfillmentCallbacks.get(qId);
          if (callback) {
            callback(payload);
          }
          this.queryFulfillmentCallbacks.delete(qId);
        }
        if (triples.length !== 0) {
          await this.db.tripleStore
            .setStorageScope(['cache'])
            .insertTriples(triples);
        }
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
          this.sendTriples(triplesToSend);
        });
        for (const txId of txIds) {
          txCommits$.next(txId);
        }
      }

      if (message.type === 'TRIPLES_REQUEST') {
        const triplesToSend = await this.db.tripleStore
          .setStorageScope(['outbox'])
          .findByEntity();
        this.sendTriples(triplesToSend);
      }
    });
    this.transport.onOpen(() => {
      console.info('sync connection has opened');
      this.resetReconnectTimeout();
      this.signalOutboxTriples();
      // Reconnect any queries
      for (const [id, queryInfo] of this.queries) {
        this.transport.sendMessage('CONNECT_QUERY', {
          id,
          params: queryInfo.params,
        });
      }
    });

    this.transport.onClose((evt) => {
      if (evt.reason) {
        const { type, retry } = JSON.parse(evt.reason);
        if (type === 'SCHEMA_MISMATCH') {
          console.error(
            'The server has closed the connection because the client schema does not match the server schema. Please update your client schema.'
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
    });
    this.transport.onError((evt) => {
      // console.log('error ws', evt);
      console.error(evt);
      // on error, close the connection and attempt to reconnect
      this.transport.close();
    });

    // NOTE: this comes from proxy in websocket.ts
    this.transport.onConnectionChange((state: ConnectionStatus) => {
      for (const handler of this.connectionChangeHandlers) {
        handler(state);
      }
    });
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

  private sendTriples(triples: TripleRow[]) {
    const triplesToSend = this.syncOptions.syncSchema
      ? triples
      : triples.filter(({ id }) => !id.includes('_metadata#_schema'));
    if (triplesToSend.length === 0) return;
    this.transport.sendMessage('TRIPLES', { triples: triplesToSend });
  }

  async retry(txId: string) {
    const timestamp = JSON.parse(txId);
    const triplesToSend = await this.db.tripleStore
      .setStorageScope(['outbox'])
      .findByClientTimestamp(await this.db.getClientId(), 'eq', timestamp);
    if (triplesToSend.length > 0) this.sendTriples(triplesToSend);
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
    if (runImmediately) callback(this.transport.connectionStatus);
    return () => this.connectionChangeHandlers.delete(callback);
  }

  private closeConnection(
    code?: number | undefined,
    reason?: string | undefined
  ) {
    if (this.transport) this.transport.close(code, reason);
  }

  private resetReconnectTimeout() {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeoutDelay = 250;
  }

  async syncQuery(query: ClientQuery<any, any>) {
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

  async fetchQuery<CQ extends ClientQuery<any, any>>(query: CQ) {
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
      ) as ClientFetchResult<CQ>;
    } catch (e) {
      if (e instanceof TriplitError) throw e;
      if (e instanceof Error)
        throw new RemoteFetchFailedError(query, e.message);
      throw new RemoteFetchFailedError(query, 'An unknown error occurred.');
    }
  }

  private async getRemoteTriples(query: ClientQuery<any, any>) {
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

// Could probably make this an option if you want client side validation
const SKIP_RULES = true;

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

export type ClientQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = CollectionQuery<M, CN> & {
  syncStatus?: SyncStatus;
};

function ClientQueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  collectionName: CN,
  params?: Omit<ClientQuery<M, CN>, 'collectionName'>
): toBuilder<
  ClientQuery<M, CN>,
  'collectionName',
  QUERY_INPUT_TRANSFORMERS<ModelFromModels<M, CN>>
> {
  const query: ClientQuery<M, CN> = {
    collectionName,
    ...params,
    where: params?.where ?? [],
    select: params?.select ?? [],
    syncStatus: params?.syncStatus ?? 'all',
  };
  const transformers = QUERY_INPUT_TRANSFORMERS<ModelFromModels<M, CN>>();
  return Builder(query, {
    protectedFields: ['collectionName'],
    inputTransformers: transformers,
  });
}

export type ClientQueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = ReturnType<typeof ClientQueryBuilder<M, CN>>;

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
      migrations: options?.db?.migrations
        ? {
            definitions: options.db.migrations,
            scopes: ['cache'],
          }
        : undefined,
      variables: options?.db?.variables,
      sources: {
        //@ts-ignore
        cache: options?.db?.storage?.cache ?? new MemoryBTreeStorage(),
        //@ts-ignore
        outbox: options?.db?.storage?.outbox ?? new MemoryBTreeStorage(),
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
    this.db.ensureMigrated.then(() => {
      this.syncEngine.connect();
    });
  }

  async transact(callback: (tx: DBTransaction<M>) => Promise<void>) {
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

  async fetch<CQ extends ClientQuery<M, any>>(
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
    options?: FetchOptions
  ) {
    const query = this.query(collectionName).entityId(id).build();
    const results = await this.fetch(query, options);
    return results.get(id);
  }

  async fetchOne<CQ extends ClientQuery<M, any>>(
    query: CQ,
    options?: FetchOptions
  ) {
    query.limit = 1;
    const result = await this.fetch(query, options);
    const entry = [...result.entries()][0];
    if (!entry) return null;
    return entry;
  }

  insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    object: InsertTypeFromModel<ModelFromModels<M, CN>>,
    id?: string
  ) {
    return this.db.insert(collectionName, object, id, {
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
    ) => void,
    onError?: (error: any) => void,
    options?: SubscriptionOptions
  ) {
    const opts = options ?? this.defaultFetchOptions.subscription;

    const scope = parseScope(query);

    if (opts.policy === 'local-only') {
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

    // Hit cache first, then backfill with remote
    // If we introduce staleness maybe could add that here (sync remote before subscribing if stale)
    if (opts.policy === 'local-first') {
      let unsubscribeLocal = () => {};
      let unsubscribeRemote = () => {};
      let hasRemoteFulfilled = false;
      const clientSubscriptionCallback = (results: any) => {
        onResults(results as ClientFetchResult<CQ>, { hasRemoteFulfilled });
      };
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

    if (opts.policy === 'remote-first') {
      let cancel = false;
      let unsubscribeLocal = () => {};
      let unsubscribeRemote = () => {};
      this.syncEngine
        .syncQuery(query)
        .catch(warnError)
        .then(() => {
          if (!cancel) {
            unsubscribeLocal = this.db.subscribe(
              query,
              // @ts-ignore TODO: include hasRemoteFulfilled
              onResults,
              onError,
              {
                scope,
                skipRules: SKIP_RULES,
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
            unsubscribeLocal = this.db.subscribe(
              query,
              // @ts-ignore TODO: include hasRemoteFulfilled
              onResults,
              onError,
              {
                scope,
                skipRules: SKIP_RULES,
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
