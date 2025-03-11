import {
  DB,
  DBChanges,
  TriplitError,
  diffSchemas,
  getBackwardsIncompatibleEdits,
} from '@triplit/db';
import { QuerySyncError, UnrecognizedMessageTypeError } from './errors.js';
import { isTriplitError } from './utils.js';
import {
  ServerSyncMessage,
  ClientSyncMessage,
  ServerCloseReason,
  ClientConnectQueryMessage,
  ClientDisconnectQueryMessage,
  ClientChangesMessage,
  ClientSchemaResponseMessage,
} from '@triplit/types/sync';
import {
  hasAdminAccess,
  throttle,
  isChunkedMessageComplete,
} from './session.js';
import { TriplitJWT } from './token.js';
import { logger } from '@triplit/logger';
import SuperJSON from 'superjson';
import { mergeDBChanges } from '@triplit/db/changes-buffer';
import { COMPATIBILITY_LIST_KEY } from './constants.js';

export interface ConnectionOptions {
  clientSchemaHash: number | undefined;
  syncSchema?: boolean | undefined;
}

const INCOMPATIBLE_SCHEMA_PAYLOAD = {
  type: 'SCHEMA_MISMATCH',
  retry: false,
  message:
    'The client schema is not backwards compatible with the server schema.',
};

//TODO: this should be able to close the WS itself
// Currently just sends a 'CLOSE' message, not sure there's a guarantee the connection closes
export class SyncConnection {
  connectedQueries: Map<
    string,
    {
      unsubscribe: () => void;
      serverHasRespondedOnce: boolean;
      externalQueryId: string;
    }
  >;
  listeners: Set<(messageType: string, payload: {}) => void>;
  chunkedMessages: Map<string, string[]> = new Map();
  subscriptionDataBuffer: { changedQueries: Set<string>; changes: DBChanges } =
    { changedQueries: new Set(), changes: {} };
  // querySyncer: ReturnType<DB['createQuerySyncer']>;
  private started = false;
  private canSync = false;

  constructor(
    public token: TriplitJWT,
    public db: DB,
    public options: ConnectionOptions
  ) {
    this.db = this.db.withSessionVars(token);
    this.connectedQueries = new Map();
    this.listeners = new Set();
  }

  async start() {
    if (this.started) return;
    // If the client is schemaless, we will allow the connection and safe use of data is up to the client
    // Client writes may be rejected based on server schema
    if (this.options.clientSchemaHash === undefined) {
      this.canSync = true;
      return this.sendMessage('READY', {});
    }

    // If the server is schemaless and the client is not, we should not sync
    // The server may send unhandle-able data and break a client application
    if (!this.db.schema) {
      this.canSync = false;
      return this.sendMessage('CLOSE', {
        type: 'SCHEMA_MISMATCH',
        retry: false,
        message:
          'The server does not have a schema, but the connecting client does. The server may send un-handleable data and break the client application.',
      });
    }

    // TODO: evaluate if we should cache this value (requiring read to storage might add to read pressure under load, or be blocked)
    const compatibilityList =
      (await this.db.getMetadata(COMPATIBILITY_LIST_KEY)) ?? [];
    // If we recognize the client schema hash as compatible, we can sync
    if (compatibilityList.includes(this.options.clientSchemaHash)) {
      this.canSync = true;
      return this.sendMessage('READY', {});
    }

    // If we don't recognize the client schema hash, request more information
    return this.sendMessage('SCHEMA_REQUEST', {});
  }

  sendMessage<Msg extends ServerSyncMessage>(
    messageType: Msg['type'],
    payload: Msg['payload']
  ) {
    logger.debug('Sending message', { messageType, payload });
    for (const listener of this.listeners) {
      listener(messageType, payload);
    }
  }

