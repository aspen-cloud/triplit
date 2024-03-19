import DB, {
  CollectionQuery,
  TripleRow,
  TriplitError,
  constructEntities,
  hashSchemaJSON,
  schemaToJSON,
  stripCollectionFromId,
  convertEntityToJS,
  Timestamp,
} from '@triplit/db';
import { Logger, SyncOptions } from './triplit-client.js';
import { Subject } from 'rxjs';
import {
  ConnectionStatus,
  SyncTransport,
  TransportConnectParams,
} from './transport/transport.js';
import { WebSocketTransport } from './transport/websocket-transport.js';
import {
  ClientSyncMessage,
  CloseReason,
  ServerSyncMessage,
} from '@triplit/types/sync';
import {
  MissingConnectionInformationError,
  RemoteFetchFailedError,
  RemoteSyncFailedError,
} from './errors.js';
import { Value } from '@sinclair/typebox/value';
import { ClientFetchResult, ClientQuery } from './utils/query.js';
import { TripleStoreApi } from 'packages/db/src/triple-store.js';

type OnMessageReceivedCallback = (message: ServerSyncMessage) => void;
type OnMessageSentCallback = (message: ClientSyncMessage) => void;

const QUERY_STATE_KEY = 'query-state';

/**
 * The SyncEngine is responsible for managing the connection to the server and syncing data
 */
export class SyncEngine {
  private transport: SyncTransport;

  private queries: Map<
    string,
    { params: CollectionQuery<any, any>; fulfilled: boolean }
  > = new Map();

  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;

  private db: DB<any>;
  private syncOptions: SyncOptions;

  private connectionChangeHandlers: Set<(status: ConnectionStatus) => void> =
    new Set();

  private queryFulfillmentCallbacks: Map<string, (response: any) => void>;
  private txCommits$ = new Subject<string>();
  private txFailures$ = new Subject<{ txId: string; error: unknown }>();

  private messageReceivedSubscribers: Set<OnMessageReceivedCallback> =
    new Set();
  private messageSentSubscribers: Set<OnMessageSentCallback> = new Set();

  private awaitingAck: Set<string> = new Set();
  logger: Logger;

  /**
   *
   * @param options configuration options for the sync engine
   * @param db the client database to be synced
   */
  constructor(options: SyncOptions, db: DB<any>) {
    this.logger = options.logger;
    this.syncOptions = options;
    this.syncOptions.secure = options.secure ?? true;
    this.syncOptions.syncSchema = options.syncSchema ?? false;
    this.db = db;
    this.transport = options.transport ?? new WebSocketTransport();
    this.txCommits$.subscribe((txId) => {
      const callbacks = this.commitCallbacks.get(txId);
      if (callbacks) {
        for (const callback of callbacks) {
          callback();
        }
        this.commitCallbacks.delete(txId);
        this.failureCallbacks.delete(txId);
      }
    });
    this.txFailures$.subscribe(({ txId, error }) => {
      const callbacks = this.failureCallbacks.get(txId);
      if (callbacks) {
        for (const callback of callbacks) {
          callback(error);
        }
      }
    });
    this.queryFulfillmentCallbacks = new Map();

    // Signal the server when there are triples to send
    const throttledSignal = throttle(() => this.signalOutboxTriples(), 100);
    this.db.tripleStore.setStorageScope(['outbox']).onInsert((inserts) => {
      if (!inserts['outbox']?.length) return;
      throttledSignal();
    });
  }

  /**
   * The token used to authenticate with the server
   */
  get token() {
    return this.syncOptions.token;
  }

  private get httpUri() {
    return this.syncOptions.server
      ? `${this.syncOptions.secure ? 'https' : 'http'}://${
          this.syncOptions.server
        }`
      : undefined;
  }

  onSyncMessageReceived(callback: OnMessageReceivedCallback) {
    this.messageReceivedSubscribers.add(callback);
    return () => {
      this.messageReceivedSubscribers.delete(callback);
    };
  }

  onSyncMessageSent(callback: OnMessageSentCallback) {
    this.messageSentSubscribers.add(callback);
    return () => {
      this.messageSentSubscribers.delete(callback);
    };
  }

