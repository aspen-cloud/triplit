import {
  DB as TriplitDB,
  TriplitError,
  schemaToJSON,
  CollectionQuery,
  Attribute,
  TupleValue,
  appendCollectionToId,
  EntityId,
  JSONToSchema,
} from '@triplit/db';
import { RouteNotFoundError, ServiceKeyRequiredError } from './errors.js';
import { isTriplitError } from './utils.js';
import { Server as TriplitServer } from './triplit-server.js';
import { ProjectJWT } from './token.js';
import { genToArr } from '@triplit/db';
import { SyncConnection } from './sync-connection.js';
import { WebhookJSONDefinition } from './webhooks-manager.js';

export function isChunkedMessageComplete(message: string[], total: number) {
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

export function hasAdminAccess(token: ProjectJWT) {
  return token && token['x-triplit-token-type'] === 'secret';
}

export class Session {
  db: TriplitDB<any>;
  constructor(
    public server: TriplitServer,
    public token: ProjectJWT
  ) {
    if (!token) throw new TriplitError('Token is required');
    // TODO: figure out admin middleware

    this.db = server.db.withSessionVars(token);
  }

  // TODO: ensure data that we store in memory is invalidated when the db is "cleared"
  async clearDB({ full }: { full?: boolean }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      await this.db.clear({ full });
      return ServerResponse(200);
    } catch (e) {
      if (isTriplitError(e)) return this.errorResponse(e);
      return this.errorResponse(e, {
        fallbackMessage: 'An unknown error occurred clearing the database.',
      });
    }
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
  async overrideSchema(
    params: { schema: any } & Parameters<
      typeof TriplitDB.prototype.overrideSchema
    >[1]
  ) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    const { schema, ...options } = params;
    const result = await this.db.overrideSchema(
      JSONToSchema(params.schema),
      options
    );
    return ServerResponse(result.successful ? 200 : 409, result);
  }

  async queryTriples({ query }: { query: CollectionQuery }) {
    if (!query)
      return this.errorResponse(
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
      return this.errorResponse(e as Error);
    }
  }

  async fetch(query: CollectionQuery) {
    try {
      const hasSelectWithoutId = query.select && !query.select.includes('id');

      if (hasSelectWithoutId) {
        // @ts-expect-error
        query.select.push('id');
      }

      const result = await this.db.fetch(query, {
        skipRules: hasAdminAccess(this.token),
      });

      const schema = (await this.db.getSchema())?.collections;
      const { collectionName } = query;

      const collectionSchema = schema?.[collectionName]?.schema;
      const data = result.map((entity) => {
        const jsonEntity = collectionSchema
          ? collectionSchema.convertJSToJSON(entity, schema)
          : entity;
        const entityId = jsonEntity.id;
        if (hasSelectWithoutId && jsonEntity.id) {
          delete jsonEntity.id;
        }
        return [entityId, jsonEntity];
      });

      return ServerResponse(200, {
        result: data,
      });
    } catch (e) {
      return this.errorResponse(e as Error);
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
      return this.errorResponse(e, {
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
      return this.errorResponse(e, {
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
      return this.errorResponse(e, {
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
      return this.errorResponse(e, {
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
              await tx.storeTx.insertTriple({
                id,
                attribute: [collectionName, ...patch[1]],
                value: null,
                timestamp,
                expired: true,
              });
            } else if (patch[0] === 'set') {
              await tx.storeTx.insertTriple({
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
      return this.errorResponse(e, {
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
      return this.errorResponse(e, {
        fallbackMessage: 'Could not delete entity. An unknown error occurred.',
      });
    }
  }

  async deleteAll(collectionName: string) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      const txResult = await this.db.transact(async (tx) => {
        const allEntities = await tx.fetch({ collectionName, select: ['id'] });
        for (const entity of allEntities) {
          // @ts-expect-error
          await tx.delete(collectionName, entity.id);
        }
      });
      return ServerResponse(200, txResult);
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: `Could not delete all entities in '${collectionName}'. An unknown error occurred.`,
      });
    }
  }

  errorResponse(e: unknown, options?: { fallbackMessage?: string }) {
    if (isTriplitError(e)) {
      return ServerResponse(e.status, e.toJSON());
    }
    this.server.exceptionReporter(e);
    const generalError = new TriplitError(
      options?.fallbackMessage ??
        'An unknown error occurred processing your request.'
    );
    console.log(e);
    return ServerResponse(generalError.status, generalError.toJSON());
  }
  async handleWebhooksJSONPush({
    webhooks,
  }: {
    webhooks: WebhookJSONDefinition;
  }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      this.server.webhooksManager.addAndStoreWebhooks(webhooks);
      return ServerResponse(200, {});
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not add webhooks.',
      });
    }
  }
  async handleWebhooksClear() {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      this.server.webhooksManager.clearWebhooks();
      return ServerResponse(200, {});
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not clear webhooks.',
      });
    }
  }
  async handleWebhooksGet() {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      const webhooks = await this.server.webhooksManager.getWebhooks();
      return ServerResponse(200, webhooks);
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not fetch webhooks.',
      });
    }
  }
}

export function throttle(callback: () => void, delay: number) {
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
