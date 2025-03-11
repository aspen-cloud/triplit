import {
  DBChanges,
  NestedMap,
  hashQuery,
  CollectionQuery,
  TriplitError,
  hashObject,
} from '@triplit/db';
import { SyncOptions, TriplitClient } from './client/triplit-client.js';
import {
  ConnectionStatus,
  SyncTransport,
  TransportConnectParams,
} from './transport/transport.js';
import { WebSocketTransport } from './transport/websocket-transport.js';
import {
  ClientSyncMessage,
  CloseReason,
  ServerCloseReasonType,
  ServerErrorMessage,
  ServerSyncMessage,
  QueryState,
  SyncTimestamp,
} from './@triplit/types/sync.js';
import {
  MissingConnectionInformationError,
  RemoteSyncFailedError,
} from './errors.js';
import {
  EntitySyncErrorCallback,
  EntitySyncSuccessCallback,
  ErrorCallback,
  QuerySyncState,
  SyncStateCallback,
} from './client/types';
import { Logger } from './@triplit/types/logger.js';
import SuperJSON from 'superjson';
import { logger } from '@triplit/logger';

type OnMessageReceivedCallback = (message: ServerSyncMessage) => void;
type OnMessageSentCallback = (message: ClientSyncMessage) => void;

type SessionErrors = Extract<
  ServerCloseReasonType,
  'ROLES_MISMATCH' | 'TOKEN_EXPIRED' | 'SCHEMA_MISMATCH' | 'UNAUTHORIZED'
>;

export type OnSessionErrorCallback = (type: SessionErrors) => void;

const QUERY_STATE_KEY = 'query-state';

function isEmpty(obj: any) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

/**
 * The SyncEngine is responsible for managing the connection to the server and syncing data
 */
export class SyncEngine {
  private transport: SyncTransport;

  private client: TriplitClient<any>;
  syncOptions: SyncOptions;

  private connectionChangeHandlers: Set<(status: ConnectionStatus) => void> =
    new Set();
  private messageReceivedSubscribers: Set<OnMessageReceivedCallback> =
    new Set();
  private messageSentSubscribers: Set<OnMessageSentCallback> = new Set();
  private sessionErrorSubscribers: Set<OnSessionErrorCallback> = new Set();
  private entitySyncErrorSubscribers: NestedMap<
    string,
    string,
    EntitySyncErrorCallback
  > = new NestedMap();
  private entitySyncSuccessSubscribers: NestedMap<
    string,
    string,
    EntitySyncSuccessCallback
  > = new NestedMap();
  private onFailureToSyncWritesSubscribers: Set<
    (e: unknown, writes: DBChanges) => void | Promise<void>
  > = new Set();
  logger: Logger;

  // Connection state - these are used to track the state of the connection and should reset on dis/reconnect
  private awaitingAck: Set<string> = new Set();
  private syncInProgress: boolean = false;
  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;
  private serverReady: boolean = false;

  // Session state - these are used to track the state of the session and should persist across reconnections, but reset on reset()
  private queries: Map<
    string,
    {
      params: CollectionQuery<any, any>;
      syncState: QuerySyncState;
      syncStateCallbacks: Set<SyncStateCallback>;
      subCount: number;
      hasSent: boolean;
      abortController: AbortController;
    }
  > = new Map();

  /**
   *
   * @param options configuration options for the sync engine
   * @param db the client database to be synsced
   */
  constructor(client: TriplitClient<any>, options: SyncOptions) {
    this.client = client;
    this.logger = options.logger;
    this.syncOptions = options;
    this.syncOptions.secure = options.secure ?? true;
    this.syncOptions.syncSchema = options.syncSchema ?? false;
    this.transport = options.transport ?? new WebSocketTransport();
  }

  async sendChanges(changes: DBChanges) {
    this.sendMessage({
      type: 'CHANGES',
      payload: {
        changes: SuperJSON.serialize(changes),
      },
    });
  }