  private async getConnectionParams(): Promise<TransportConnectParams> {
    const clientId = await this.db.getClientId();
    const schemaHash = hashSchemaJSON(
      schemaToJSON(await this.db.getSchema())?.collections
    );
    return {
      clientId,
      schema: schemaHash,
      syncSchema: this.syncOptions.syncSchema,
      token: this.syncOptions.token,
      server: this.syncOptions.server,
      secure: this.syncOptions.secure,
    };
  }

  private async getQueryState(queryId: string) {
    const queryState = await this.db.tripleStore.readMetadataTuples(
      QUERY_STATE_KEY,
      [queryId]
    );
    if (queryState.length === 0) return undefined;
    const stateVector = JSON.parse(queryState[0][2] as string);
    return stateVector;
  }

  private async setQueryState(queryId: string, stateVector: Timestamp[]) {
    await this.db.tripleStore.updateMetadataTuples([
      [QUERY_STATE_KEY, [queryId], JSON.stringify(stateVector)],
    ]);
  }

  /**
   * @hidden
   */
  subscribe(params: CollectionQuery<any, any>, onQueryFulfilled?: () => void) {
    const queryHash = Value.Hash(params).toString();
    const id = queryHash;
    this.getQueryState(id).then((queryState) => {
      this.sendMessage({
        type: 'CONNECT_QUERY',
        payload: {
          id: id,
          params,
          state: queryState,
        },
      });
      this.queries.set(id, { params, fulfilled: false });
      this.onQueryFulfilled(id, (resp) => {
        const { triples } = resp;
        if (triples.length > 0) {
          const stateVector = this.triplesToStateVector(triples);
          this.setQueryState(id, stateVector);
        }
        this.queries.set(id, { params, fulfilled: true });
        if (onQueryFulfilled) onQueryFulfilled();
      });
    });

    return () => {
      this.disconnectQuery(id);
    };
  }

  private triplesToStateVector(triples: TripleRow[]): Timestamp[] {
    const clientClocks = new Map<string, number>();
    triples.forEach((t) => {
      // only set the clock if it is greater than the current clock for each client
      const [tick, clientId] = t.timestamp;
      const currentClock = clientClocks.get(clientId);
      if (!currentClock || tick > currentClock) {
        clientClocks.set(clientId, tick);
      }
    });
    return [...clientClocks.entries()].map(([clientId, timestamp]) => [
      timestamp,
      clientId,
    ]);
  }

  onQueryFulfilled(queryId: string, callback: (response: any) => void) {
    this.queryFulfillmentCallbacks.set(queryId, callback);
  }

  hasQueryBeenFulfilled(queryId: string) {
    return this.queries.get(queryId)?.fulfilled ?? false;
  }

  /**
   * @hidden
   */
  disconnectQuery(id: string) {
    this.sendMessage({ type: 'DISCONNECT_QUERY', payload: { id } });
    this.queries.delete(id);
  }

  private commitCallbacks: Map<string, Set<() => void>> = new Map();
  private failureCallbacks: Map<string, Set<(e: unknown) => void>> = new Map();

  /**
   * When a transaction has been confirmed by the remote database, the callback will be called
   * @param txId
   * @param callback
   * @returns a function removing the listener callback
   */
  onTxCommit(txId: string, callback: () => void) {
    this.commitCallbacks.has(txId)
      ? this.commitCallbacks.get(txId)?.add(callback)
      : this.commitCallbacks.set(txId, new Set([callback]));
    return () => {
      this.commitCallbacks.get(txId)?.delete(callback);
    };
  }

  /**
   * If a transaction fails to commit on the remote database, the callback will be called
   * @param txId
   * @param callback
   * @returns a function removing the listener callback
   */
  onTxFailure(txId: string, callback: (e: unknown) => void) {
    this.failureCallbacks.has(txId)
      ? this.failureCallbacks.get(txId)?.add(callback)
      : this.failureCallbacks.set(txId, new Set([callback]));
    return () => {
      this.failureCallbacks.get(txId)?.delete(callback);
    };
  }

  private signalOutboxTriples() {
    this.sendMessage({ type: 'TRIPLES_PENDING', payload: {} });
  }

