import {
  DB as TriplitDB,
  CollectionQuery,
  TriplitError,
  schemaToJSON,
  hashSchemaJSON,
} from '@triplit/db';
import { ServiceKeyRequiredError } from './errors.js';
import { ParsedToken } from '@triplit/types/sync';
import { Session } from './session.js';

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

function UnauthorizedResponse() {
  const error = new ServiceKeyRequiredError();
  return ServerResponse(error.status, error.toString());
}

function hasAdminAccess(token: ParsedToken) {
  return token && token.type === 'secret';
}

export class Server {
  constructor(readonly db: TriplitDB<any>) {}

  async clearDB({ full }: { full?: boolean }, token: ParsedToken) {
    if (!hasAdminAccess(token)) return UnauthorizedResponse();
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
    if (!hasAdminAccess(token)) return UnauthorizedResponse();
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
    if (!hasAdminAccess(token)) return UnauthorizedResponse();
    try {
      if (!migration || !direction)
        return errorResponse(
          new TriplitError('Missing migration or direction')
        );
      await this.db.migrate([migration], direction);
    } catch (e) {
      return errorResponse(new TriplitError('Error applying migration'));
    }
    return ServerResponse(200, 'Migration applied');
  }

  async getCollectionStats(token: ParsedToken) {
    if (!hasAdminAccess(token)) return UnauthorizedResponse();
    const stats = await this.db.getCollectionStats();
    const payload = Array.from(stats).map(([collection, numEntities]) => ({
      collection,
      numEntities,
    }));
    return ServerResponse(200, payload);
  }

  async getSchema(params: { format?: 'json' | 'triples' }, token: ParsedToken) {
    if (!hasAdminAccess(token)) return UnauthorizedResponse();
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

  async getSession(
    clientId: string,
    token: ParsedToken,
    clientSchemaHash?: number,
    syncSchema?: boolean
  ) {
    return new Session(clientId, token, this.db, clientSchemaHash, syncSchema);
  }
}

function errorResponse(e: Error) {
  if (e instanceof TriplitError) {
    return ServerResponse(e.status, e.toString());
  }
  const generalError = new TriplitError(
    'An unknown error occured processing your request'
  );
  console.log(e);
  return ServerResponse(generalError.status, generalError.toString());
}