  async maybeSyncOutbox() {
    if (this.client.awaitReady) await this.client.awaitReady;
    if (this.syncInProgress || this.connectionStatus !== 'OPEN') return;
    this.client.db.entityStore.doubleBuffer.lockAndSwitchBuffers();
    await this.trySyncLockedBuffer();
  }

  async trySyncLockedBuffer() {
    if (this.client.awaitReady) await this.client.awaitReady;
    this.syncInProgress = true;
    try {
      const changes = await this.client.db.entityStore.doubleBuffer
        .getLockedBuffer()
        .getChanges(this.client.db.kv);
      if (!isEmpty(changes)) {
        this.sendChanges(changes);
        return;
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  async clearPendingChangesForEntity(collection: string, id: string) {
    const tx = this.client.db.kv.transact();
    await this.client.db.entityStore.doubleBuffer
      .getUnlockedBuffer()
      .clearChangesForEntity(tx, collection, id);
    await tx.commit();
    // because we've surgically removed the changes for this entity
    // there might be other changes that we can sync
    // TODO: is this desired behavior every time?
    return this.maybeSyncOutbox();
  }

  async clearPendingChangesAll() {
    const tx = this.client.db.kv.transact();
    await this.client.db.entityStore.doubleBuffer.getUnlockedBuffer().clear(tx);
    await tx.commit();
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

  updateTokenForSession(token: string) {
    this.syncOptions.token = token;
    this.transport.sendMessage({ type: 'UPDATE_TOKEN', payload: { token } });
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

  onEntitySyncSuccess(
    collection: string,
    entityId: string,
    callback: () => void
  ) {
    this.entitySyncSuccessSubscribers.set(collection, entityId, callback);
    return () => {
      this.entitySyncSuccessSubscribers.delete(collection, entityId);
    };
  }

  onEntitySyncError(
    collection: string,
    entityId: string,
    callback: EntitySyncErrorCallback
  ) {
    this.entitySyncErrorSubscribers.set(collection, entityId, callback);
    return () => {
      this.entitySyncErrorSubscribers.delete(collection, entityId);
    };
  }

  onFailureToSyncWrites(callback: (e: unknown) => void) {
    this.onFailureToSyncWritesSubscribers.add(callback);
    return () => {
      this.onFailureToSyncWritesSubscribers.delete(callback);
    };
  }

  onSessionError(callback: OnSessionErrorCallback) {
    this.sessionErrorSubscribers.add(callback);
    return () => {
      this.sessionErrorSubscribers.delete(callback);
    };
  }

  private async getConnectionParams(): Promise<TransportConnectParams> {
    if (this.client.awaitReady) await this.client.awaitReady;
    const collecitons = this.client.db.getSchema()?.collections;
    const schemaHash = collecitons ? hashObject(collecitons) : undefined;
    return {
      schema: schemaHash,
      syncSchema: this.syncOptions.syncSchema,
      token: this.syncOptions.token,
      server: this.syncOptions.server,
      secure: this.syncOptions.secure,
    };
  }

  // TODO: determine future of query states
  async isFirstTimeFetchingQuery(query: CollectionQuery<any, any>) {
    if (this.client.awaitReady) await this.client.awaitReady;
    return !(await this.client.db.getMetadata([
      QUERY_STATE_KEY,
      hashQuery(query),
    ]));
  }

  private async markQueryAsSeen(queryId: string) {
    if (this.client.awaitReady) await this.client.awaitReady;
    return this.client.db.setMetadata([QUERY_STATE_KEY, queryId], true);
  }

  /**
   * @hidden
   */
  async subscribe(
    params: CollectionQuery<any, any>,
    options: {
      onQueryFulfilled?: () => void;
      onQueryError?: ErrorCallback;
      onQuerySyncStateChange?: SyncStateCallback;
    } = {}
  ) {
    const { onQueryFulfilled, onQueryError, onQuerySyncStateChange } = options;
    const id = hashQuery(params);
    const queryHasMounted = this.queries.has(id);
    if (!queryHasMounted) {
      this.queries.set(id, {
        params,
        syncState: 'NOT_STARTED',
        syncStateCallbacks: new Set(),
        subCount: 0,
        hasSent: false,
        abortController: new AbortController(),
      });
    }
    // Safely using query! here because we just set it
    const query = this.queries.get(id)!;
    query.subCount++;

    if (onQuerySyncStateChange) {
      query.syncStateCallbacks.add(onQuerySyncStateChange);
    }
    let fulfillmentCallback: SyncStateCallback | undefined = undefined;

    if (onQueryFulfilled) {
      query.syncState === 'FULFILLED' && onQueryFulfilled();
      fulfillmentCallback = (state) => {
        if (state === 'FULFILLED') {
          onQueryFulfilled();
        }
      };
      query.syncStateCallbacks.add(fulfillmentCallback);
    }
    let errorCallback: SyncStateCallback | undefined = undefined;
    if (onQueryError) {
      errorCallback = (state, error) => {
        if (state === 'ERROR') {
          onQueryError(error);
        }
      };
      query.syncStateCallbacks.add(errorCallback);
    }
    if (!queryHasMounted) {
      await this.connectQuery(id);
    }

    return () => {
      const query = this.queries.get(id);
      // If we cannot find the query, we may have already disconnected or reset our state
      // just in case send a disconnect signal to the server
      if (!query) {
        this.disconnectQuery(id);
        return;
      }

      // Clear data related to subscription
      query.subCount--;
      if (fulfillmentCallback) {
        query.syncStateCallbacks.delete(fulfillmentCallback);
      }
      if (errorCallback) {
        query.syncStateCallbacks.delete(errorCallback);
      }
      if (onQuerySyncStateChange) {
        query.syncStateCallbacks.delete(onQuerySyncStateChange);
      }

      // If there are no more subscriptions, disconnect the query
      if (query.subCount === 0) {
        this.disconnectQuery(id);
        return;
      }
    };
  }

  private async connectQuery(queryId: string) {
    if (this.client.awaitReady) await this.client.awaitReady;
    if (!this.queries.has(queryId)) return;

    const queryMetadata = this.queries.get(queryId);
    /**
     * Do not send CONNECT_QUERY message if:
     * - query no longer exists
     * - query has already been sent in this session
     * - query has been aborted
     * - server is not ready
     */
    if (
      !queryMetadata ||
      queryMetadata.hasSent ||
      queryMetadata.abortController.signal.aborted ||
      !this.serverReady
    ) {
      return;
    }

    const latestServerTimestamp = (await this.client.db.getMetadata([
      'latest_server_timestamp',
    ])) as SyncTimestamp | undefined;

    let queryState: QueryState | undefined = undefined;

    if (latestServerTimestamp) {
      queryState = {
        timestamp: latestServerTimestamp,
        // we should be able to retrieve these from the denormalized changes
        // that are stored in IVM, assuming that the subscription is initialized
        // In the case of background subscription, there won't be
        // any record of the query in IVM, so we can just fall back to fetchChanges
        // BUT if we go down that way then there's a contract that what
        // comes out of IVM and watch we get from fetchChanges is the same
        entityIds: changesToEntityIds(
          await this.client.db.fetchChanges(queryMetadata.params)
        ),
      };
    }
    const didSend = this.sendMessage({
      type: 'CONNECT_QUERY',
      payload: {
        id: queryId,
        params: queryMetadata.params,
        state: queryState,
      },
    });
    if (didSend) {
      queryMetadata.syncState = 'IN_FLIGHT';
      for (const callback of queryMetadata.syncStateCallbacks) {
        callback('IN_FLIGHT', undefined);
      }
      queryMetadata.hasSent = true;
    }
    return didSend;
  }

  hasServerRespondedForQuery(query: CollectionQuery<any, any>) {
    const queryId = hashQuery(query);
    const queryMetadata = this.queries.get(queryId);
    return (queryMetadata && queryMetadata.syncState === 'FULFILLED') ?? false;
  }

  /**
   * @hidden
   */
  disconnectQuery(id: string) {
    if (!this.queries.has(id)) return;
    const queryMetadata = this.queries.get(id)!;
    if (queryMetadata.hasSent) {
      this.sendMessage({ type: 'DISCONNECT_QUERY', payload: { id } });
    } else {
      queryMetadata.abortController.abort();
    }
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
      logger.debug('received', message);
      for (const handler of this.messageReceivedSubscribers) {
        handler(message);
      }
      if (message.type === 'ERROR') {
        await this.handleErrorMessage(message);
      }
      if (message.type === 'ENTITY_DATA') {
        const {
          changes: stringifiedChanges,
          timestamp,
          forQueries: queryIds,
        } = message.payload;
        const changes = SuperJSON.deserialize<DBChanges>(stringifiedChanges);
        // first apply changes
        // the db will push these onto IVMs buffer
        await this.client.db.applyChangesWithTimestamp(changes, timestamp, {
          skipRules: true,
        });

        // TODO do in same transaction
        await this.client.db.setMetadata(
          ['latest_server_timestamp'],
          timestamp
        );

        // then update the query fulfillment state so that
        // the client can signal in the results handler
        // that the next time IVM fires, it's because
        // of the server's response
        for (const qId of queryIds) {
          const query = this.queries.get(qId);
          if (!query) continue;
          if (query.syncState !== 'FULFILLED') {
            await this.markQueryAsSeen(qId);
            query.syncState = 'FULFILLED';
          }
          // this.queryFulfillmentCallbacks.delete(qId);
        }

        // update IVM
        await this.client.db.updateQueryViews();
        this.client.db.broadcastToQuerySubscribers();

        // finally, run the query fulfillment callbacks
        for (const qId of queryIds) {
          const query = this.queries.get(qId);
          if (!query) continue;
          for (const callback of query.syncStateCallbacks) {
            callback('FULFILLED', message.payload);
          }
        }
      }

      if (message.type === 'CHANGES_ACK') {
        const ackedChanges = await this.client.db.entityStore.doubleBuffer
          .getLockedBuffer()
          .getChanges(this.client.db.kv);

        // write the acked changes to the outbox
        const tx = this.client.db.kv.transact();
        // go through to the entity store because
        // that will skip buffering IVM
        await this.client.db.entityStore.applyChangesWithTimestamp(
          tx,
          ackedChanges,
          message.payload.timestamp,
          {
            checkWritePermission: undefined,
            entityChangeValidator: undefined,
          }
        );
        for (const [collection, entityCallbackMap] of this
          .entitySyncSuccessSubscribers) {
          const collectionChanges = ackedChanges[collection];
          if (!collectionChanges) continue;
          for (const [id, callback] of entityCallbackMap) {
            if (
              collectionChanges.sets.has(id) ||
              collectionChanges.deletes.has(id)
            ) {
              await callback();
            }
          }
        }
        await this.client.db.entityStore.doubleBuffer
          .getLockedBuffer()
          .clear(tx);
        await tx.commit();
        this.syncInProgress = false;
        // empty the outbox
        // this.checkUnlockedBufferAndSendAnyChanges();
        await this.maybeSyncOutbox();
      }

      if (message.type === 'CLOSE') {
        const { payload } = message;
        logger.info(
          `Closing connection${payload?.message ? `: ${payload.message}` : '.'}`
        );
        const { type, retry } = payload;
        // Close payload must remain under 125 bytes
        this.closeConnection({ type, retry });
      }

      if (message.type === 'SCHEMA_REQUEST') {
        const schema = await this.client.getSchema();
        this.sendMessage({
          type: 'SCHEMA_RESPONSE',
          payload: { schema },
        });
      }

      if (message.type === 'READY') {
        if (!this.serverReady) {
          this.serverReady = true;
          await this.initializeSync();
        }
      }
    });
    this.transport.onOpen(async () => {
      logger.info('sync connection has opened', {
        status: this.connectionStatus,
      });
      this.resetReconnectTimeout();
    });

    this.transport.onClose((evt) => {
      // Clear any sync state
      this.resetQueryAcks();
      this.serverReady = false;

      // If there is no reason, then default is to retry
      if (evt.reason) {
        let type: ServerCloseReasonType;
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
        if (type === 'UNAUTHORIZED') {
          logger.error(
            'The server has closed the connection because the client is unauthorized. Please provide a valid token.'
          );
        }
        if (type === 'SCHEMA_MISMATCH') {
          logger.error(
            'The server has closed the connection because the client schema does not match the server schema. Please update your client schema.'
          );
        }

        if (type === 'TOKEN_EXPIRED') {
          logger.error(
            'The server has closed the connection because the token has expired. Fetch a new token from your authentication provider and call `TriplitClient.endSession()` and `TriplitClient.startSession(token)` to restart the session.'
          );
        }

        if (type === 'ROLES_MISMATCH') {
          logger.error(
            'The server has closed the connection because the client attempted to update the session with a token that has different roles than the existing token. Call `TriplitClient.endSession()` and `TriplitClient.startSession(token)` to restart the session with the new token.'
          );
        }
        if (
          [
            'ROLES_MISMATCH',
            'TOKEN_EXPIRED',
            'SCHEMA_MISMATCH',
            'UNAUTHORIZED',
          ].includes(type)
        ) {
          for (const handler of this.sessionErrorSubscribers) {
            handler(type as SessionErrors);
          }
        }

        if (!retry) {
          // early return to prevent reconnect
          logger.warn(
            'The connection has closed. Based on the signal, the connection will not automatically retry. If you would like to reconnect, please call `connect()`.'
          );
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
      // logger.log('error ws', evt);
      logger.error('transport error', evt);
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

  private async initializeSync() {
    await this.trySyncLockedBuffer();
    await this.maybeSyncOutbox();

    // Reconnect any queries
    for (const [id] of this.queries) {
      this.connectQuery(id);
    }
  }

  /**
   * The current connection status of the sync engine
   */
  get connectionStatus() {
    return this.transport.connectionStatus;
  }

  /**
   * @hidden
   * Updates the sync engine's configuration options. If the connection is currently open, it will be closed and you will need to call `connect()` again.
   * @param options
   */
  updateConnection(options: Partial<SyncOptions>) {
    if (this.connectionStatus === 'OPEN') {
      logger.warn(
        'You are updating the connection options while the connection is open. To avoid unexpected behavior the connection will be closed and you should call `connect()` again after the update. To hide this warning, call `disconnect()` before updating the connection options.'
      );
      this.disconnect();
    }
    this.syncOptions = { ...this.syncOptions, ...options };
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.closeConnection({ type: 'MANUAL_DISCONNECT', retry: false });
  }

  /**
   * Resets the server acks for remote queries.
   * On the next connection, queries will be re-sent to server as if there is no previous seen data.
   * If the connection is currently open, it will be closed and you will need to call `connect()` again.
   */
  async resetQueryState() {
    if (this.connectionStatus === 'OPEN') {
      logger.warn(
        'You are resetting the sync engine while the connection is open. To avoid unexpected behavior the connection will be closed and you should call `connect()` again after resetting. To hide this warning, call `disconnect()` before resetting.'
      );
      this.disconnect();
    }
    this.resetQueryAcks();
  }

  /**
   * Marks all queries as unsent and removes received acks,
   * priming them to be resent on the next connection
   */
  private resetQueryAcks() {
    this.awaitingAck = new Set();
    for (const queryMetadata of this.queries.values()) {
      queryMetadata!.hasSent = false;
      queryMetadata!.syncState = 'NOT_STARTED';
    }
  }

  private async handleErrorMessage(message: ServerErrorMessage) {
    const { error, metadata, messageType } = message.payload;
    logger.error(error.name, metadata);
    switch (error.name) {
      case 'MalformedMessagePayloadError':
      case 'UnrecognizedMessageTypeError':
        logger.warn(
          'You sent a malformed message to the server. This might occur if your client is not up to date with the server. Please ensure your client is updated.'
        );
        break;
      // On a remote read error, default to disconnecting the query
      // You will still send triples, but you wont receive updates
      case 'QuerySyncError':
        const queryKey = metadata?.queryKey;
        if (queryKey) {
          const query = this.queries.get(queryKey);
          if (query) {
            const parsedError = TriplitError.fromJson(error);
            query.syncState = 'ERROR';
            for (const callback of query.syncStateCallbacks) {
              // TODO: include metadata (inner error)
              await callback('ERROR', parsedError);
            }
          }
          this.disconnectQuery(queryKey);
        }
    }
    if (messageType === 'CHANGES') {
      const kvTx = this.client.db.kv.transact();
      const outbox = this.client.db.entityStore.doubleBuffer;

      // can we have the server send this back instead of reading the potentially
      // unstable buffer?
      const failedChanges = await outbox.getLockedBuffer().getChanges(kvTx);

      // rebase the unlocked buffer on the failed locked buffer
      await outbox
        .getLockedBuffer()
        .write(kvTx, await outbox.getUnlockedBuffer().getChanges(kvTx));
      await outbox.getUnlockedBuffer().clear(kvTx);
      await kvTx.commit();

      // now we can switch the buffers so that the
      // client can write to the unlocked buffer
      outbox.lockAndSwitchBuffers();
      this.syncInProgress = false;
      for (const handler of this.onFailureToSyncWritesSubscribers) {
        await handler(error, failedChanges);
      }
      for (const collection in failedChanges) {
        // TODO: layer in deletes
        for (const [id, change] of failedChanges[collection].sets) {
          const errorCallback = this.entitySyncErrorSubscribers.get(
            collection,
            id
          );
          if (errorCallback) {
            // should we be providing the change or the full entity?
            // TODO: ts fixups for error passed in
            // should this just be the root error instead of in this
            // failures array?
            // @ts-expect-error
            await errorCallback(metadata?.failures[0]?.error, change);
          }
        }
      }
    }
  }

  private sendMessage(message: ClientSyncMessage) {
    // TODO: it might be safe to prevent sending some messages if the server hasnt indicated its ready yet
    // Allowed messages might include token exchange info and schema exchange info
    const didSend = this.transport.sendMessage(message);

    if (didSend) {
      logger.debug('sent', message);
      for (const handler of this.messageSentSubscribers) {
        handler(message);
      }
    }

    return didSend;
  }

  /**
   * Retry sending a transaciton to the remote database. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.
   * @param txId
   */
  async retry(txId: string) {
    await this.maybeSyncOutbox();
  }

  /**
   * Rollback a transaction from the client database. It will no longer be sent to the remote database as a part of the syncing process. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.
   * @param txIds
   */
  // TODO: implement rollback
  async rollback(txIds: string | string[]) {
    throw new Error('NOT IMPLEMENTED');
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
  async syncQuery(query: CollectionQuery<any, any>) {
    try {
      let resolve: (value: unknown) => void, reject: (reason?: any) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const unsubPromise = this.subscribe(query, {
        onQueryFulfilled: async () => {
          const unsub = await unsubPromise;
          resolve(void 0);
          unsub();
        },
      });
      return promise;
    } catch (e) {
      if (e instanceof TriplitError) throw e;
      if (e instanceof Error) throw new RemoteSyncFailedError(query, e.message);
      throw new RemoteSyncFailedError(query, 'An unknown error occurred.');
    }
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

function changesToEntityIds(changes: DBChanges): Record<string, string[]> {
  const entityIds: Record<string, string[]> = {};
  for (const [collection, collectionChanges] of Object.entries(changes)) {
    const changedIds = [
      ...collectionChanges.sets.keys(),
      ...collectionChanges.deletes,
    ];
    entityIds[collection] = changedIds;
  }
  return entityIds;
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
