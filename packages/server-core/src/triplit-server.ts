import { DB as TriplitDB, TriplitError } from '@triplit/db';
import { ParsedToken } from '@triplit/types/sync';
import {
  Connection,
  ConnectionOptions,
  ServerResponse,
  Session,
  routeNotFoundResponse,
} from './session.js';
import type { ServerResponse as ServerResponseType } from './session.js';
import { isTriplitError } from './utils.js';

/**
 * Represents a Triplit server for a specific tenant.
 */
export class Server {
  private connections: Map<string, Connection> = new Map();

  constructor(public db: TriplitDB<any>) {}

  createSession(token: ParsedToken) {
    return new Session(this, token);
  }

  getConnection(clientId: string) {
    return this.connections.get(clientId);
  }

  openConnection(token: ParsedToken, connectionOptions: ConnectionOptions) {
    const session = this.createSession(token);
    const connection = session.createConnection(connectionOptions);
    this.connections.set(connectionOptions.clientId, connection);
    return connection;
  }

  closeConnection(clientId: string) {
    this.connections.delete(clientId);
  }

  async handleRequest(
    route: Route,
    maybeParams: any,
    token: ParsedToken
  ): Promise<ServerResponseType> {
    try {
      if (!isValidRoute(route)) return routeNotFoundResponse(route);
      const params: any = maybeParams || {};
      const session = this.createSession(token);
      const firstSegment = route[0];
      switch (firstSegment) {
        case 'queryTriples':
          return await session.queryTriples(params);
        case 'clear':
          return await session.clearDB(params);
        case 'migration': {
          if (route[1] === 'status') return await session.getMigrationStatus();
          if (route[1] === 'apply') return await session.applyMigration(params);
        }
        case 'stats':
          return await session.getCollectionStats();
        case 'fetch': {
          const { query } = params;
          return await session.fetch(query);
        }
        case 'insert': {
          const { collectionName, entity } = params;
          return await session.insert(collectionName, entity);
        }
        case 'bulk-insert': {
          return await session.bulkInsert(params);
        }
        case 'update': {
          const { collectionName, entityId, patches } = params;
          return await session.update(collectionName, entityId, patches);
        }
        case 'delete': {
          const { collectionName, entityId } = params;
          return await session.delete(collectionName, entityId);
        }
        case 'schema': {
          return await session.getSchema(params);
        }
        default:
          return routeNotFoundResponse(route);
      }
    } catch (e: any) {
      const error = isTriplitError(e)
        ? e
        : new TriplitError('An unknown error occured');
      return ServerResponse(error.status, error.toJSON());
    }
  }
}

const TRIPLIT_SEGEMENTS = [
  'queryTriples',
  'clear',
  'stats',
  'schema',
  'fetch',
  'insert',
  'bulk-insert',
  'update',
  'delete',
] as const;

const MIGRATION_SEGMENTS = ['status', 'apply'] as const;

type TriplitPath = [(typeof TRIPLIT_SEGEMENTS)[number]];
type MigrationPath = ['migration', (typeof MIGRATION_SEGMENTS)[number]];
export type Route = TriplitPath | MigrationPath | [];

function isValidRoute(route: string[]): route is Route {
  if (route.length === 0 || route.length > 2) return false;
  if (route[0] === 'migration') {
    if (route.length === 1) return false;
    // @ts-expect-error
    return MIGRATION_SEGMENTS.includes(route[1]);
  }
  if (route.length > 1) return false;
  // @ts-expect-error
  return TRIPLIT_SEGEMENTS.includes(route[0]);
}
