import { hashObject, TriplitError } from '@triplit/db';
import { DB as TriplitDB } from '@triplit/db';

import { ServerResponse, Session, routeNotFoundResponse } from './session.js';
import { ConnectionOptions, SyncConnection } from './sync-connection.js';
import type { ServerResponse as ServerResponseType } from './session.js';
import { isTriplitError } from './utils.js';
import { ProjectJWT } from './token.js';
import { WebhooksManager } from './webhooks-manager.js';
import { logger, Logger } from '@triplit/logger';
import { COMPATIBILITY_LIST_KEY } from './constants.js';

/**
 * Represents a Triplit server for a specific tenant.
 */
export class Server {
  // NOTE: potential memory leak here if these arent properly managed
  private connections: Set<SyncConnection> = new Set();
  // public webhooksManager: WebhooksManager;

  constructor(
    public db: TriplitDB<any>,
    public exceptionReporter: (e: unknown) => void = (e) => console.error(e)
  ) {
    // TODO: reimplement webhooks
    // this.webhooksManager = new WebhooksManager(db);
    this.db.onCommit(async (changes) => {
      await this.db.updateQueryViews();
      this.db.broadcastToQuerySubscribers();
    });
    this.db.onSchemaChange(async (change) => {
      if (change.successful) {
        const hash = hashObject(change.newSchema.collections);
        const compatibilityList = await this.db.getMetadata<number[]>(
          COMPATIBILITY_LIST_KEY
        );
        const backwardsCompatible = change.issues.length === 0;

        // If we are backwards compatible and the hash is not in the list, add it
        if (backwardsCompatible) {
          const hashes = compatibilityList ?? [];
          if (hash !== undefined && !hashes?.includes(hash)) {
            await this.db.setMetadata(COMPATIBILITY_LIST_KEY, [
              ...(hashes ?? []),
              hash,
            ]);
          }
        }
        // If we are not backwards compatible, reset the compatibility list
        else {
          await this.db.setMetadata(COMPATIBILITY_LIST_KEY, [hash]);
        }
      }
    });
    setInterval(() => {
      for (const connection of this.connections) {
        connection.flushEntityDataToClient();
      }
    }, 10);
  }

  createSession(token: ProjectJWT) {
    return new Session(this, token);
  }

  // getConnection(clientId: string) {
  //   return this.connections.get(clientId);
  // }

  openConnection(token: ProjectJWT, connectionOptions: ConnectionOptions) {
    const connection = new SyncConnection(token, this.db, connectionOptions);
    this.connections.add(connection);
    logger.info(`Sync client connected \(${this.connections.size} total\)`, {
      token,
      connectionOptions,
    });
    return connection;
  }

  closeConnection(connection: SyncConnection) {
    connection?.close();
    this.connections.delete(connection);
    logger.info(`Sync client disconnected \(${this.connections.size} total\)`, {
      token: connection.token,
    });
  }

  async handleRequest(
    route: Route,
    maybeParams: any,
    token: ProjectJWT
  ): Promise<ServerResponseType> {
    const params: any = maybeParams || {};
    let resp: ServerResponseType;
    try {
      if (!isValidRoute(route)) return routeNotFoundResponse(route);
      logger
        .context('request')
        .info('Handling request', { path: route, params, token });
      const session = this.createSession(token);
      const firstSegment = route[0];
      switch (firstSegment) {
        case 'clear':
          resp = await session.clearDB(params);
          break;
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
        case 'update': {
          const { collectionName, entityId, changes } = params;
          resp = await session.update(collectionName, entityId, changes);
          break;
        }
        case 'delete': {
          const { collectionName, entityId } = params;
          resp = await session.delete(collectionName, entityId);
          break;
        }
        case 'delete-all': {
          const { collectionName } = params;
          resp = await session.deleteAll(collectionName);
        }
        case 'schema': {
          resp = await session.getSchema(params);
          break;
        }
        case 'webhooks-get': {
          resp = await session.handleWebhooksGet();
          break;
        }
        case 'webhooks-push': {
          resp = await session.handleWebhooksJSONPush(params);
          break;
        }
        case 'webhooks-clear': {
          resp = await session.handleWebhooksClear();
          break;
        }
        case 'override-schema': {
          resp = await session.overrideSchema(params);
          break;
        }
        case 'apply-changes': {
          resp = await session.applyChanges(params);
          break;
        }
        // === Dead routes ===
        case 'query-triples':
        case 'queryTriples':
          resp = await session.queryTriples(params);
          break;
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
        // === Not Found ===
        default:
          resp = routeNotFoundResponse(route);
          break;
      }
    } catch (e: any) {
      const knownError = isTriplitError(e);
      if (!knownError) {
        this.exceptionReporter(e);
      }
      const error = knownError
        ? e
        : new TriplitError(
            `An unknown error occurred while handling the request: ${route.join(
              '/'
            )}`,
            e
          );
      logger.error('Error handling request', {
        route,
        params,
        token,
        error,
      });
      resp = ServerResponse(error.status, error.toJSON());
    }
    logger
      .context('response')
      .info('Sending response', { ...resp, path: route });
    return resp;
  }
}

const TRIPLIT_SEGEMENTS = [
  'apply-changes',
  'bulk-insert',
  'clear',
  'delete',
  'delete-all',
  'delete-triples',
  'fetch',
  'insert',
  'insert-triples',
  'override-schema',
  'queryTriples',
  'query-triples',
  'schema',
  'stats',
  'update',
  'webhooks-get',
  'webhooks-push',
  'webhooks-clear',
] as const;

type TriplitPath = [(typeof TRIPLIT_SEGEMENTS)[number]];
export type Route = TriplitPath | [];

function isValidRoute(route: string[]): route is Route {
  if (route.length === 0 || route.length > 2) return false;
  if (route.length > 1) return false;
  // @ts-expect-error
  return TRIPLIT_SEGEMENTS.includes(route[0]);
}
