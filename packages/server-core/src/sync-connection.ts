import {
  CollectionNameFromModels,
  CollectionQuery,
  DB,
  DBChanges,
  HybridLogicalClock,
  PreparedQuery,
  TriplitError,
  diffSchemas,
  getBackwardsIncompatibleEdits,
  prepareQuery,
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
  QueryState,
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
import {
  createQueryWithExistsAddedToIncludes,
  createQueryWithRelationalOrderAddedToIncludes,
  diffChanges,
  queryResultsToChanges,
} from '@triplit/db/ivm';

export interface ConnectionOptions {
  clientSchemaHash: number | undefined;
  syncSchema?: boolean | undefined;
  clientId: string;
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
      // TODO: This works with existing types, but evaluate if this is accurate
      externalQuery: PreparedQuery;
      checkpoint?: QueryState;
    }
  >;
  listeners: Set<(messageType: string, payload: {}) => void>;
  chunkedMessages: Map<string, string[]> = new Map();
  subscriptionDataBuffer: {
    changedQueries: Set<string>;
    changes: DBChanges;
    queryEntities: Map<string, DBChanges>;
  } = { changedQueries: new Set(), changes: {}, queryEntities: new Map() };
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

  sendReadyMsg() {
    return this.sendMessage('READY', {
      clientId: this.options.clientId,
    });
  }

  async start() {
    if (this.started) return;
    // If the client is schemaless, we will allow the connection and safe use of data is up to the client
    // Client writes may be rejected based on server schema
    if (this.options.clientSchemaHash === undefined) {
      this.canSync = true;
      return this.sendReadyMsg();
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
      return this.sendReadyMsg();
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

  // TODO handle the async nature of this
  private async bufferEntityData(results: any[], queryId?: string) {
    if (!queryId) {
      throw new Error('queryId is required to bufferEntityData');
    }
    const queryInfo = this.connectedQueries.get(queryId)!;
    const changes = queryResultsToChanges(results, queryInfo.externalQuery);
    let unionOfChangesBefore = {};
    let unionOfChangesAfter = {};
    for (const [qId, qEntities] of this.subscriptionDataBuffer.queryEntities) {
      unionOfChangesBefore = mergeDBChanges(
        unionOfChangesBefore,
        structuredClone(qEntities)
      );
      if (qId === queryId) {
        unionOfChangesAfter = mergeDBChanges(
          unionOfChangesAfter,
          structuredClone(changes)
        );
      } else {
        unionOfChangesAfter = mergeDBChanges(
          unionOfChangesAfter,
          structuredClone(qEntities)
        );
      }
    }
    this.subscriptionDataBuffer.queryEntities.set(
      queryId!,
      structuredClone(changes)
    );
    let changeDiff = diffChanges(unionOfChangesBefore, unionOfChangesAfter);

    if (!queryInfo.serverHasRespondedOnce && queryInfo.checkpoint) {
      const entitiesThatHaveNotChanged: Record<string, Set<string>> = {};
      const entitiesThatAreNoLongerInTheResultSet: Record<
        string,
        Set<string>
      > = {};

      for (const [collection, entityIds] of Object.entries(
        queryInfo.checkpoint.entityIds
      )) {
        for (const entityId of entityIds) {
          if (!entityIsInChangeset(changes, collection, entityId)) {
            if (!entitiesThatAreNoLongerInTheResultSet[collection]) {
              entitiesThatAreNoLongerInTheResultSet[collection] = new Set();
            }
            entitiesThatAreNoLongerInTheResultSet[collection].add(entityId);
            // out of the results and in the results but unchanged
            // are mutually exclusive categories so we can skip
            // timestamp checking
            continue;
          }
          const timestamp =
            await this.db.entityStore.metadataStore.getTimestampForEntity(
              this.db.kv,
              collection,
              entityId
            );
          if (
            // TODO: determine if timestamp can ever be undefined
            // I think the only case could be if the entity was optimistically inserted
            // on the client but never synced to the server
            // assuming that we don't delete metadata when we delete entities
            timestamp &&
            HybridLogicalClock.compare(
              timestamp,
              queryInfo.checkpoint.timestamp
            ) < 0
          ) {
            if (!entitiesThatHaveNotChanged[collection]) {
              entitiesThatHaveNotChanged[collection] = new Set();
            }
            entitiesThatHaveNotChanged[collection].add(entityId);
          }
        }
      }

      // step 2: filter out unchanged entities from the new changeset
      changeDiff = {};
      for (const collection in changes) {
        changeDiff[collection] = {
          sets: new Map(),
          deletes: changes[collection].deletes,
        };
        for (const [id, patch] of changes[collection].sets) {
          if (entitiesThatHaveNotChanged[collection]?.has(id)) {
            continue;
          }
          changeDiff[collection].sets.set(id, patch);
        }
      }

      // step 3: for any entities that are no longer in the result set,
      // get any updates or deletes and add them to the changeset
      for (const [collectionName, entityIds] of Object.entries(
        entitiesThatAreNoLongerInTheResultSet
      )) {
        const stillMissingEntityIds = new Set(entityIds);
        if (!changeDiff[collectionName]) {
          changeDiff[collectionName] = {
            sets: new Map(),
            deletes: new Set(),
          };
        }
        const addedChanges = await this.db.fetchChanges({
          collectionName: collectionName as CollectionNameFromModels<any>,
          where: [['id', 'in', Array.from(entityIds)]],
        });
        for (const [id, addedChange] of addedChanges[collectionName].sets) {
          stillMissingEntityIds.delete(id);
          changeDiff[collectionName].sets.set(id, addedChange);
        }
        for (const entityId of stillMissingEntityIds) {
          changeDiff[collectionName].deletes.add(entityId);
        }
      }
    }
    queryInfo.serverHasRespondedOnce = true;
    this.subscriptionDataBuffer.changes = mergeDBChanges(
      this.subscriptionDataBuffer.changes,
      changeDiff
    );
    this.subscriptionDataBuffer.changedQueries.add(queryId!);
  }

  flushEntityDataToClient() {
    if (this.subscriptionDataBuffer.changedQueries.size === 0) return;
    this.sendMessage('ENTITY_DATA', {
      changes: SuperJSON.serialize(this.subscriptionDataBuffer.changes),
      timestamp: this.db.clock.current(),
      forQueries: Array.from(this.subscriptionDataBuffer.changedQueries),
    });

    // Flush subscription data state excluding the entities for the queries
    this.subscriptionDataBuffer.changes = {};
    this.subscriptionDataBuffer.changedQueries = new Set();
  }

  async handleConnectQueryMessage(
    msgParams: ClientConnectQueryMessage['payload']
  ) {
    const { id: queryKey, params: query, state } = msgParams;
    try {
      // TODO figure out better way to manage this especially on unsubscribe
      // and when there are multiple subs to the same query
      this.subscriptionDataBuffer.queryEntities.set(queryKey, {});
      const queryWithRelationalInclusions =
        createQueryWithRelationalOrderAddedToIncludes(
          createQueryWithExistsAddedToIncludes(
            prepareQuery(
              query,
              this.db.schema?.collections,
              this.db.systemVars,
              this.db.session,
              {
                applyPermission: hasAdminAccess(this.token)
                  ? undefined
                  : 'read',
              }
            )
          )
        );
      const unsubscribe = this.db.subscribeRaw(
        queryWithRelationalInclusions,
        this.bufferEntityData.bind(this),
        (err) => {
          throw err;
        },
        {
          queryState: state,
          queryKey,
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
        externalQuery: queryWithRelationalInclusions,
        checkpoint: state,
      });

      await this.db.updateQueryViews();
      this.db.broadcastToQuerySubscribers();
    } catch (e) {
      logger.error('Error while processing message CONNECT_QUERY', e as Error);
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
      logger.error('Error while processing message CHANGES', e as Error);
      const error = isTriplitError(e)
        ? e
        : new TriplitError(
            'An unknown error occurred while processing your request.'
          );
      // TODO: test error payloads
      this.sendErrorResponse('CHANGES', error, {
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
      return this.sendReadyMsg();
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
      this.sendReadyMsg();
    };

    // Schemas are identical, we can sync
    if (diff.length === 0) {
      return await allowClientToSync();
    }

    const incompatibleEdits = getBackwardsIncompatibleEdits(diff);
    const isSchemaCompatible = incompatibleEdits.length === 0;

    // If schema is incompatible, we shouldnt sync
    if (!isSchemaCompatible) {
      this.canSync = false;
      return this.sendMessage('CLOSE', INCOMPATIBLE_SCHEMA_PAYLOAD);
    }

    // If schema is compatible, we can sync
    await allowClientToSync();
  }

  handlePingMessage() {
    // Helps keep the connection alive
    // Do nothing, we could respond with PONG
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
        case 'PING':
          return this.handlePingMessage();
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

function entityIsInChangeset(
  changes: DBChanges,
  collection: string,
  entityId: string
) {
  return (
    changes[collection] &&
    (changes[collection].sets.has(entityId) ||
      changes[collection].deletes.has(entityId))
  );
}
