import {
  DB as TriplitDB,
  TriplitError,
  schemaToJSON,
  hashSchemaJSON,
  CollectionQuery,
  Attribute,
  Value,
  getSchemaFromPath,
  Timestamp,
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
  ServerCloseReason,
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

  handleConnectQueryMessage(msgParams: {
    id: string;
    params: any;
    state?: Timestamp[];
  }) {
    const { id: queryKey, params, state } = msgParams;
    const { collectionName, ...parsedQuery } = params;
    const clientStates = new Map(
      (state ?? []).map(([sequence, client]) => [client, sequence])
    );
    const unsubscribe = this.session.db.subscribeTriples(
      this.session.db.query(collectionName, parsedQuery).build(),
      (results) => {
        const triples = results ?? [];
        const triplesForClient = triples.filter(
          ({ timestamp: [t, client] }) =>
            client !== this.options.clientId &&
            (!clientStates.has(client) || clientStates.get(client)! < t)
        );
        // We should always send triples to client even if there are none
        // so that the client knows that the query has been fulfilled by the remote
        this.sendResponse('TRIPLES', {
          triples: triplesForClient,
          forQueries: [queryKey],
        });
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
      },
      {
        skipRules: this.session.token.type === 'secret',
        stateVector: clientStates,
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

  async isClientSchemaCompatible(): Promise<ServerCloseReason | undefined> {
    const serverSchema = await this.session.db.getSchema();
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

  createConnection(connectionParams: ConnectionOptions) {
    return new Connection(this, connectionParams);
  }

  async clearDB({ full }: { full?: boolean }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
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

  async getMigrationStatus() {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
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

  async applyMigration({
    migration,
    direction,
  }: {
    migration: any;
    direction: 'up' | 'down';
  }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
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

  async getCollectionStats() {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    const stats = await this.db.getCollectionStats();
    const payload = Array.from(stats).map(([collection, numEntities]) => ({
      collection,
      numEntities,
    }));
    return ServerResponse(200, payload);
  }

  async getSchema(params: { format?: 'json' | 'triples' }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
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
      return ServerResponse(
        200,
        await this.db.fetchTriples(query, {
          skipRules: hasAdminAccess(this.token),
        })
      );
    } catch (e) {
      return errorResponse(e as Error);
    }
  }

  async fetch(query: CollectionQuery<any, any>) {
    try {
      const result = await this.db.fetch(query, {
        skipRules: hasAdminAccess(this.token),
      });
      const schema = await this.db.getSchema();
      const { collectionName } = query;
      const collectionSchema = schema?.collections[collectionName]?.schema;
      const data = new Map(
        [...result.entries()].map(([id, entity]) => [
          id,
          collectionSchema ? collectionSchema.convertJSToJSON(entity) : entity,
        ])
      );
      return ServerResponse(200, {
        result: [...data.entries()],
      });
    } catch (e) {
      return errorResponse(e as Error);
    }
  }

  async insert(collectionName: string, entity: any) {
    try {
      const schema = await this.db.getSchema();
      const collectionSchema = schema?.collections[collectionName]?.schema;
      const insertEntity = collectionSchema
        ? collectionSchema.convertJSONToJS(entity)
        : entity;
      const txResult = await this.db.insert(collectionName, insertEntity, {
        skipRules: hasAdminAccess(this.token),
      });
      const serializableResult = {
        ...txResult,
        output: collectionSchema
          ? collectionSchema.convertJSToJSON(txResult.output)
          : txResult.output,
      };
      return ServerResponse(200, serializableResult);
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not insert entity. An unknown error occured.',
      });
    }
  }

  async bulkInsert(inserts: Record<string, any[]>) {
    try {
      const schema = await this.db.getSchema();
      const txResult = await this.db.transact(
        async (tx) => {
          const output = Object.keys(inserts).reduce(
            (acc, collectionName) => ({ ...acc, [collectionName]: [] }),
            {}
          ) as Record<string, any[]>;
          for (const [collectionName, entities] of Object.entries(inserts)) {
            const collectionSchema =
              schema?.collections[collectionName]?.schema;
            for (const entity of entities) {
              const insertEntity = collectionSchema
                ? collectionSchema.convertJSONToJS(entity)
                : entity;
              const insertedEntity = await tx.insert(
                collectionName,
                insertEntity
              );
              output[collectionName].push(
                collectionSchema.convertJSToJSON(insertedEntity)
              );
            }
          }
          return output;
        },
        { skipRules: hasAdminAccess(this.token) }
      );
      const serializableResult = {
        ...txResult,
      };
      return ServerResponse(200, serializableResult);
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not insert entity. An unknown error occured.',
      });
    }
  }

  async update(
    collectionName: string,
    entityId: string,
    patches: (['set', Attribute, Value] | ['delete', Attribute])[]
  ) {
    try {
      const schema = await this.db.getSchema();
      const collectionSchema = schema?.collections[collectionName]?.schema;
      if (collectionSchema) {
        patches.forEach((p) => {
          if (p[0] === 'set') {
            const attrSchema = getSchemaFromPath(collectionSchema, p[1]);
            // @ts-expect-error
            p[2] = attrSchema.convertJSONToJS(p[2]);
          }
        });
      }

      const txResult = await this.db.update(
        collectionName,
        entityId,
        (entity) => {
          for (const patch of patches) {
            const path = patch[1];
            let current = entity;
            for (let i = 0; i < path.length - 1; i++) {
              current = current[path[i]];
            }
            if (patch[0] === 'delete') {
              delete current[path[path.length - 1]];
            } else if (patch[0] === 'set') {
              current[path[path.length - 1]] = patch[2];
            } else {
              throw new TriplitError(`Invalid patch type: ${patch[0]}`);
            }
          }
        },
        { skipRules: hasAdminAccess(this.token) }
      );
      return ServerResponse(200, txResult);
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not update entity. An unknown error occured.',
      });
    }
  }

  async delete(collectionName: string, entityId: string) {
    try {
      const txResult = await this.db.delete(collectionName, entityId, {
        skipRules: hasAdminAccess(this.token),
      });
      return ServerResponse(200, txResult);
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not delete entity. An unknown error occured.',
      });
    }
  }
}

function errorResponse(e: unknown, options?: { fallbackMessage?: string }) {
  if (e instanceof TriplitError) {
    return ServerResponse(e.status, e.toJSON());
  }
  const generalError = new TriplitError(
    options?.fallbackMessage ??
      'An unknown error occured processing your request.'
  );
  console.log(e);
  return ServerResponse(generalError.status, generalError.toJSON());
}