  addListener(listener: (messageType: string, payload: {}) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  close() {
    for (const { unsubscribe } of this.connectedQueries.values()) {
      unsubscribe();
    }
  }

  sendErrorResponse(
    originalMessageType: string | undefined,
    error: TriplitError,
    metadata?: any
  ) {
    const messageType = originalMessageType;
    let payload = {
      messageType,
      error: error.toJSON(),
      metadata,
    };
    this.sendMessage('ERROR', payload);
  }

  private bufferEntityData(changes: DBChanges, queryId?: string) {
    this.subscriptionDataBuffer.changes = mergeDBChanges(
      this.subscriptionDataBuffer.changes,
      changes
    );
    if (!queryId) {
      throw new Error('queryId is required to bufferEntityData');
    }
    this.subscriptionDataBuffer.changedQueries.add(queryId!);
  }

  flushEntityDataToClient() {
    if (this.subscriptionDataBuffer.changedQueries.size === 0) return;
    this.sendMessage('ENTITY_DATA', {
      changes: SuperJSON.serialize(this.subscriptionDataBuffer.changes),
      timestamp: this.db.clock.current(),
      forQueries: Array.from(this.subscriptionDataBuffer.changedQueries),
    });
    this.subscriptionDataBuffer = {
      changedQueries: new Set(),
      changes: {},
    };
  }

  async handleConnectQueryMessage(
    msgParams: ClientConnectQueryMessage['payload']
  ) {
    const { id: queryKey, params: query, state } = msgParams;
    try {
      // TODO: handle this more centrally so a ENTITY_DATA message can be sent for multiple
      // subscribed queries at once
      const unsubscribe = this.db.subscribeChanges(
        query,
        this.bufferEntityData.bind(this),
        {
          queryState: state,
          skipRules: hasAdminAccess(this.token),
          queryKey,
          errorCallback: (error) => {
            throw error;
          },
        }
      );

      // TODO: should we be doing this?
      if (this.connectedQueries.has(queryKey)) {
        this.connectedQueries.get(queryKey)?.unsubscribe();
      }
      // TODO: use the variables-replaced queryId
      this.connectedQueries.set(queryKey, {
        unsubscribe,
        serverHasRespondedOnce: false,
        externalQueryId: queryKey,
      });

      await this.db.updateQueryViews();
      this.db.broadcastToQuerySubscribers();
    } catch (e) {
      logger.error('Connect query error', e as Error);
      const innerError = isTriplitError(e)
        ? e
        : new TriplitError(
            'An unknown error occurred while processing your request.'
          );
      this.sendErrorResponse('CONNECT_QUERY', new QuerySyncError(innerError), {
        queryKey,
        innerError,
      });
    }
  }

  handleDisconnectQueryMessage(
    msgParams: ClientDisconnectQueryMessage['payload']
  ) {
    const { id: queryKey } = msgParams;
    // const internalQueryId = Array.from(this.connectedQueries.entries()).find(
    //   ([_internalId, entry]) => entry.externalQueryId === queryKey
    // )?.[0];
    // if (!internalQueryId) return;
    // this.querySyncer.unregisterQuery(internalQueryId);
    if (this.connectedQueries.has(queryKey)) {
      this.connectedQueries.get(queryKey)?.unsubscribe();
      this.connectedQueries.delete(queryKey);
    }
  }

  // in case TRIPLES_PENDING requests pile up, throttle them
  // Or figure out a better way to tap into queue of pending requests
  private throttledTriplesRequest = throttle(
    () => this.sendMessage('TRIPLES_REQUEST', {}),
    10
  );

  handleTriplesPendingMessage() {
    this.throttledTriplesRequest();
  }

  async handleChangesMessage(msgParams: ClientChangesMessage['payload']) {
    const changes = SuperJSON.deserialize<DBChanges>(msgParams.changes);
    const timestamp = this.db.clock.next();
    try {
      await this.db.applyChangesWithTimestamp(changes, timestamp, {
        skipRules: hasAdminAccess(this.token),
      });
      this.sendMessage('CHANGES_ACK', { timestamp });
      // TODO: determine if this should be on some sort of interval or managed/triggered elsewhere
      await this.db.updateQueryViews();
      this.db.broadcastToQuerySubscribers();
    } catch (e) {
      logger.error('Changes error', e as Error);
      const error = isTriplitError(e)
        ? e
        : new TriplitError(
            'An unknown error occurred while processing your request.'
          );
      // TODO: test error payloads
      this.sendErrorResponse('CHANGES', new TriplitError(), {
        failures: Object.keys(changes).map((collection) => ({
          txId: JSON.stringify(timestamp),
          collection,
          error: error.toJSON(),
        })),
      });
    }
  }

  handleChunkMessage(msgParams: {
    data: string;
    total: number;
    index: number;
    id: string;
  }) {
    const { data, total, index, id } = msgParams;
    if (!this.chunkedMessages.has(id)) {
      this.chunkedMessages.set(id, []);
    }
    const chunks = this.chunkedMessages.get(id)!;
    chunks[index] = data;
    if (isChunkedMessageComplete(chunks, total)) {
      const message = JSON.parse(this.chunkedMessages.get(id)!.join(''));
      this.chunkedMessages.delete(id);
      this.dispatchCommand(message);
    }
  }

  private async handleSchemaResponseMessage(
    msgParams: ClientSchemaResponseMessage['payload']
  ) {
    const { schema: clientSchema } = msgParams;

    // If client is schemaless, we can sync but will reject invalid changes on server
    if (!clientSchema) {
      this.canSync = true;
      return this.sendMessage('READY', {});
    }

    const serverSchema = this.db.getSchema();
    // If server is schemaless, we may corrupt a client and probably shouldnt sync
    if (!serverSchema) {
      this.canSync = false;
      return this.sendMessage('CLOSE', INCOMPATIBLE_SCHEMA_PAYLOAD);
    }

    const diff = diffSchemas(clientSchema, serverSchema);

    const allowClientToSync = async () => {
      const hashes =
        (await this.db.getMetadata<number[]>(COMPATIBILITY_LIST_KEY)) ?? [];
      if (!hashes.includes(this.options.clientSchemaHash!)) {
        await this.db.setMetadata(COMPATIBILITY_LIST_KEY, [
          ...hashes,
          this.options.clientSchemaHash!,
        ]);
      }
      this.canSync = true;
      this.sendMessage('READY', {});
    };

    // Schemas are identical, we can sync
    if (diff.length === 0) {
      return await allowClientToSync();
    }

    const incompatibleEdits = getBackwardsIncompatibleEdits(diff);
    const isSchemaCompatible = incompatibleEdits.length === 0;
    console.dir(incompatibleEdits, { depth: null });

    // If schema is incompatible, we shouldnt sync
    if (!isSchemaCompatible) {
      this.canSync = false;
      return this.sendMessage('CLOSE', INCOMPATIBLE_SCHEMA_PAYLOAD);
    }

    // If schema is compatible, we can sync
    await allowClientToSync();
  }

  dispatchCommand(message: ClientSyncMessage) {
    logger.debug('Received message', message);
    try {
      if (message.type === 'SCHEMA_RESPONSE') {
        return this.handleSchemaResponseMessage(message.payload);
      }
      if (!this.canSync) {
        return this.sendErrorResponse(
          message.type,
          new TriplitError('Server not ready for messages')
        );
      }
      switch (message.type) {
        case 'CONNECT_QUERY':
          return this.handleConnectQueryMessage(message.payload);
        case 'DISCONNECT_QUERY':
          return this.handleDisconnectQueryMessage(message.payload);
        case 'CHANGES':
          return this.handleChangesMessage(message.payload);
        case 'CHUNK':
          return this.handleChunkMessage(message.payload);
        default:
          return this.sendErrorResponse(
            // @ts-ignore
            message.type,
            // @ts-ignore
            new UnrecognizedMessageTypeError(message.type)
          );
      }
    } catch (e) {
      logger.error('Error while dispatching command', e as Error);
      return this.sendErrorResponse(
        message.type,
        isTriplitError(e)
          ? e
          : new TriplitError(
              'An unknown error occurred while processing your request.'
            )
      );
    }
  }

  // used?
  async insert(collectionName: string, entity: any) {
    return this.db.insert(collectionName, entity);
  }

  // TODO: handle references to this in tenant-db and legacy-node-server
  async isClientSchemaCompatible(): Promise<ServerCloseReason | undefined> {
    throw new Error('NOT IMPLEMENTED');
  }
}
