import {
  CollectionQuery,
  DBChanges,
  serializeFetchResult,
  DB as TriplitDB,
  TriplitError,
  Type,
} from '@triplit/entity-db';
import { RouteNotFoundError, ServiceKeyRequiredError } from './errors.js';
import { isTriplitError } from './utils.js';
import { Server as TriplitServer } from './triplit-server.js';
import { ProjectJWT } from './token.js';
import { WebhookJSONDefinition } from './webhooks-manager.js';
import SuperJSON from 'superjson';
import { logger } from '@triplit/logger';

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
  db: TriplitDB;
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

  async getSchema(params: { format?: 'json' }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    const format = params?.format ?? 'json';
    const schema = this.db.getSchema();
    if (!schema) return ServerResponse(200, { type: 'schemaless' });

    if (format === 'json') {
      return ServerResponse(200, {
        type: 'schema',
        schema: schema,
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
    const change = await this.db.overrideSchema(params.schema, options);
    // TODO: determine if we the proper status code (change.successful ? 200 : 409)
    return ServerResponse(200, change);
  }

  async queryTriples(...params: any[]) {
    return ServerResponse(410, {});
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

      const schema = this.db.getSchema()?.collections;

      const data = result.map((entity) => {
        const id = entity.id;
        if (hasSelectWithoutId && entity.id) {
          delete entity.id;
        }
        const serlialized = serializeFetchResult(query, schema, entity);
        return [id, serlialized];
      });

      return ServerResponse(200, data);
    } catch (e) {
      return this.errorResponse(e as Error);
    }
  }

  async insert(collectionName: string, entity: any) {
    try {
      const insertedData = await this.db.insert(collectionName, entity, {
        skipRules: hasAdminAccess(this.token),
      });
      const collectionSchema =
        this.db.getSchema()?.collections?.[collectionName].schema;
      const serialized = collectionSchema
        ? Type.serialize(collectionSchema, insertedData, 'decoded')
        : insertedData;
      return ServerResponse(200, serialized);
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not insert entity. An unknown error occurred.',
      });
    }
  }

  async bulkInsert(inserts: Record<string, any[]>) {
    try {
      const txResult = await this.db.transact(
        async (tx) => {
          const output = Object.keys(inserts).reduce(
            (acc, collectionName) => ({ ...acc, [collectionName]: [] }),
            {}
          ) as Record<string, any[]>;
          for (const [collectionName, entities] of Object.entries(inserts)) {
            for (const entity of entities) {
              const insertedEntity = await tx.insert(collectionName, entity);
              output[collectionName].push(insertedEntity);
            }
          }
          return output;
        },
        { skipRules: hasAdminAccess(this.token) }
      );
      return ServerResponse(200, txResult);
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not insert entity. An unknown error occurred.',
      });
    }
  }

  async insertTriples(...params: any[]) {
    return ServerResponse(410, {});
  }

  async deleteTriples(...params: any[]) {
    return ServerResponse(410, {});
  }

  async applyChanges(params: { changes: any }) {
    try {
      if (!hasAdminAccess(this.token)) return NotAdminResponse();
      const changes = SuperJSON.deserialize<DBChanges>(params.changes);
      const timestamp = this.db.clock.next();
      await this.db.applyChangesWithTimestamp(changes, timestamp, {
        skipRules: hasAdminAccess(this.token),
      });
      await this.db.updateQueryViews();
      this.db.broadcastToQuerySubscribers();
      return ServerResponse(200, {});
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not apply changes. An unknown error occurred.',
      });
    }
  }

  // TODO: breaking API change from patch array to changes {}
  async update(collectionName: string, entityId: string, changes: any) {
    try {
      await this.db.update(collectionName, entityId, changes, {
        skipRules: hasAdminAccess(this.token),
      });
      return ServerResponse(200, {});
    } catch (e) {
      return this.errorResponse(e, {
        fallbackMessage: 'Could not update entity. An unknown error occurred.',
      });
    }
  }

  async delete(collectionName: string, entityId: string) {
    try {
      await this.db.delete(collectionName, entityId, {
        skipRules: hasAdminAccess(this.token),
      });
      return ServerResponse(200, {});
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
    logger.error('Error processing request', e as Error);
    return ServerResponse(generalError.status, generalError.toJSON());
  }
  async handleWebhooksJSONPush({
    webhooks,
  }: {
    webhooks: WebhookJSONDefinition;
  }) {
    if (!hasAdminAccess(this.token)) return NotAdminResponse();
    try {
      // TODO: add back webhooks
      // this.server.webhooksManager.addAndStoreWebhooks(webhooks);
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
      // TODO: add back webhooks
      // this.server.webhooksManager.clearWebhooks();
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
      // TODO: add back webhooks
      // const webhooks = await this.server.webhooksManager.getWebhooks();
      // return ServerResponse(200, webhooks);
      return ServerResponse(200, {});
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
