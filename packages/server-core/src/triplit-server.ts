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
import { Logger, NullLogger } from './logging.js';

/**
 * Represents a Triplit server for a specific tenant.
 */
export class Server {
  private connections: Map<string, Connection> = new Map();

  constructor(public db: TriplitDB<any>, public logger: Logger = NullLogger) {}

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
    const params: any = maybeParams || {};
    let resp: ServerResponseType;
    try {
      if (!isValidRoute(route)) return routeNotFoundResponse(route);
      this.logger.log('Handling request', { route, params, token });
      const session = this.createSession(token);
      const firstSegment = route[0];
      switch (firstSegment) {
        case 'queryTriples':
          resp = await session.queryTriples(params);
          break;
        case 'clear':
          resp = await session.clearDB(params);
          break;

        case 'migration': {
          if (route[1] === 'status') {
            resp = await session.getMigrationStatus();
            break;
          }
          if (route[1] === 'apply') {
            resp = await session.applyMigration(params);
            break;
          }
        }
        case 'stats':
          resp = await session.getCollectionStats();
          break;
        case 'fetch': {
          const { query } = params;
          resp = await session.fetch(query);
          break;
        }
        case 'insert': {
          const { collectionName, entity } = params;
          resp = await session.insert(collectionName, entity);
          break;
        }
        case 'bulk-insert': {
          resp = await session.bulkInsert(params);
          break;
        }
        case 'insert-triples': {
          const { triples } = params;
          resp = await session.insertTriples(triples);
          break;
        }
        case 'delete-triples': {
          const { entityAttributes } = params;
          resp = await session.deleteTriples(entityAttributes);
          break;
        }
        case 'update': {
          const { collectionName, entityId, patches } = params;
          resp = await session.update(collectionName, entityId, patches);
          break;
        }
        case 'delete': {
          const { collectionName, entityId } = params;
          resp = await session.delete(collectionName, entityId);
          break;
        }
        case 'schema': {
          resp = await session.getSchema(params);
          break;
        }
        default:
          resp = routeNotFoundResponse(route);
          break;
      }
    } catch (e: any) {
      const error = isTriplitError(e)
        ? e
        : new TriplitError('An unknown error occured');
      this.logger.error('Error handling request', {
        route,
        params,
        token,
        error,
      });
      resp = ServerResponse(error.status, error.toJSON());
    }
    this.logger.log('Sending response', resp);
    return resp;
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
  'insert-triples',
  'delete-triples',
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
