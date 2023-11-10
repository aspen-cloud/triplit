import {
  DB as TriplitDB,
  TriplitError,
  schemaToJSON,
  hashSchemaJSON,
  CollectionQuery,
} from '@triplit/db';
import {
  QuerySyncError,
  ServiceKeyRequiredError,
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
import { Server } from './triplit-server.js';

export interface ConnectionOptions {
  clientId: string;
  clientSchemaHash: number | undefined;
  syncSchema?: boolean | undefined;
}

export class Connection {
  connectedQueries: Map<string, () => void>;
  listeners: Set<(messageType: string, payload: {}) => void>;

  constructor(public session: Session, public options: ConnectionOptions) {
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
    return () => {
      this.listeners.delete(listener);
    };
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

    const unsubscribe = this.session.db.subscribeTriples(
      this.session.db.query(collectionName, parsedQuery).build(),
      (results) => {
        const triples = results ?? [];
        if (triples.length === 0) return;
        const triplesForClient = triples.filter(
          ({ timestamp: [_t, client] }) => client !== this.options.clientId
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
          if (hasAdminAccess(this.session.token)) return true;
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
      const resp = await insertTriplesByTransaction(this.session.db, txTriples);
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

  // used?
  async insert(collectionName: string, entity: any) {
    return this.session.db.insert(collectionName, entity);
  }

  async isClientSchemaCompatible() {
    const serverSchema = await this.session.db.getSchema();
    const serverHash = hashSchemaJSON(schemaToJSON(serverSchema)?.collections);
    if (
      serverHash &&
      serverHash !== this.options.clientSchemaHash &&
      !this.options.syncSchema
    )
      return {
        type: 'SCHEMA_MISMATCH',
        payload: {},
        retry: false,
      };
    return undefined;
  }
}

type ServerResponse = {
  statusCode: number;
  payload?: any;
};

function ServerResponse(statusCode: number = 200, payload?: any) {
  return {
    payload,
    statusCode,
  };
}

function NotAdminResponse() {
  const error = new ServiceKeyRequiredError();
  return ServerResponse(error.status, error.toJSON());
}

function hasAdminAccess(token: ParsedToken) {
  return token && token.type === 'secret';
}

export class Session {
  db: TriplitDB<any>;
  constructor(public server: Server, public token: ParsedToken) {
    if (!token) throw new Error('Token is required');
    // TODO: figure out admin middleware
    const variables = {};

    if (token.userId)
      // @ts-expect-error
      variables['SESSION_USER_ID'] = token.userId;

    this.db = server.db.withVars(variables);
  }

  createConnection(connectionParams: {
    clientId: string;
    clientSchemaHash: number | undefined;
    syncSchema?: boolean | undefined;
  }) {
    return new Connection(this, connectionParams);
  }

  async clearDB({ full }: { full?: boolean }, token: ParsedToken) {
    if (!hasAdminAccess(token)) return NotAdminResponse();
    try {
      if (full) {
        // Delete all data associated with this tenant
        await this.db.clear();
      } else {
        // Just delete triples
        const allTriples = await this.db.tripleStore.findByEntity();
        await this.db.tripleStore.deleteTriples(allTriples);
      }
      return ServerResponse(200);
    } catch (e) {
      return ServerResponse(500);
    }
  }

  async getMigrationStatus(token: ParsedToken) {
    if (!hasAdminAccess(token)) return NotAdminResponse();
    const schema = await this.db.getSchema();
    if (!schema) {
      return ServerResponse(200, { type: 'schemaless' });
    }

    const migrations = Object.values(await this.db.getAppliedMigrations()).sort(
      (a, b) => a.id - b.id
    );
    const hash = hashSchemaJSON(schemaToJSON(schema)?.collections);

    return ServerResponse(200, {
      type: 'schema',
      migrations,
      schemaHash: hash,
      schema,
    });
  }

  async applyMigration(
    { migration, direction }: { migration: any; direction: 'up' | 'down' },
    token: ParsedToken
  ) {
    if (!hasAdminAccess(token)) return NotAdminResponse();
    try {
      if (!migration || !direction)
        return errorResponse(
          new TriplitError('Missing migration or direction')
        );
      await this.db.migrate([migration], direction);
    } catch (e) {
      if (e instanceof TriplitError) return errorResponse(e);
      return errorResponse(new TriplitError('Error applying migration'));
    }
    return ServerResponse(200);
  }

  async getCollectionStats(token: ParsedToken) {
    if (!hasAdminAccess(token)) return NotAdminResponse();
    const stats = await this.db.getCollectionStats();
    const payload = Array.from(stats).map(([collection, numEntities]) => ({
      collection,
      numEntities,
    }));
    return ServerResponse(200, payload);
  }

  async getSchema(params: { format?: 'json' | 'triples' }, token: ParsedToken) {
    if (!hasAdminAccess(token)) return NotAdminResponse();
    const format = params?.format ?? 'triples';
    const schema = await this.db.getSchema();
    if (!schema) return ServerResponse(200, { type: 'schemaless' });

    if (format === 'triples') {
      // TODO: rename schemaTriples to schema
      return ServerResponse(200, {
        type: 'schema',
        schemaTriples: schemaToJSON(schema),
      });
    } else if (format === 'json') {
      return ServerResponse(200, {
        type: 'schema',
        schema: schemaToJSON(schema),
      });
    }

    // TODO: better message (maybe error about invalid parameters?)
    return ServerResponse(400, new TriplitError('Invalid format').toJSON());
  }

  async queryTriples({ query }: { query: CollectionQuery<any, any> }) {
    if (!query)
      return errorResponse(
        new TriplitError('{ query: CollectionQuery } missing from request body')
      );
    try {
      return ServerResponse(200, await this.db.fetchTriples(query));
    } catch (e) {
      return errorResponse(e as Error);
    }
  }

  async insert(collectionName: string, entity: any, token: ParsedToken) {
    if (!hasAdminAccess(token)) return NotAdminResponse();
    try {
      await this.db.insert(collectionName, entity);
      return ServerResponse(200);
    } catch (e) {
      if (e instanceof TriplitError) {
        return ServerResponse(e.status, {
          message: e.message,
          context: e.contextMessage,
        });
      }
      return ServerResponse(500, {
        message: 'Could not insert entity',
        context: 'Unknown server error',
      });
    }
  }
}

function errorResponse(e: Error) {
  if (e instanceof TriplitError) {
    return ServerResponse(e.status, e.toJSON());
  }
  const generalError = new TriplitError(
    'An unknown error occured processing your request'
  );
  console.log(e);
  return ServerResponse(generalError.status, generalError.toJSON());
}