  /**
   * Initiate a sync connection with the server
   */
  async connect() {
    if (this.transport.connectionStatus !== 'CLOSED') {
      this.closeConnection({ type: 'CONNECTION_OVERRIDE', retry: false });
    }
    const params = await this.getConnectionParams();
    this.transport.connect(params);
    this.transport.onMessage(async (evt) => {
      const message: ServerSyncMessage = JSON.parse(evt.data);
      this.logger.debug('received', message);
      for (const handler of this.messageReceivedSubscribers) {
        handler(message);
      }
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
          // this.queryFulfillmentCallbacks.delete(qId);
        }
        if (triples.length !== 0) {
          await this.db.transact(
            async (dbTx) => {
              await dbTx.storeTx
                .withScope({ read: ['cache'], write: ['cache'] })
                .insertTriples(triples);
            },
            { skipRules: true }
          );
        }
      }

      if (message.type === 'TRIPLES_ACK') {
        const { payload } = message;
        const { txIds, failedTxIds } = payload;
        try {
          const failuresSet = new Set(failedTxIds);
          // TODO: do we want hooks to run here?
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
          });
          for (const txId of txIds) {
            this.txCommits$.next(txId);
          }

          // Filter out failures, tell server there are unsent triples
          // Would be nice to not load all these into memory
          // However for most workloads its hopefully not that much data
          const triplesToSend = (
            await this.getTriplesToSend(
              this.db.tripleStore.setStorageScope(['outbox'])
            )
          ).filter((t) => !failuresSet.has(JSON.stringify(t.timestamp)));
          if (triplesToSend.length) this.signalOutboxTriples();
        } finally {
          // After processing, clean state (ACK received)
          for (const txId of txIds) {
            this.awaitingAck.delete(txId);
          }
          for (const txId of failedTxIds) {
            this.awaitingAck.delete(txId);
          }
        }
      }

      if (message.type === 'TRIPLES_REQUEST') {
        // we do this outbox scan like a million times (i think the server can still do a small throttle for backpressue of those mesasges bc theyre stateless)
        const triplesToSend = await this.getTriplesToSend(
          this.db.tripleStore.setStorageScope(['outbox'])
        );
        this.sendTriples(triplesToSend);
      }

      if (message.type === 'CLOSE') {
        const { payload } = message;
        console.warn(
          `Closing connection${payload?.message ? `: ${payload.message}` : '.'}`
        );
        const { type, retry } = payload;
        // Close payload must remain under 125 bytes
        this.closeConnection({ type, retry });
      }
    });
    this.transport.onOpen(async () => {
      this.logger.debug('sync connection has opened');
      this.resetReconnectTimeout();
      // Cut down on message sending by only signaling if there are triples to send
      const outboxTriples = await this.getTriplesToSend(
        this.db.tripleStore.setStorageScope(['outbox'])
      );
      const hasOutboxTriples = !!outboxTriples.length;
      if (hasOutboxTriples) this.signalOutboxTriples();
      // Reconnect any queries
      for (const [id, queryInfo] of this.queries) {
        this.getQueryState(id).then((queryState) => {
          this.sendMessage({
            type: 'CONNECT_QUERY',
            payload: {
              id,
              params: queryInfo.params,
              state: queryState,
            },
          });
        });
      }
    });

    this.transport.onClose((evt) => {
      // Clear any sync state
      this.awaitingAck = new Set();

      // If there is no reason, then default is to retry
      if (evt.reason) {
        let type: string;
        let retry: boolean;
        // We populate the reason field with some information about the close
        // Some WS implementations include a reason field that isn't a JSON string on connection failures, etc
        try {
          const { type: t, retry: r } = JSON.parse(evt.reason);
          type = t;
          retry = r;
        } catch (e) {
          type = 'UNKNOWN';
          retry = true;
        }

        if (type === 'SCHEMA_MISMATCH') {
          console.error(
            'The server has closed the connection because the client schema does not match the server schema. Please update your client schema.'
          );
        }

        if (!retry) {
          // early return to prevent reconnect
          console.warn('Connection will not automatically retry.');
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

  /**
   * The current connection status of the sync engine
   */
  get connectionStatus() {
    return this.transport.connectionStatus;
  }

  /**
   * @hidden
   * Update the sync engine's configuration options
   * @param options
   */
  updateConnection(options: Partial<SyncOptions>) {
    const areAnyOptionsNew = (
      Object.keys(options) as Array<keyof SyncOptions>
    ).some((option) => this.syncOptions[option] !== options[option]);
    if (!areAnyOptionsNew) return;

    this.disconnect();
    this.syncOptions = { ...this.syncOptions, ...options };
    this.connect();
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.closeConnection({ type: 'MANUAL_DISCONNECT', retry: false });
  }

  private async handleErrorMessage(message: any) {
    const { error, metadata } = message.payload;
    console.error(error, metadata);
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
        // Could maybe do this on ACK too
        for (const failure of failures) {
          const { txId, error } = failure;
          this.txFailures$.next({ txId, error });
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
    triplesToSend.forEach((t) =>
      this.awaitingAck.add(JSON.stringify(t.timestamp))
    );
    this.sendMessage({ type: 'TRIPLES', payload: { triples: triplesToSend } });
  }

  private sendMessage(message: ClientSyncMessage) {
    this.transport.sendMessage(message);
    this.logger.debug('sent', message);
    for (const handler of this.messageSentSubscribers) {
      handler(message);
    }
  }

  /**
   * Retry sending a transaciton to the remote database. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.
   * @param txId
   */
  async retry(txId: string) {
    const timestamp: Timestamp = JSON.parse(txId);
    const triplesToSend = await this.db.tripleStore
      .setStorageScope(['outbox'])
      .findByClientTimestamp(await this.db.getClientId(), 'eq', timestamp);
    if (triplesToSend.length > 0) this.sendTriples(triplesToSend);
  }

  /**
   * Rollback a transaction from the client database. It will no longer be sent to the remote database as a part of the syncing process. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.
   * @param txIds
   */
  async rollback(txIds: string | string[]) {
    const txIdList = Array.isArray(txIds) ? txIds : [txIds];
    await this.db.transact(
      async (tx) => {
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
      },
      { skipRules: true }
    );
  }

  /**
   * Sets up a listener for connection status changes
   * @param callback A callback that will be called when the connection status changes
   * @param runImmediately Run the callback immediately with the current connection status
   * @returns A function that removes the callback from the connection status change listeners
   */
  onConnectionStatusChange(
    callback: (status: ConnectionStatus) => void,
    runImmediately: boolean = false
  ) {
    this.connectionChangeHandlers.add(callback);
    if (runImmediately) callback(this.transport.connectionStatus);
    return () => {
      this.connectionChangeHandlers.delete(callback);
    };
  }

  private closeConnection(reason?: CloseReason) {
    if (this.transport) this.transport.close(reason);
  }

  private resetReconnectTimeout() {
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeoutDelay = 250;
  }

  /**
   * @hidden
   */
  async syncQuery(query: ClientQuery<any, any>) {
    try {
      const triples = await this.getRemoteTriples(query);
      await this.db.transact(
        async (dbTx) => {
          await dbTx.storeTx
            .withScope({ read: ['cache'], write: ['cache'] })
            .insertTriples(triples);
        },
        { skipRules: true }
      );
    } catch (e) {
      if (e instanceof TriplitError) throw e;
      if (e instanceof Error) throw new RemoteSyncFailedError(query, e.message);
      throw new RemoteSyncFailedError(query, 'An unknown error occurred.');
    }
  }

  /**
   * @hidden
   */
  async fetchQuery<CQ extends ClientQuery<any, any>>(query: CQ) {
    try {
      // Simpler to serialize triples and reconstruct entities on the client
      const triples = await this.getRemoteTriples(query);
      const entities = constructEntities(triples);
      const schema = (await this.db.getSchema())?.collections;
      return new Map(
        [...entities].map(([id, entity]) => [
          stripCollectionFromId(id),
          convertEntityToJS(entity.data as any, schema),
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
      let errorBody;
      try {
        errorBody = await res.json();
      } catch (e) {
        throw new RemoteFetchFailedError(
          query,
          `The server responded with an error: ${await res.text()}`
        );
      }
      const message = errorBody.message ?? JSON.stringify(errorBody);
      throw new RemoteFetchFailedError(query, message);
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

  private async getTriplesToSend(store: TripleStoreApi) {
    return (await store.findByEntity()).filter((t) => this.shouldSendTriple(t));
  }

  private shouldSendTriple(t: TripleRow) {
    const hasBeenSent = this.awaitingAck.has(JSON.stringify(t.timestamp));
    return (
      !hasBeenSent &&
      // Filter out schema triples if syncSchema is false
      (this.syncOptions.syncSchema || !t.id.includes('_metadata#_schema'))
    );
  }
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
