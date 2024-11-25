import DB, { TriplitError, schemaToJSON, hashSchemaJSON } from '@triplit/db';
import {
  QuerySyncError,
  TriplesInsertError,
  UnrecognizedMessageTypeError,
} from './errors.js';
import {
  groupTriplesByTimestamp,
  insertTriplesByTransaction,
  isTriplitError,
} from './utils.js';
import {
  ServerSyncMessage,
  ClientSyncMessage,
  ServerCloseReason,
  ClientConnectQueryMessage,
  ClientDisconnectQueryMessage,
  ClientTriplesMessage,
} from '@triplit/types/sync';
import {
  hasAdminAccess,
  throttle,
  isChunkedMessageComplete,
} from './session.js';
import { TriplitJWT, parseAndValidateToken } from './token.js';
import { Logger } from './logging.js';

export interface ConnectionOptions {
  clientId: string;
  clientSchemaHash: number | undefined;
  syncSchema?: boolean | undefined;
}

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
  querySyncer: ReturnType<DB['createQuerySyncer']>;
  constructor(
    public token: TriplitJWT,
    public db: DB,
    private logger: Logger,
    public options: ConnectionOptions
  ) {
    this.db = this.db.withSessionVars(token);
    this.connectedQueries = new Map();
    this.listeners = new Set();
    this.querySyncer = this.db.createQuerySyncer(
      this.options.clientId,
      (results, forInternalQueries) => {
        const triples = results ?? [];
        const triplesForClient = triples.filter(
          ({ timestamp: [_t, client] }) => client !== this.options.clientId
        );
        // We should send triples to client even if there are none
        // so that the client knows that the query has been fulfilled by the remote
        // for the initial query response
        const everyRelevantQueryHasResponded = forInternalQueries.every(
          (id) =>
            this.connectedQueries.has(id) &&
            this.connectedQueries.get(id)!.serverHasRespondedOnce
        );
        if (everyRelevantQueryHasResponded && triplesForClient.length === 0)
          return;
        this.sendResponse('TRIPLES', {
          triples: triplesForClient,
          forQueries: forInternalQueries.map(
            (id) => this.connectedQueries.get(id)?.externalQueryId
          ),
        });

        for (const queryKey of forInternalQueries) {
          if (this.connectedQueries.has(queryKey))
            this.connectedQueries.get(queryKey)!.serverHasRespondedOnce = true;
        }
      },
      (error: unknown, queryKey?: string) => {
        console.error(error);
        const innerError = isTriplitError(error)
          ? error
          : new TriplitError(
              'An unknown error occurred while processing your request.'
            );

        if (queryKey && this.connectedQueries.has(queryKey)) {
          const { externalQueryId } = this.connectedQueries.get(queryKey)!;
          this.sendErrorResponse(
            'CONNECT_QUERY',
            new QuerySyncError(innerError),
            {
              queryKey: externalQueryId,
              innerError,
            }
          );
        } else {
          // TODO: pass context in callback into error
          this.sendErrorResponse('CONNECT_QUERY', innerError);
          return;
        }
      }
    );
  }

  sendResponse<Msg extends ServerSyncMessage>(
    messageType: Msg['type'],
    payload: Msg['payload']
  ) {
    this.logger.log('Sending message', { messageType, payload });
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
    this.sendResponse('ERROR', payload);
  }

  async handleConnectQueryMessage(
    msgParams: ClientConnectQueryMessage['payload']
  ) {
    const { id: queryKey, params, state } = msgParams;
    try {
      const { collectionName, ...parsedQuery } = params;
      const clientStates = state
        ? new Map(state.map(([sequence, client]) => [client, sequence]))
        : undefined;
      const builtQuery = this.db.query(collectionName, parsedQuery).build();

      // TODO: THIS SHOULD BE KEYED ON QUERY HASH
      const unsubscribe = async () => {
        this.querySyncer.unregisterQuery(queryKey);
      };

      const internalQueryId = await this.querySyncer.registerQuery(
        builtQuery as any,
        {
          skipRules: hasAdminAccess(this.token),
          stateVector: clientStates,
        }
      );

      if (!internalQueryId) return;

      this.connectedQueries.set(internalQueryId, {
        unsubscribe,
        serverHasRespondedOnce: false,
        externalQueryId: queryKey,
      });
    } catch (e) {
      console.error(e);
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
    const internalQueryId = Array.from(this.connectedQueries.entries()).find(
      ([_internalId, entry]) => entry.externalQueryId === queryKey
    )?.[0];
    if (!internalQueryId) return;
    this.querySyncer.unregisterQuery(internalQueryId);
    if (this.connectedQueries.has(queryKey)) {
      this.connectedQueries.get(queryKey)?.unsubscribe();
      this.connectedQueries.delete(queryKey);
    }
  }

  // in case TRIPLES_PENDING requests pile up, throttle them
  // Or figure out a better way to tap into queue of pending requests
  private throttledTriplesRequest = throttle(
    () => this.sendResponse('TRIPLES_REQUEST', {}),
    10
  );

  handleTriplesPendingMessage() {
    this.throttledTriplesRequest();
  }

  async handleTriplesMessage(msgParams: ClientTriplesMessage['payload']) {
    const { triples } = msgParams;
    if (!triples?.length) return;
    let successes: string[] = [];
    let failures: [string, TriplitError][] = [];
    const txTriples = Object.fromEntries(
      Object.entries(groupTriplesByTimestamp(triples)).filter(
        ([txId, triples]) => {
          if (hasAdminAccess(this.token)) return true;
          const anySchemaTriples = triples.some(
            (trip) => trip.attribute[0] === '_metadata'
          );
          if (anySchemaTriples) {
            failures.push([
              txId,
              new TriplitError(
                'Invalid permissions to modify schema. Must use Service Token.'
              ),
            ]);
            return false;
          }
          return true;
        }
      )
    );
    try {
      // If we fail here handle individual failures
      const resp = await insertTriplesByTransaction(
        this.db,
        txTriples,
        hasAdminAccess(this.token)
      );
      successes = resp.successes;
      failures.push(...resp.failures);

      if (failures.length > 0) {
        this.sendErrorResponse('TRIPLES', new TriplesInsertError(), {
          failures: failures.map(([txId, error]) => ({
            txId,
            error: error.toJSON(),
          })),
        });
      }

      this.sendResponse('TRIPLES_ACK', {
        txIds: successes,
        failedTxIds: failures.map(([txId]) => txId),
      });
    } catch (e) {
      const error = isTriplitError(e)
        ? e
        : new TriplitError(
            'An unknown error occurred while processing your request.'
          );
      this.sendErrorResponse('TRIPLES', new TriplesInsertError(), {
        failures: Object.keys(txTriples).map((txId) => ({
          txId,
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

  dispatchCommand(message: ClientSyncMessage) {
    this.logger.log('Received message', message);
    try {
      switch (message.type) {
        case 'CONNECT_QUERY':
          return this.handleConnectQueryMessage(message.payload);
        case 'DISCONNECT_QUERY':
          return this.handleDisconnectQueryMessage(message.payload);
        case 'TRIPLES_PENDING':
          return this.handleTriplesPendingMessage();
        case 'TRIPLES':
          return this.handleTriplesMessage(message.payload);
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
      console.error(e);
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

  async isClientSchemaCompatible(): Promise<ServerCloseReason | undefined> {
    const serverSchema = await this.db.getSchema();
    const serverHash = hashSchemaJSON(schemaToJSON(serverSchema)?.collections);
    if (
      serverHash &&
      serverHash !== this.options.clientSchemaHash &&
      !this.options.syncSchema
    )
      return {
        type: 'SCHEMA_MISMATCH',
        retry: false,
        message: 'Client schema does not match server schema.',
      };
    return undefined;
  }
}
