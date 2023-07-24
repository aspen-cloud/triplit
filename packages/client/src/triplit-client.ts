import {
  DB,
  MemoryStorage,
  Migration,
  CollectionQuery,
  Builder,
  toBuilder,
  CachedIndexedDbStorage as IndexedDbStorage,
  Query,
  TripleRow,
  Schema,
  JSONTypeFromModel,
  Model,
  Models,
  TimestampedObject,
  UnTimestampedObject,
  CollectionNameFromModels,
  DBTransaction,
  ModelFromModels,
  Mutation,
  FetchResult,
  Timestamp,
  timestampCompare,
  DurableClock,
  IsAny,
} from '@triplit/db';

export { IndexedDbStorage, MemoryStorage };
type Storage = IndexedDbStorage | MemoryStorage;

interface SyncOptions {
  server: string;
  apiKey: string;
  secure?: boolean;
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

class SyncEngine {
  // @ts-ignore
  private conn: WebSocket;
  // @ts-ignore
  private httpUri: string;

  private queries: Set<RemoteQueryParams> = new Set();

  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;

  onTriplesMessage?: (triples: TripleRow[]) => void;

  private latestAware?: Timestamp;
  private latestSent?: Timestamp;

  private db: DB<any>;
  private syncOptions: SyncOptions;

  constructor(options: SyncOptions, db: DB<any>) {
    this.syncOptions = options;
    this.syncOptions.secure = options.secure ?? true;
    this.httpUri = `${this.syncOptions.secure ? 'https' : 'http'}://${
      this.syncOptions.server
    }`;
    this.db = db;
  }

  private async getWsURI() {
    const { secure: isSecure, apiKey, server } = this.syncOptions;
    const wsOptions = new URLSearchParams();
    const schemaVersion = (await this.db.getSchema(true))?.version;
    if (schemaVersion) {
      wsOptions.set('version', schemaVersion.toString());
    }
    wsOptions.set('client', await this.db.getClientId());
    wsOptions.set('token', apiKey);
    return `${isSecure ? 'wss' : 'ws'}://${server}?${wsOptions.toString()}`;
  }

  initialize() {
    this.connect();

    // On network connection / disconnection, connect / disconnect ws
    const connectionHandler = this.connect.bind(this);
    window.addEventListener('online', connectionHandler);
    const disconnectHandler = this.disconnect.bind(this);
    window.addEventListener('offline', disconnectHandler);

    const throttledSignal = throttle(() => this.signalOutboxTriples(), 100);

    this.db.tripleStore.setStorageScope(['outbox']).onInsert((triples) => {
      if (triples.length === 0) return;
      throttledSignal();
    });
  }

  subscribeToQuery(params: RemoteQueryParams) {
    this.sendMessage('CONNECT_QUERY', params);
    this.queries.add(params);
    return () => {
      this.sendMessage('DISCONNECT_QUERY', params);
      this.queries.delete(params);
    };
  }

