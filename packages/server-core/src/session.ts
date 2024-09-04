import {
  DB as TriplitDB,
  TriplitError,
  schemaToJSON,
  hashSchemaJSON,
  CollectionQuery,
  Attribute,
  TupleValue,
  appendCollectionToId,
  EntityId,
  JSONToSchema,
} from '@triplit/db';
import {
  QuerySyncError,
  RouteNotFoundError,
  ServiceKeyRequiredError,
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
import { Server as TriplitServer } from './triplit-server.js';
import { ProjectJWT } from './token.js';
import { genToArr } from '@triplit/db';

export interface ConnectionOptions {
  clientId: string;
  clientSchemaHash: number | undefined;
  syncSchema?: boolean | undefined;
}

export class Connection {
  connectedQueries: Map<string, () => void>;
  listeners: Set<(messageType: string, payload: {}) => void>;

  chunkedMessages: Map<string, string[]> = new Map();

  constructor(public session: Session, public options: ConnectionOptions) {
    this.connectedQueries = new Map<string, () => void>();
    this.listeners = new Set();
  }

  sendResponse<Msg extends ServerSyncMessage>(
    messageType: Msg['type'],
    payload: Msg['payload']
  ) {
    this.session.server.logger.log('Sending message', { messageType, payload });
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

  handleConnectQueryMessage(msgParams: ClientConnectQueryMessage['payload']) {
    const { id: queryKey, params, state } = msgParams;
    const { collectionName, ...parsedQuery } = params;
    const clientStates = new Map(
      (state ?? []).map(([sequence, client]) => [client, sequence])
    );
    let serverHasRespondedOnce = false;
    const unsubscribe = this.session.db.subscribeTriples(
      this.session.db.query(collectionName, parsedQuery).build(),
      (results) => {
        const triples = results ?? [];
        const triplesForClient = triples.filter(
          ({ timestamp: [_t, client] }) => client !== this.options.clientId
        );
        // We should send triples to client even if there are none
        // so that the client knows that the query has been fulfilled by the remote
        // for the initial query response
        if (serverHasRespondedOnce && triplesForClient.length === 0) return;
        this.sendResponse('TRIPLES', {
          triples: triplesForClient,
          forQueries: [queryKey],
        });
        serverHasRespondedOnce = true;
      },
      (error) => {
        console.error(error);
        const innerError = isTriplitError(error)
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
        skipRules: hasAdminAccess(this.session.token),
        stateVector: clientStates,
      }
    );

    if (this.connectedQueries.has(queryKey)) {
      // unsubscribe from previous query instance
      this.connectedQueries.get(queryKey)!();
    }
    this.connectedQueries.set(queryKey, unsubscribe);
  }

  handleDisconnectQueryMessage(
    msgParams: ClientDisconnectQueryMessage['payload']
  ) {
    const { id: queryKey } = msgParams;
    if (this.connectedQueries.has(queryKey)) {
      this.connectedQueries.get(queryKey)?.();
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
          if (hasAdminAccess(this.session.token)) return true;
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
        this.session.db,
        txTriples,
        hasAdminAccess(this.session.token)
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
    this.session.server.logger.log('Received message', message);
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

function isChunkedMessageComplete(message: string[], total: number) {
  if (message.length !== total) return false;
  for (let i = 0; i < total; i++) {
    if (!message[i]) return false;
  }
  return true;
}

export type ServerResponse = {
  statusCode: number;
  payload?: any;
};

export function ServerResponse(statusCode: number = 200, payload?: any) {
  return {
    payload,
    statusCode,
  };
}

function NotAdminResponse() {
  const error = new ServiceKeyRequiredError();
  return ServerResponse(error.status, error.toJSON());
}

export function routeNotFoundResponse(route: string[]) {
  const error = new RouteNotFoundError(route);
  return ServerResponse(error.status, error.toJSON());
}

function hasAdminAccess(token: ProjectJWT) {
  return token && token['x-triplit-token-type'] === 'secret';
}

export class Session {
  db: TriplitDB<any>;
  constructor(public server: TriplitServer, public token: ProjectJWT) {
    if (!token) throw new TriplitError('Token is required');
    // TODO: figure out admin middleware

    this.db = server.db.withSessionVars(token);
  }

  createConnection(connectionParams: ConnectionOptions) {
    return new Connection(this, connectionParams);
  }

  // TODO: ensure data that we store in memory is invalidated when the db is "cleared"
  async clearDB({ full }: { full?: boolean }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      await this.db.clear({ full });
      return ServerResponse(200);
    } catch (e) {
      if (isTriplitError(e)) return errorResponse(e);
      return errorResponse(e, {
        fallbackMessage: 'An unknown error occurred clearing the database.',
      });
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
      if (isTriplitError(e)) return errorResponse(e);
      return errorResponse(new TriplitError('Error applying migration'));
    }
    return ServerResponse(200);
  }

  async getCollectionStats() {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    const stats = await this.db.getCollectionStats();
    const payload = Array.from(stats)
      .filter(([collection]) => collection !== '_metadata')
      .map(([collection, numEntities]) => ({
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
  async overrideSchema(params: { schema: any }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    const result = await this.db.overrideSchema(JSONToSchema(params.schema));
    return ServerResponse(result.successful ? 200 : 409, result);
  }

  async queryTriples({ query }: { query: CollectionQuery }) {
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

  async fetch(query: CollectionQuery) {
    try {
      const result = await this.db.fetch(query, {
        skipRules: hasAdminAccess(this.token),
      });
      const schema = (await this.db.getSchema())?.collections;
      const { collectionName } = query;
      const collectionSchema = schema?.[collectionName]?.schema;
      const data = new Map(
        [...result.entries()].map(([id, entity]) => [
          id,
          collectionSchema
            ? collectionSchema.convertJSToJSON(entity, schema)
            : entity,
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
      const schema = (await this.db.getSchema())?.collections;
      const collectionSchema = schema?.[collectionName]?.schema;
      const insertEntity = collectionSchema
        ? collectionSchema.convertJSONToJS(entity, schema)
        : entity;
      const txResult = await this.db.insert(collectionName, insertEntity, {
        skipRules: hasAdminAccess(this.token),
      });
      const serializableResult = {
        ...txResult,
        output: collectionSchema
          ? collectionSchema.convertJSToJSON(txResult.output, schema)
          : txResult.output,
      };
      return ServerResponse(200, serializableResult);
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not insert entity. An unknown error occurred.',
      });
    }
  }

  async bulkInsert(inserts: Record<string, any[]>) {
    try {
      const schema = (await this.db.getSchema())?.collections;
      const txResult = await this.db.transact(
        async (tx) => {
          const output = Object.keys(inserts).reduce(
            (acc, collectionName) => ({ ...acc, [collectionName]: [] }),
            {}
          ) as Record<string, any[]>;
          for (const [collectionName, entities] of Object.entries(inserts)) {
            const collectionSchema = schema?.[collectionName]?.schema;
            for (const entity of entities) {
              const insertEntity = collectionSchema
                ? collectionSchema.convertJSONToJS(entity, schema)
                : entity;
              const insertedEntity = await tx.insert(
                collectionName,
                insertEntity
              );
              output[collectionName].push(
                collectionSchema
                  ? collectionSchema.convertJSToJSON(insertedEntity, schema)
                  : insertedEntity
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
        fallbackMessage: 'Could not insert entity. An unknown error occurred.',
      });
    }
  }

  async insertTriples(triples: any[]) {
    try {
      if (!hasAdminAccess(this.token)) return NotAdminResponse();
      await this.db.tripleStore.insertTriples(triples);
      return ServerResponse(200, {});
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not insert triples. An unknown error occurred.',
      });
    }
  }

  async deleteTriples(entityAttributes: [EntityId, Attribute][]) {
    try {
      if (!hasAdminAccess(this.token)) return NotAdminResponse();
      await this.db.tripleStore.transact(async (tx) => {
        for (const [entityId, attribute] of entityAttributes) {
          await tx.deleteTriples(
            await genToArr(tx.findByEntityAttribute(entityId, attribute))
          );
        }
      });
      return ServerResponse(200, {});
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not delete triples. An unknown error occurred.',
      });
    }
  }

  async update(
    collectionName: string,
    entityId: string,
    patches: (['set', Attribute, TupleValue] | ['delete', Attribute])[]
  ) {
    try {
      const txResult = await this.db.transact(
        async (tx) => {
          const id = appendCollectionToId(collectionName, entityId);
          const timestamp = await tx.storeTx.getTransactionTimestamp();
          for (const patch of patches) {
            if (patch[0] === 'delete') {
              tx.storeTx.insertTriple({
                id,
                attribute: [collectionName, ...patch[1]],
                value: null,
                timestamp,
                expired: true,
              });
            } else if (patch[0] === 'set') {
              tx.storeTx.insertTriple({
                id,
                attribute: [collectionName, ...patch[1]],
                value: patch[2],
                timestamp,
                expired: false,
              });
            }
          }
        },
        { skipRules: hasAdminAccess(this.token) }
      );
      return ServerResponse(200, txResult);
    } catch (e) {
      return errorResponse(e, {
        fallbackMessage: 'Could not update entity. An unknown error occurred.',
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
        fallbackMessage: 'Could not delete entity. An unknown error occurred.',
      });
    }
  }
}

function errorResponse(e: unknown, options?: { fallbackMessage?: string }) {
  if (isTriplitError(e)) {
    return ServerResponse(e.status, e.toJSON());
  }
  const generalError = new TriplitError(
    options?.fallbackMessage ??
      'An unknown error occurred processing your request.'
  );
  console.log(e);
  return ServerResponse(generalError.status, generalError.toJSON());
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
