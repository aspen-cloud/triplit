import {
  DBChanges,
  NestedMap,
  hashQuery,
  CollectionQuery,
  TriplitError,
  hashObject,
  prepareQuery,
  EntityStoreQueryEngine,
  getRolesFromSession,
  normalizeSessionVars,
  sessionRolesAreEquivalent,
} from '@triplit/db';
import { TriplitClient } from './client/triplit-client.js';
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
  NoActiveSessionError,
  RemoteSyncFailedError,
  SessionRolesMismatchError,
  TokenDecodingError,
  TokenExpiredError,
} from './errors.js';
import {
  EntitySyncErrorCallback,
  EntitySyncSuccessCallback,
  ErrorCallback,
  OnMessageReceivedCallback,
  OnMessageSentCallback,
  OnSessionErrorCallback,
  QuerySyncState,
  SessionError,
  SyncOptions,
  SyncStateCallback,
  TokenRefreshOptions,
} from './client/types';
import SuperJSON from 'superjson';
import { Logger } from '@triplit/logger';
import {
  ConnectionStatus,
  SyncTransport,
  TransportConnectParams,
} from './types.js';
import {
  createQueryWithExistsAddedToIncludes,
  createQueryWithRelationalOrderAddedToIncludes,
  queryResultsToChanges,
} from '@triplit/db/ivm';
import { decodeToken, tokenIsExpired } from './token.js';

const QUERY_STATE_KEY = 'query-state';

function isEmpty(obj: any) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

type SyncSession = {
  serverUrl?: string;
  token: string;
  status: ConnectionStatus;
  // TODO: we have the opportunity to add more info here, might lead to cleaner code
  // hasConnected: boolean; // used to track if the session has connected at least once
};

/**
 * The SyncEngine is responsible for managing the connection to the server and syncing data
 */
export class SyncEngine {
  private transport: SyncTransport;

  private client: TriplitClient<any>;

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
  private syncInProgress: boolean = false;
  private reconnectTimeoutDelay = 250;
  private reconnectTimeout: any;
  private serverReady: boolean = false;

  // Session state - these are used to track the state of the session and should persist across reconnections, but reset on reset()
  currentSession: SyncSession | undefined = undefined;
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

  clientId: string | null = null;

  /**
   *
   * @param options configuration options for the sync engine
   * @param db the client database to be synced
   */
  constructor(client: TriplitClient<any>, options: SyncOptions) {
    this.client = client;
    this.logger = options.logger;
    this.client.onConnectionOptionsChange((change) => {
      const shouldDisconnect =
        (this.connectionStatus === 'OPEN' ||
          this.connectionStatus === 'CONNECTING') &&
        // Server change or non refresh token change
        ('serverUrl' in change || ('token' in change && !change.tokenRefresh));
      if (shouldDisconnect) {
        this.logger.warn(
          'You are updating the connection options while the connection is open. To avoid unexpected behavior the connection will be closed and you should call `connect()` again after the update. To hide this warning, call `disconnect()` before updating the connection options.'
        );
        this.disconnect();
      }
    });

    this.transport = options.transport ?? new WebSocketTransport();
    this.onConnectionStatusChange((status) => {
      if (status === 'CLOSING' || status === 'CLOSED') {
        if (this.lastParamsHash !== undefined) {
          this.lastParamsHash = undefined;
        }
      }
    });

    if (!!options.pingInterval) {
      const ping = setInterval(
        this.ping.bind(this),
        options.pingInterval * 1000
      );
      // In Node, unref() the ping so it doesn't block the process from exiting
      // TODO: improve typing of setInteval for better compatibility with browser and node
      if (typeof ping === 'object' && 'unref' in ping) ping.unref();
    }
  }

  ping() {
    if (this.connectionStatus === 'OPEN' && this.serverReady) {
      this.sendMessage({
        type: 'PING',
        payload: {
          clientTimestamp: Date.now(),
        },
      });
    }
  }

  private async sendChanges(changes: DBChanges) {
    this.sendMessage({
      type: 'CHANGES',
      payload: {
        changes: SuperJSON.serialize(changes),
      },
    });
  }