  async signalOutboxTriples() {
    const maxTimestamp = await this.db.tripleStore
      .setStorageScope(['outbox'])
      .findMaxTimestamp(await this.db.getClientId());
    if (maxTimestamp) {
      this.sendMessage('TRIPLES_PENDING', { timestamp: maxTimestamp });
    }
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

  private async connect() {
    console.log('connecting');
    if (this.conn) this.conn.close();
    // this.conn = new WebSocket(this.wsUri, ['Bearer', this.apiKey]);
    const wsUri = await this.getWsURI();
    this.conn = new WebSocket(wsUri);
    this.conn.onmessage = async (evt) => {
      const message = JSON.parse(evt.data);
      if (message.type === 'ERROR') {
        this.handleErrorMessage(message);
      }
      // TODO: I think we need some initialization handling because that should (?) include triples this client has authored
      if (message.type === 'TRIPLES') {
        const { payload } = message;
        const triples = payload.triples;
        if (triples.length === 0) return;
        await this.db.tripleStore
          .setStorageScope(['cache'])
          .insertTriples(triples);
      }

      if (message.type === 'TRIPLES_REQUEST') {
        const { payload } = message;
        const {
          after: latestSyncedTimestamp,
        }: { after: Timestamp | undefined } = payload;
        await this.db.tripleStore.transact(async (tx) => {
          const outboxOperator = tx.withScope({
            read: ['outbox'],
            write: ['outbox'],
          });
          const cacheOperator = tx.withScope({
            read: ['cache'],
            write: ['cache'],
          });
          // move all outbox triples before timestamp to cache
          const triplesToEvict = latestSyncedTimestamp
            ? await outboxOperator.findByClientTimestamp(
                await this.db.getClientId(),
                'lte',
                latestSyncedTimestamp
              )
            : [];
          if (triplesToEvict.length > 0) {
            // TODO We should delete "older", irrelevant triples from the cache
            await cacheOperator.insertTriples(triplesToEvict);
            await outboxOperator.deleteTriples(triplesToEvict);
          }

          // Keep track of the latestAware timestamp because we might need it to rollback last sent
          this.latestAware =
            timestampCompare(latestSyncedTimestamp, this.latestAware) > 0
              ? latestSyncedTimestamp
              : this.latestAware;

          // if we've already sent these triples, return early and dont send
          // TODO: should think through if this is safe or should be refactored
          if (
            this.latestSent &&
            timestampCompare(latestSyncedTimestamp, this.latestSent) === -1
          ) {
            // ignore message because we've already sent these triples
            return;
          }

          // send all triples in storage after timestamp
          const triplesToSend = await outboxOperator.findByClientTimestamp(
            await this.db.getClientId(),
            'gt',
            latestSyncedTimestamp
          );
          if (triplesToSend.length > 0) {
            this.sendMessage('TRIPLES', { triples: triplesToSend });
            const latestMessageTimestamp =
              triplesToSend[triplesToSend.length - 1].timestamp;
            this.latestSent =
              timestampCompare(latestMessageTimestamp, this.latestSent) > 0
                ? latestMessageTimestamp
                : this.latestSent;
          }
        });
      }
    };
    this.conn.onopen = (ev) => {
      console.log('open ws', ev);
      this.resetReconnectTimeout();

      // Reconnect any queries
      for (const query of this.queries) {
        this.sendMessage('CONNECT_QUERY', query);
      }
    };
    this.conn.onclose = (ev) => {
      // In case messages failed to send, reset latestSent to latestAware
      this.latestSent = this.latestAware;
      if (ev.reason) {
        const { type } = JSON.parse(ev.reason);
        if (type === 'MIGRATION_REQUIRED') {
          console.error('MIGRATION_REQUIRED');
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

  private handleErrorMessage(message: any) {
    const { code, metadata } = message.payload;
    switch (code) {
      case 'TRIPLES_INSERT_FAILED':
      default:
        this.rollbackTriples(metadata?.triples ?? []);
    }
  }

  private rollbackTriples(triples: TripleRow[]) {
    this.db.tripleStore.setStorageScope(['outbox']).deleteTriples(triples);
    this.rollbackListeners.forEach((listener) => listener());
  }

  private rollbackListeners: Set<() => void> = new Set();
  addRollbackListener(listener: () => void) {
    this.rollbackListeners.add(listener);
  }
  removeRollbackListener(listener: () => void) {
    this.rollbackListeners.delete(listener);
  }

  private disconnect() {
    this.conn.close();
  }

  private resetReconnectTimeout() {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeoutDelay = 250;
  }
}

export type QueryResults<CQ extends CollectionQuery<any>> =
  FetchResult<CQ> extends Map<string, infer O>
    ? IsAny<O> extends true
      ? Map<string, any>
      : O extends TimestampedObject
      ? Map<string, UnTimestampedObject<O>>
      : Map<string, never>
    : never;

interface DBOptions<M extends Models<any, any> | undefined> {
  schema?: M;
  migrations?: Migration[];
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
  private syncEngine?: SyncEngine;

  constructor(options?: { db?: DBOptions<M>; sync?: SyncOptions }) {
    this.db = new DB({
      clock: new DurableClock('cache'),
      schema: options?.db?.schema,
      migrations: options?.db?.migrations,
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

    if (!!options?.sync) {
      this.syncEngine = new SyncEngine(options?.sync, this.db);
      this.syncEngine.initialize();
    }
  }

  async transact(callback: (tx: DBTransaction<M>) => Promise<void>) {
    await this.db.transact(callback, {
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
    updater: (mutation: Mutation<ModelFromModels<M, CN>>) => Promise<void>
  ) {
    return this.db.update(collectionName, entityId, updater, {
      read: ['outbox', 'cache'],
      write: ['outbox'],
    });
  }

  subscribe<CQ extends ClientQuery<ModelFromModels<M>>>(
    query: CQ,
    callback: (results: QueryResults<CQ>) => void
  ) {
    const scope = parseScope(query);
    const rollbackListener = async () => {
      const results = await this.db.fetch(query, scope);
      // @ts-ignore TODO: fix this along with other issues with fetch()
      callback(results);
    };
    if (this.syncEngine) {
      this.syncEngine.addRollbackListener(rollbackListener);
    }
    const unsubscribeLocal = this.db.subscribe(
      query,
      (localResults) => {
        // TODO have this happen cleanly in the database level
        const jsonResults = new Map(
          Array.from(localResults.entries()).map(([key, val]) => [
            key,
            Schema.timestampedObjectToPlainObject(val),
          ])
        );
        // @ts-ignore TS not accepting conditional type
        callback(jsonResults);
      },
      scope
    );
    const { select, where, collectionName, order, limit } = query;
    // TODO: do we need to pass along params arg from local query subscription?
    let unsubscribeRemote =
      !!this.syncEngine && scope.includes('cache')
        ? this.syncEngine.subscribeToQuery({
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
      this.syncEngine &&
        this.syncEngine.removeRollbackListener(rollbackListener);
    };
  }
}
