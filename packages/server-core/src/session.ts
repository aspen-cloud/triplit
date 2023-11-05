import {
  DB as TriplitDB,
  TriplitError,
  schemaToJSON,
  hashSchemaJSON,
} from '@triplit/db';
import {
  QuerySyncError,
  TriplesInsertError,
  UnrecognizedMessageTypeError,
} from './errors.js';
import {
  groupTriplesByTimestamp,
  insertTriplesByTransaction,
} from './utils.js';
import {
  ServerSyncMessage,
  ClientSyncMessage,
  ParsedToken,
} from '@triplit/types/sync';

export class Session {
  connectedQueries: Map<string, () => void>;
  listeners: Set<(messageType: string, payload: {}) => void>;

  constructor(
    public clientId: string,
    public token: ParsedToken,
    public db: TriplitDB<any>,
    public clientSchemaHash: number | undefined,
    public syncSchema?: boolean
  ) {
    this.connectedQueries = new Map<string, () => void>();
    this.listeners = new Set();
  }

  sendResponse<Msg extends ServerSyncMessage>(
    messageType: Msg['type'],
    payload: Msg['payload']
  ) {
    for (const listener of this.listeners) {
      listener(messageType, payload);
    }
  }

  addListener(listener: (messageType: string, payload: {}) => void) {
    this.listeners.add(listener);
  }

  close() {
    for (const unsubscribe of this.connectedQueries.values()) {
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

  handleConnectQueryMessage(msgParams: { id: string; params: any }) {
    const { id: queryKey, params } = msgParams;
    const { collectionName, ...parsedQuery } = params;

    parsedQuery.vars = {
      ...parsedQuery.vars,
      SESSION_USER_ID: this.token.userId,
    };
    const unsubscribe = this.db.subscribeTriples(
      this.db.query(collectionName, parsedQuery).build(),
      (results) => {
        const triples = results ?? [];
        if (triples.length === 0) return;
        const triplesForClient = triples.filter(
          ({ timestamp: [_t, client] }) => client !== this.clientId
        );
        if (triplesForClient.length === 0) return;
        this.sendResponse('TRIPLES', {
          triples: triplesForClient,
          forQueries: [queryKey],
        });
        return;
      },
      (error) => {
        console.error(error);
        const innerError =
          error instanceof TriplitError
            ? error
            : new TriplitError(
                'An unknown error occurred while processing your request.'
              );
        this.sendErrorResponse('CONNECT_QUERY', new QuerySyncError(params), {
          queryKey,
          innerError,
        });
        return;
      }
    );

    if (this.connectedQueries.has(queryKey)) {
      // unsubscribe from previous query instance
      this.connectedQueries.get(queryKey)!();
    }
    this.connectedQueries.set(queryKey, unsubscribe);
  }

  handleDisconnectQueryMessage(msgParams: { id: string }) {
    const { id: queryKey } = msgParams;
    if (this.connectedQueries.has(queryKey)) {
      this.connectedQueries.get(queryKey)?.();
      this.connectedQueries.delete(queryKey);
    }
  }

  handleTriplesPendingMessage() {
    this.sendResponse('TRIPLES_REQUEST', {});
  }

  async handleTriplesMessage(msgParams: { triples: any[] }) {
    const { triples } = msgParams;
    if (!triples?.length) return;
    let successes: string[] = [];
    let failures: [string, TriplitError][] = [];
    const txTriples = Object.fromEntries(
      Object.entries(groupTriplesByTimestamp(triples)).filter(
        ([txId, triples]) => {
          if (this.token?.type === 'secret') return true;
          const anySchemaTriples = triples.some(
            (trip) => trip.attribute[0] === '_metadata'
          );
          if (anySchemaTriples) {
            failures.push([
              txId,
              new TriplitError(
                'Invalid permissions to modify schema. Must use service key.'
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
      const resp = await insertTriplesByTransaction(this.db, txTriples);
      successes = resp.successes;
      failures.push(...resp.failures);

      if (failures.length > 0) {
        this.sendErrorResponse('TRIPLES', new TriplesInsertError(), {
          failures: failures.map(([txId, error]) => ({
            txId,
            error: error.toJSON(),
          })),
        });
        return;
      }

      this.sendResponse('TRIPLES_ACK', { txIds: successes });
    } catch (e) {
      const error =
        e instanceof TriplitError
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

  dispatchCommand(message: ClientSyncMessage) {
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
        default:
          return this.sendErrorResponse(
            // @ts-ignore
            message.type,
            // @ts-ignore
            new UnrecognizedMessageTypeError(message.type)
          );
      }
    } catch (e) {
      return this.sendErrorResponse(
        message.type,
        e instanceof TriplitError
          ? e
          : new TriplitError(
              'An unknown error occurred while processing your request.'
            )
      );
    }
  }
  async isClientSchemaCompatible() {
    const serverSchema = await this.db.getSchema();
    const serverHash = hashSchemaJSON(schemaToJSON(serverSchema)?.collections);
    if (serverHash && serverHash !== this.clientSchemaHash && !this.syncSchema)
      return {
        code: 1008,
        metadata: {
          type: 'SCHEMA_MISMATCH',
          payload: {},
          retry: false,
        },
      };
    return undefined;
  }
}