  /**
   * Handles a new token and update the sync connection accordingly.
   * - If the token is the same as the current session, it will just connect if `connect` is true.
   * - If the token is different, it will reset the current session and start a new one with the new token.
   */
  async assignSessionToken(
    token: string | undefined,
    connect = true,
    refreshOptions?: TokenRefreshOptions
  ) {
    // If the current params are the same as the new params, just connect if prompted
    if (token && this.currentSession) {
      // Assigning the same state as te existing session
      if (
        this.currentSession.token === token &&
        this.currentSession.serverUrl === this.client.serverUrl
      ) {
        if (
          this.currentSession.status === 'OPEN' ||
          this.currentSession.status === 'CONNECTING'
        )
          return;
        await this.connect();
        return;
      }
    }

    // if current session, tear it down
    if (this.currentSession) {
      this.resetTokenRefreshHandler();
      this.disconnect();
      //  this.updateToken(undefined);
      this.resetQueryState();
      this.currentSession = undefined;
    }
    // Set up a new session
    if (token) {
      this.currentSession = {
        serverUrl: this.client.serverUrl,
        token,
        status: 'UNINITIALIZED', // will be updated on connect
      };
    } else {
      // If we arent starting a new session, fire in case we ended a previous session
      // Trying to make this smooth so there is only one synchronous fire after updating this.currentSession
    }
    this.fireConnectionChangeHandlers(this.currentSession);
    if (connect) {
      await this.connect();
    }

    // 6. Set up a token refresh handler if provided
    // Setup token refresh handler
    if (!refreshOptions || !token) return;
    const { interval, refreshHandler } = refreshOptions;
    const setRefreshTimeoutForToken = (refreshToken: string) => {
      const decoded = decodeToken(refreshToken);
      if (!decoded) return;
      if (!decoded.exp && !interval) return;
      let delay =
        interval ?? (decoded.exp as number) * 1000 - Date.now() - 1000;
      if (delay < 1000) {
        this.logger.warn(
          `The minimum allowed refresh interval is 1000ms, the ${interval ? 'provided interval' : 'interval determined from the provided token'} was ${Math.round(delay)}ms.`
        );
        delay = 1000;
      }
      this.tokenRefreshTimer = setTimeout(async () => {
        // May fail just because you're offline, handle by disconnecting and not nuking your session
        const maybeFreshToken = await refreshHandler();
        if (!maybeFreshToken) {
          if (
            this.connectionStatus === 'OPEN' ||
            this.connectionStatus === 'CONNECTING'
          ) {
            this.logger.warn(
              'The token refresh handler did not return a new token, disconnecting.'
            );
            this.disconnect();
          }
          // Keep trying (?), hopefully not a doom loop, but your refresh interval should be long enough to really overload things
          setRefreshTimeoutForToken(refreshToken);
        } else {
          await this.updateSessionToken(maybeFreshToken);
          setRefreshTimeoutForToken(maybeFreshToken);
        }
      }, delay);
    };
    setRefreshTimeoutForToken(token);
    return () => {
      this.resetTokenRefreshHandler();
    };
  }

  /**
   * Attempts to update the token of the current session, which re-use the current connection. If the new token does not have the same roles as the current session, an error will be thrown.
   */
  async updateSessionToken(token: string) {
    if (this.client.awaitReady) await this.client.awaitReady;
    if (!this.currentSession) {
      throw new NoActiveSessionError();
    }
    const decodedToken = decodeToken(token);
    if (!decodedToken) throw new TokenDecodingError(decodedToken);
    if (tokenIsExpired(decodedToken)) throw new TokenExpiredError();
    // probably could just get this from the client constructor options?
    // if we guarantee that the client is always using that schema
    const sessionRoles = getRolesFromSession(
      this.client.db.schema,
      normalizeSessionVars(decodedToken)
    );
    if (
      !sessionRolesAreEquivalent(this.client.db.session?.roles, sessionRoles)
    ) {
      throw new SessionRolesMismatchError();
    }
    // @ts-expect-error private method
    this.client.updateToken(token, true);
    // TODO: handle offline gracefully
    const didSend = this.updateTokenForSession(token);
    if (!didSend) {
      // There is a chance the message to update the token wont send, for safety just try again once more
      const sentAfterDelay = await new Promise<boolean>((res, rej) =>
        setTimeout(() => res(this.updateTokenForSession(token)), 1000)
      );
      if (!sentAfterDelay)
        // TODO: end session?
        // If this throws, we should evaluate how to handle different states of our websocket transport and if/when we should queue messages
        throw new TriplitError(
          'Failed to update the session token for the current session.'
        );
    }
    this.currentSession.token = token;
  }

  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  resetTokenRefreshHandler() {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  /**
   * Manually send any pending writes to the remote database. This may be a no-op if:
   * - there is already a push in progress
   * - the connection is not open
   * - the server is not ready
   *
   * This will switch the active and inactive buffers if we are able to push
   *
   * If the push is successful, it will return `success: true`. If the push fails, it will return `success: false` and a `failureReason`.
   */
  async syncWrites(): Promise<{
    didSync: boolean;
    syncFailureReason?: string;
  }> {
    if (this.syncInProgress) {
      return {
        didSync: false,
        syncFailureReason: 'Sync in progress',
      };
    }
    if (this.connectionStatus !== 'OPEN') {
      return {
        didSync: false,
        syncFailureReason: 'Connection not open',
      };
    }
    if (!this.serverReady) {
      return {
        didSync: false,
        syncFailureReason: 'Server not ready',
      };
    }

    if (this.client.awaitReady) await this.client.awaitReady;
    // We are good to sync, check if we should switch buffers and attempt sync
    const shouldSwitch = await this.client.db.entityStore.doubleBuffer
      .getLockedBuffer()
      .isEmpty(this.client.db.kv);
    if (shouldSwitch) {
      this.client.db.entityStore.doubleBuffer.lockAndSwitchBuffers();
    }
    await this.trySyncLockedBuffer();
    return {
      didSync: true,
    };
  }

  /**
   * FOR INTERNAL USE ONLY, in most cases (even internally) you should use the safer `syncWrites` method
   *
   * This method will attempt to send the changes in the locked buffer to the server and mutates the `syncInProgress` state.
   */
  private async trySyncLockedBuffer() {
    // Block others from attempting sync
    this.syncInProgress = true;
    try {
      const changes = await this.client.db.entityStore.doubleBuffer
        .getLockedBuffer()
        .getChanges(this.client.db.kv);
      if (!isEmpty(changes)) {
        // Just in case it was toggled off during any async processing
        this.syncInProgress = true;
        return this.sendChanges(changes);
      } else {
        // No changes, so weve synced
        this.syncInProgress = false;
      }
    } catch (e) {
      // Something failed so not in progress
      this.syncInProgress = false;
      throw e;
    }
  }

  private async createRollbackBufferFromChanges(
    changes: DBChanges
  ): Promise<DBChanges> {
    const rollbackChanges: DBChanges = {};

    for (const [collection, { sets, deletes }] of Object.entries(changes)) {
      rollbackChanges[collection] = { sets: new Map(), deletes: new Set() };
      const dataStore = this.client.db.entityStore.dataStore;
      const kv = this.client.db.kv;

      // Handle deletes first, and don't revert a delete
      // if there was nothing in the cache to begin with
      for (const id of deletes) {
        const entity = await dataStore.getEntity(kv, collection, id);
        if (entity) rollbackChanges[collection].sets.set(id, entity);
      }

      // Handle sets
      for (const id of sets.keys()) {
        if (rollbackChanges[collection].sets.has(id)) continue;

        const entity = await dataStore.getEntity(kv, collection, id);
        if (entity) {
          rollbackChanges[collection].sets.set(id, entity);
        } else {
          rollbackChanges[collection].deletes.add(id);
        }
      }
    }

    return rollbackChanges;
  }

  async clearPendingChangesForEntity(collection: string, id: string) {
    if (this.client.awaitReady) await this.client.awaitReady;
    const tx = this.client.db.kv.transact();
    const outboxChange = await this.client.db.entityStore.doubleBuffer
      .getUnlockedBuffer()
      .getChangesForEntity(tx, collection, id);
    const buffer: DBChanges = {
      [collection]: {
        sets: new Map(),
        deletes: new Set(),
      },
    };
    if (outboxChange) {
      if (outboxChange.delete) {
        buffer[collection].deletes.add(id);
      }
      if (outboxChange.update) {
        buffer[collection].sets.set(id, outboxChange.update);
      }
    }
    const rollbackChanges = await this.createRollbackBufferFromChanges(buffer);
    await this.client.db.entityStore.doubleBuffer
      .getUnlockedBuffer()
      .clearChangesForEntity(tx, collection, id);
    await tx.commit();
    await this.client.db.ivm.bufferChanges(rollbackChanges);
    await this.client.db.updateQueryViews();
    this.client.db.broadcastToQuerySubscribers();
    // because we've surgically removed the changes for this entity
    // there might be other changes that we can sync
    // TODO: is this desired behavior every time?
    return this.syncWrites();
  }

  async clearPendingChangesAll() {
    if (this.client.awaitReady) await this.client.awaitReady;
    const tx = this.client.db.kv.transact();
    const changes = await this.client.db.entityStore.doubleBuffer
      .getUnlockedBuffer()
      .getChanges(this.client.db.kv);
    const rollbackChanges = await this.createRollbackBufferFromChanges(changes);
    await this.client.db.entityStore.doubleBuffer.getUnlockedBuffer().clear(tx);
    await tx.commit();
    await this.client.db.ivm.bufferChanges(rollbackChanges);
    await this.client.db.updateQueryViews();
    this.client.db.broadcastToQuerySubscribers();
  }

  /**
   * @hidden
   */
  private async updateTokenForSession(token: string) {
    try {
      await fetch(`${this.client.serverUrl}/update-token`, {
        method: 'POST',
        body: JSON.stringify({
          clientId: this.clientId,
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      return true;
    } catch (e) {
      console.error(e);
      // @ts-expect-error
      this.logger.error('Failed to update token', e);
      return false;
    }
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

  async getConnectionParams(): Promise<Partial<TransportConnectParams>> {
    if (this.client.awaitReady) await this.client.awaitReady;
    return {
      syncSchema: this.client.syncSchema,
      token: this.client.token,
      server: this.client.serverUrl,
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
      const queryWithRelationalInclusions =
        createQueryWithRelationalOrderAddedToIncludes(
          createQueryWithExistsAddedToIncludes(
            prepareQuery(
              queryMetadata.params,
              this.client.db.schema?.['collections'],
              {},
              undefined,
              {
                applyPermission: undefined,
              }
            )
          )
        );
      // We should only consider your cache data for checkpointed fetch
      // We dont have a great API for this right now, so using the DB's query engine directly
      const queryEngine = new EntityStoreQueryEngine(
        this.client.db.kv,
        this.client.db.entityStore.dataStore
      );
      const syncedResults = await queryEngine.fetch(
        queryWithRelationalInclusions
      );
      const changesFromResults = queryResultsToChanges(
        syncedResults,
        queryWithRelationalInclusions
      );

      const entityIds = changesToEntityIds(changesFromResults);

      queryState = {
        timestamp: latestServerTimestamp,
        // we should be able to retrieve these from the denormalized changes
        // that are stored in IVM, assuming that the subscription is initialized
        // In the case of background subscription, there won't be
        // any record of the query in IVM, so we can just fall back to fetchChanges
        // BUT if we go down that way then there's a contract that what
        // comes out of IVM and watch we get from fetchChanges is the same
        entityIds,
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

  /**
   * A hash of the last set of connected params, should not reconnect if the same params are used twice and the connection is already open
   */
  private lastParamsHash: number | undefined = undefined;

  async connect() {
    this.createConnection(this.currentSession);
  }

  /**
   * Initiate a sync connection with the server
   */
  createConnection(session: SyncSession | undefined) {
    // Validate that there is enough information to connect
    if (!this.validateSessionWithWarning(session)) return;
    // If we are creating a connection for a session that is not the current session, we should not proceed
    if (this.currentSession !== session) return;
    // If we are already connected, we should not proceed
    if (session.status === 'OPEN') return;
    if (session.status === 'CONNECTING') {
      console.warn('Already connecting, ignoring connect call');
      return;
    }
    session.status = 'CONNECTING';
    this.fireConnectionChangeHandlers(session);
    // if (isOpeningConnection) {
    //   console.log('OPENING CONNECTION');

    //   // this.lastParamsHash = undefined; // reset lastParamsHash
    // }

    // // TODO: we are sort of double checking this
    // const paramsHash = hashObject({
    //   token: this.currentSession.token,
    //   server: this.currentSession.serverUrl,
    // });
    // console.log(paramsHash, this.lastParamsHash);
    // // We can get stuck CONNECTING here in reconnect loop
    // // Dont reconnect with the same parameters
    // // if (this.lastParamsHash === paramsHash) return;

    // Setup connection
    this.transport.connect({
      token: session.token,
      server: session.serverUrl,
      syncSchema: false,
      schema: undefined,
    });

    // Setup listeners
    // There is still probably too much "global" state that we should continue to refactor
    // To prevent confusion, we are binding the handlers to the current session so they only update that session
    this.transport.onMessage(this.onMessageHandler(session).bind(this));
    this.transport.onOpen(this.onOpenHandler(session).bind(this));
    this.transport.onClose(this.onCloseHandler(session).bind(this));
    this.transport.onError(this.onErrorHandler(session).bind(this));
  }

  private async initializeSync() {
    const syncStatus = await this.syncWrites();
    if (!syncStatus.didSync) {
      this.logger.warn(
        `Failed to send changes on initialization: ${syncStatus.syncFailureReason}`
      );
    }
    // Reconnect any queries
    for (const [id] of this.queries) {
      this.connectQuery(id);
    }
  }

  // TODO: add an onError handler to gracefully handle errors in message handlers
  private onMessageHandler(session: SyncSession) {
    return async (evt: any) => {
      const message: ServerSyncMessage = JSON.parse(evt.data);
      this.logger.debug('received', message);
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
        if (this.client.awaitReady) await this.client.awaitReady;
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
        if (this.client.awaitReady) await this.client.awaitReady;

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
        await this.client.db.entityStore.doubleBuffer
          .getLockedBuffer()
          .clear(tx);
        await tx.commit();
        for (const [collection, entityCallbackMap] of this
          .entitySyncSuccessSubscribers) {
          const collectionChanges = ackedChanges[collection];
          if (!collectionChanges) continue;
          for (const [id, callback] of entityCallbackMap) {
            if (
              collectionChanges.sets.has(id) ||
              collectionChanges.deletes.has(id)
            ) {
              // Not awaiting as these callbacks are not designed to interrupt/disrupt outbox
              // processing
              callback();
            }
          }
        }
        this.syncInProgress = false;
        // empty the outbox
        // this.checkUnlockedBufferAndSendAnyChanges();
        await this.syncWrites();
      }

      if (message.type === 'CLOSE') {
        const { payload } = message;
        this.logger.info(
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
        const { payload } = message;
        const { clientId } = payload;
        this.clientId = clientId;

        if (!this.serverReady) {
          this.serverReady = true;
          await this.initializeSync();
        }
      }
    };
  }

  private onOpenHandler(session: SyncSession) {
    return () => {
      session.status = 'OPEN';
      this.fireConnectionChangeHandlers(session);
      this.resetReconnectTimeout();
      this.logger.info('sync connection has opened');
    };
  }

  private onCloseHandler(session: SyncSession) {
    return (evt: any) => {
      // Clear any sync state
      this.resetSyncConnectionState();
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
          this.logger.error(
            'The server has closed the connection because the client is unauthorized. Please provide a valid token.'
          );
        }
        if (type === 'SCHEMA_MISMATCH') {
          this.logger.error(
            'The server has closed the connection because the client schema does not match the server schema. Please update your client schema.'
          );
        }

        if (type === 'TOKEN_EXPIRED') {
          this.logger.error(
            'The server has closed the connection because the token has expired. Fetch a new token from your authentication provider and call `TriplitClient.endSession()` and `TriplitClient.startSession(token)` to restart the session.'
          );
        }

        if (type === 'ROLES_MISMATCH') {
          this.logger.error(
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
            handler(type as SessionError);
          }
        }

        if (!retry) {
          // early return to prevent reconnect
          this.logger.warn(
            'The connection has closed. Based on the signal, the connection will not automatically retry. If you would like to reconnect, please call `connect()`.'
          );
          session.status = 'CLOSED';
          this.fireConnectionChangeHandlers(session);
          return;
        }
      }

      // TODO: what is the right way to smooth this out?
      session.status = 'CLOSED';
      this.fireConnectionChangeHandlers(session);

      // Attempt to reconnect with backoff
      const connectionHandler = this.connect.bind(this);
      this.reconnectTimeout = setTimeout(
        connectionHandler,
        this.reconnectTimeoutDelay
      );
      this.reconnectTimeoutDelay = Math.min(
        300000, // 5 minutes max
        this.reconnectTimeoutDelay * 2
      );
    };
  }

  private onErrorHandler(session: SyncSession) {
    return (evt: any) => {
      // WS errors are intentionally vague, so just log a message
      this.logger.error(
        'An error occurred during the connection to the server. Retrying connection...'
      );
      // on error, close the connection and attempt to reconnect
      this.closeConnection();
    };
  }

  private lastKnownConnectionStatus: ConnectionStatus = 'UNINITIALIZED';
  private fireConnectionChangeHandlers(session: SyncSession | undefined) {
    // ONLY fire connection change handlers if the session is the current session
    // This prevents firing handlers for old sessions that are no longer active
    const isCurrentSession = session === this.currentSession;
    if (!isCurrentSession) return;
    // If the status has not changed, do not fire handlers
    const statusChanged =
      this.lastKnownConnectionStatus !== this.connectionStatus;
    if (!statusChanged) return;
    this.lastKnownConnectionStatus = this.connectionStatus;
    for (const handler of this.connectionChangeHandlers) {
      handler(this.connectionStatus);
    }
  }

  /**
   * The current connection status of the sync engine
   */
  get connectionStatus() {
    if (!this.currentSession) return 'UNINITIALIZED';
    return this.currentSession.status;
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.currentSession) {
      this.currentSession.status = 'CLOSING';
      this.fireConnectionChangeHandlers(this.currentSession);
    }
    this.closeConnection({ type: 'MANUAL_DISCONNECT', retry: false });
  }

  /**
   * Resets the server acks for remote queries.
   * On the next connection, queries will be re-sent to server as if there is no previous seen data.
   * If the connection is currently open, it will be closed and you will need to call `connect()` again.
   */
  // TODO: we have a different queryState concept so this is confusing
  resetQueryState() {
    if (this.connectionStatus === 'OPEN') {
      this.logger.warn(
        'You are resetting the sync engine while the connection is open. To avoid unexpected behavior the connection will be closed and you should call `connect()` again after resetting. To hide this warning, call `disconnect()` before resetting.'
      );
      this.disconnect();
    }
    this.resetSyncConnectionState();
  }

  /**
   * Resets all state related to a sync connection (so if we lose connection, this should reset)
   *
   * Marks all queries as unsent and resets the syncInProgress indicator, so on next connection we will re-send data to the server
   */
  private resetSyncConnectionState() {
    this.syncInProgress = false;
    for (const queryMetadata of this.queries.values()) {
      queryMetadata!.hasSent = false;
      queryMetadata!.syncState = 'NOT_STARTED';
    }
  }

  private async handleErrorMessage(message: ServerErrorMessage) {
    const { error, metadata, messageType } = message.payload;
    this.logger.error(error.name, metadata);
    switch (error.name) {
      case 'MalformedMessagePayloadError':
      case 'UnrecognizedMessageTypeError':
        this.logger.warn(
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
      if (this.client.awaitReady) await this.client.awaitReady;
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
      this.logger.debug('sent', message);
      for (const handler of this.messageSentSubscribers) {
        handler(message);
      }
    }

    return didSend;
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
    if (runImmediately) callback(this.connectionStatus);
    return () => {
      this.connectionChangeHandlers.delete(callback);
    };
  }

  private closeConnection(reason?: CloseReason) {
    this.transport.close(reason);
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

  private validateSessionWithWarning(
    session: SyncSession | undefined
  ): session is Required<SyncSession> {
    if (!session) {
      this.logger.warn(
        'You are attempting to connect to the server but no session is defined. Please ensure you are providing a token and serverUrl in the TriplitClient constructor or run startSession(token) to setup a session.'
      );
      return false;
    }
    const missingParams = [];
    if (!session.token) missingParams.push('token');
    if (!session.serverUrl) missingParams.push('serverUrl');
    if (missingParams.length) {
      this.logger.warn(
        `You are attempting to connect but the connection cannot be opened because the required parameters are missing: [${missingParams.join(
          ', '
        )}].`
      );
      return false;
    }
    return true;
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
