import {
  DBOptions,
  KVStore,
  TriplitError,
  getRolesFromSession,
  createDB,
  ServerEntityStore,
  normalizeSessionVars,
  sessionRolesAreEquivalent,
  DBSchema,
  DEFAULT_ROLES,
} from '@triplit/db';
import {
  InvalidAuthenticationSchemeError,
  MalformedMessagePayloadError,
  NoTokenProvidedError,
} from '@triplit/server-core/errors';
import {
  Server as TriplitServer,
  Route,
  SyncConnection,
} from '@triplit/server-core';
import {
  ClientSyncMessage,
  ParseResult,
  ServerCloseReason,
} from '@triplit/types/sync';
import { logger, LogHandler } from '@triplit/logger';
import { ConsoleHandler } from '@triplit/logger/console';
import { parseAndValidateToken, ProjectJWT } from '@triplit/server-core/token';
import { Context, Hono } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { randomUUID as getRandomUUID } from 'uncrypto';

import { WSContext, type UpgradeWebSocket, WSMessageReceive } from 'hono/ws';

// import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { createTriplitStorageProvider, StoreKeys } from './storage.js';
import { bodyLimit } from 'hono/body-limit';

type Variables = {
  token: ProjectJWT;
};

const MB1 = 1024 * 1024;

export type ServerOptions = {
  storage?: StoreKeys | KVStore | (() => KVStore);
  dbOptions?: DBOptions;
  verboseLogs?: boolean;
  upstream?: {
    url: string;
    token: string;
  };
  logHandler?: LogHandler;
  jwtSecret: string;
  projectId?: string;
  // do we still need this?
  claimsPath?: string;
  externalJwtSecret?: string;
  maxPayloadMb?: number | string;
};

export async function createTriplitHonoServer(
  options: ServerOptions,
  upgradeWebSocket: UpgradeWebSocket,
  captureException?: (e: unknown) => void,
  honoApp?: Hono
) {
  const dbSource = !!options?.storage
    ? typeof options.storage === 'function'
      ? options.storage()
      : options.storage
    : undefined;
  options.logHandler
    ? logger.registerHandler(options.logHandler, { exclusive: true })
    : logger.registerHandler(
        new ConsoleHandler({
          formatter: (record) => {
            const { level, message, timestamp, context, attributes } = record;
            const timeStr = new Date(timestamp).toISOString();
            return [
              `[${timeStr}] [${context ?? '*'}] ${message}`,
              attributes || '',
            ];
          },
        })
      );
  // if (options?.verboseLogs) logger.level = true;
  const dbOptions: Partial<DBOptions> = {
    experimental: {},
  };
  Object.assign(dbOptions, options?.dbOptions);
  // const db = options.upstream
  //   ? new TriplitClient({
  //       serverUrl: options.upstream.url,
  //       token: options.upstream.token,
  //       syncSchema: true,
  //       skipRules: false,
  //     })
  //   : new DB({
  //       source: dbSource,
  //       clock: new DurableClock(),
  //       // Can this be removed?
  //       tenantId: options.projectId,
  //       ...dbOptions,
  //     });

  // let kvStore = null;
  // if (dbSource && dbSource === 'sqlite') {
  //   const sqlite = require('better-sqlite3');
  // }

  // if a schema is provided but no roles, add default roles
  const schema: DBSchema | undefined =
    !!dbOptions.schema?.collections && !dbOptions.schema.roles
      ? {
          collections: dbOptions.schema.collections,
          roles: DEFAULT_ROLES,
        }
      : dbOptions.schema;

  const db = await createDB({
    ...dbOptions,
    schema,
    clientId: 'server',
    entityStore: new ServerEntityStore(),
    kv:
      typeof dbSource === 'string'
        ? createTriplitStorageProvider(dbSource)
        : dbSource,
  });

  const server = new TriplitServer(db, captureException);

  // @ts-expect-error
  globalThis.db = db;
  // @ts-expect-error
  globalThis.server = server;
  // @ts-expect-error
  globalThis.showSubscribedQueries = () => {
    console.table(
      [...db.ivm.subscribedQueries.values()].map((val) => ({
        collection: val.query.collectionName,
        listeners: val.listeners.size,
        limit: val.query.limit,
        ...Object.fromEntries(
          (val.query.order ?? []).map((order, i) => [
            `order-${i}`,
            JSON.stringify(order),
          ])
        ),
        ...Object.fromEntries(
          (val.query.where ?? []).map((filter, i) => [
            `where-${i}`,
            JSON.stringify(filter),
          ])
        ),
      }))
    );
  };

  function parseAndValidateTokenWithOptions(token: string) {
    return parseAndValidateToken(token, options.jwtSecret, options.projectId, {
      payloadPath: options.claimsPath,
      externalSecret: options.externalJwtSecret,
    });
  }

  const app = (honoApp ?? new Hono()) as Hono<{ Variables: Variables }>;

  const syncConnections = new Map<
    string,
    { connection: SyncConnection; ws: WSContext<any> }
  >();
  // app.use(honoLogger());
  app.use(cors());

  // app.use(async (c, next) => {
  //   const reqBody = await c.req.text();
  //   const route = new URL(c.req.url).pathname;

  //   logger.logRequest(c.req.method, route, reqBody ?? undefined);
  //   const start = Date.now();
  //   await next();
  //   logger.logResponse(c.req.method, route, c.res.status, Date.now() - start);
  // });

  app.onError((error, c) => {
    logger.error('Error handling request', error);
    if (error instanceof TriplitError) {
      if (error.status === 500) captureException?.(error);
      return c.json(error.toJSON(), error.status as ContentfulStatusCode);
    }
    captureException?.(error);
    return c.text('Internal server error', 500);
  });

  app.get('/healthcheck', (c) => {
    return c.text('OK', 200);
  });

  app.get(
    '/',
    upgradeWebSocket((c) => {
      let syncConnection: SyncConnection | undefined = undefined;
      return {
        onOpen: async (_event, ws) => {
          let token: ProjectJWT | undefined = undefined;

          try {
            const { data, error } = await parseAndValidateTokenWithOptions(
              c.req.query('token')!
            );
            if (error) throw error;
            token = data;
          } catch (e) {
            captureException?.(e);
            closeSocket(
              ws,
              {
                type: 'UNAUTHORIZED',
                retry: false,
                message: e instanceof Error ? e.message : undefined,
              },
              1008
            );
            return;
          }
          try {
            const clientSchemaHash = c.req.query('schema')
              ? parseInt(c.req.query('schema') as string)
              : undefined;
            const syncSchema = c.req.query('sync-schema') === 'true';

            // TODO replace with better ID generation
            const clientId = getRandomUUID();

            syncConnection = server.openConnection(token, {
              clientSchemaHash: clientSchemaHash,
              syncSchema,
              clientId,
            });
            syncConnections.set(clientId, { connection: syncConnection, ws });
            // @ts-expect-error
            ws.tokenExpiration = token.exp;
            syncConnection!.addListener((messageType, payload) => {
              if (
                // @ts-expect-error
                ws.tokenExpiration &&
                // @ts-expect-error
                ws.tokenExpiration * 1000 < Date.now()
              ) {
                closeSocket(ws, { type: 'TOKEN_EXPIRED', retry: false }, 1008);
                return;
              }
              sendMessage(ws, messageType, payload);
            });
            await syncConnection.start();
          } catch (e) {
            logger.error('Error opening connection', e as any);
            captureException?.(e);
            closeSocket(
              ws,
              {
                type: 'INTERNAL_ERROR',
                retry: false,
                message: e instanceof Error ? e.message : undefined,
              },
              1011
            );
            return;
          }
        },
        async onMessage(event, ws) {
          if (
            // @ts-expect-error
            ws.tokenExpiration &&
            // @ts-expect-error
            ws.tokenExpiration * 1000 < Date.now()
          ) {
            closeSocket(ws, { type: 'TOKEN_EXPIRED', retry: false }, 1008);
            return;
          }
          const { data: parsedMessage, error } = parseClientMessage(event.data);
          if (error)
            return sendErrorMessage(
              ws,
              undefined,
              new MalformedMessagePayloadError(),
              {
                message: event.data,
              }
            );
          // logger.info('received', parsedMessage);
          messageLogger.info('received', parsedMessage);
          if (parsedMessage.type === 'UPDATE_TOKEN') {
            const { token: newToken } = parsedMessage.payload;
            const { data, error } =
              await parseAndValidateTokenWithOptions(newToken);
            if (error) {
              closeSocket(
                ws,
                {
                  type: 'UNAUTHORIZED',
                  message: error.message,
                  retry: false,
                },
                1008
              );
              return;
            }
            const newTokenRoles = getRolesFromSession(
              syncConnection?.db.schema,
              normalizeSessionVars(data)
            );

            const existingTokenRoles = getRolesFromSession(
              syncConnection?.db.schema,
              // @ts-expect-error
              normalizeSessionVars(syncConnection?.token)
            );
            if (!sessionRolesAreEquivalent(newTokenRoles, existingTokenRoles)) {
              closeSocket(
                ws,
                {
                  type: 'ROLES_MISMATCH',
                  message: "Roles for new token don't match the old token.",
                  retry: false,
                },
                1008
              );
              return;
            }
            // @ts-expect-error
            ws.tokenExpiration = data?.exp;
            return;
          }

          syncConnection!.dispatchCommand(parsedMessage!);
        },
        onClose: (event, ws) => {
          if (!syncConnection) return;

          server.closeConnection(syncConnection);
          // Should this use the closeSocket function?
          ws.close(event.code, event.reason);
        },
        onError: (event, ws) => {
          captureException?.(event);
          closeSocket(ws, { type: 'INTERNAL_ERROR', retry: false }, 1011);
        },
      };
    })
  );

  app.use('*', async (c, next) => {
    const authHeader = c.req.header('authorization');
    if (!authHeader) {
      throw new NoTokenProvidedError('Missing authorization header');
    }
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer') {
      throw new InvalidAuthenticationSchemeError();
    }
    if (!token) {
      throw new NoTokenProvidedError('Missing authorization token');
    }
    try {
      const { data, error } = await parseAndValidateTokenWithOptions(token);
      if (error) throw error;
      c.set('token', data);
      return next();
    } catch (e) {
      let triplitError: TriplitError;
      if (e instanceof TriplitError) triplitError = e;
      else if (e instanceof Error) triplitError = new TriplitError(e.message);
      else
        triplitError = new TriplitError(
          'An unknown error occurred while parsing token'
        );
      throw triplitError;
    }
  });

  app.post('/update-token', async (c) => {
    const { clientId } = await c.req.json();
    if (!syncConnections.has(clientId)) {
      return c.json(new TriplitError('No connection found for clientId'), 400);
    }
    const tokenData = c.get('token');

    const { ws, connection: syncConnection } = syncConnections.get(clientId)!;
    const newTokenRoles = getRolesFromSession(
      syncConnection?.db.schema,
      normalizeSessionVars(tokenData)
    );
    console.log({ clientId, token: tokenData, roles: newTokenRoles });

    const existingTokenRoles = getRolesFromSession(
      syncConnection?.db.schema,
      normalizeSessionVars(syncConnection?.token)
    );
    if (!sessionRolesAreEquivalent(newTokenRoles, existingTokenRoles)) {
      closeSocket(
        ws,
        {
          type: 'ROLES_MISMATCH',
          message: "Roles for new token don't match the old token.",
          retry: false,
        },
        1008
      );
      return c.text('OK', 200);
    }
    // @ts-expect-error
    ws.tokenExpiration = tokenData?.exp;

    return c.text('OK', 200);
  });

  app.get('/version', (c) => {
    return c.text('1.0.0', 200);
  });

  let parsedMaxPayload =
    typeof options.maxPayloadMb === 'string'
      ? parseInt(options.maxPayloadMb)
      : options.maxPayloadMb;
  // If invalid number, set to undefined
  if (typeof parsedMaxPayload !== 'number' || isNaN(parsedMaxPayload))
    parsedMaxPayload = undefined;
  // Default to 100MB
  const maxPayloadBytes = (parsedMaxPayload ?? 100) * MB1;
  app.post(
    '/bulk-insert-file',
    bodyLimit({
      // NOTE: bun max is 128MB https://hono.dev/docs/middleware/builtin/body-limit#usage-with-bun-for-large-requests
      // Maybe this can be configurable?
      maxSize: maxPayloadBytes,
      onError: (c) => {
        const error = new TriplitError(
          `Body too large, max size is ${Math.floor(maxPayloadBytes / MB1)} MB`
        );
        return c.json(error.toJSON(), 413);
      },
    }),
    async (c) => {
      // Flag to ignore the return value and just return 200
      // Would be nice to have this flow into the DB as well and save on work done to prepare a query response
      // This is fairly innocuous to rename/rethink, so we can refactor as needed
      const noReturn = c.req.query('no-return') === 'true';
      const body = await parseMultipartFormData(c);
      if (!body['data']) {
        return c.json(
          new TriplitError('No data provided for file upload'),
          400
        );
      }
      const data =
        typeof body['data'] === 'string'
          ? JSON.parse(body['data'])
          : body['data'];
      const token = c.get('token');
      const { statusCode, payload } = await server.handleRequest(
        ['bulk-insert'],
        { noReturn, inserts: data },
        token
      );
      return c.json(
        noReturn ? {} : payload,
        statusCode as ContentfulStatusCode
      );
    }
  );
  app.post('*', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch (e) {}
    const token = c.get('token');
    const { statusCode, payload } = await server.handleRequest(
      new URL(c.req.url).pathname.slice(1).split('/') as Route,
      body,
      token
    );
    return c.json(payload, statusCode as ContentfulStatusCode);
  });

  return app;
}

// Seeing hono methods return a single 1MB chunk of the file data, so manually parsing formdata
// ex. c.req.formData(), c.req.parseBody(), etc
// TODO: create issue with hono
async function parseMultipartFormData(c: Context) {
  const contentType = c.req.header('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error(`Invalid Content-Type: ${contentType}`);
  }

  // Extract boundary from `Content-Type: multipart/form-data; boundary=------xyz`
  const boundary = '--' + contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('Invalid boundary');
  }

  // Read the full request body
  const rawBuffer = await c.req.arrayBuffer();
  const rawText = new TextDecoder().decode(rawBuffer); // Convert buffer to string

  // Split parts using the boundary
  const parts = rawText.split(boundary).slice(1, -1); // Ignore first/last empty parts

  const formData: Record<string, string> = {}; // Store parsed key-value pairs

  for (const part of parts) {
    const [headers, ...bodyLines] = part.trim().split('\r\n\r\n');
    const body = bodyLines.join('\r\n\r\n'); // Handle multi-line body

    // Find `name="data"` in Content-Disposition
    const contentDisposition = headers.split('\r\n')[0]; // First header line
    const nameMatchIndex = contentDisposition.indexOf('name="');
    if (nameMatchIndex === -1) continue;

    // Extract the field name
    const nameStart = nameMatchIndex + 6; // `name="` is 6 characters long
    const nameEnd = contentDisposition.indexOf('"', nameStart);
    const fieldName = contentDisposition.slice(nameStart, nameEnd);

    // If content header specifies JSON, parse it
    const contentTypeHeader = headers
      .split('\r\n')
      .find((h) => h.toLowerCase().startsWith('content-type'));
    const isJson = contentTypeHeader?.includes('application/json');

    if (isJson) {
      formData[fieldName] = JSON.parse(body);
    } else {
      formData[fieldName] = body;
    }
  }
  return formData;
}

const messageLogger = logger.context('message');
function sendMessage(
  socket: WSContext,
  type: any,
  payload: any,
  options: { dropIfClosed?: boolean } = {}
) {
  const message = JSON.stringify({ type, payload });
  // OPEN = 1
  if (socket.readyState === 1) {
    socket.send(message);
    messageLogger.info('sent', { type, payload });
    // logger.log('sent', type, payload);
  }
}

function sendErrorMessage(
  socket: WSContext,
  originalMessage: ClientSyncMessage | undefined, // message is undefined if we cannot parse it
  error: TriplitError,
  metadata?: any
) {
  const messageType = originalMessage?.type;
  let payload = {
    messageType,
    error: error.toJSON(),
    metadata,
  };
  sendMessage(socket, 'ERROR', payload);
}

function closeSocket(
  socket: WSContext,
  reason: ServerCloseReason,
  code?: number
) {
  // Send message informing client of upcoming close, may include message containing reason
  sendMessage(socket, 'CLOSE', reason, { dropIfClosed: true });
  // Close connection
  // Close payload must remain under 125 bytes
  socket.close(
    code,
    JSON.stringify({ type: reason.type, retry: reason.retry })
  );
}

function parseClientMessage(
  message: WSMessageReceive
): ParseResult<ClientSyncMessage> {
  // TODO: do more validation here
  try {
    const parsedMessage = JSON.parse(message.toString());
    return { data: parsedMessage, error: undefined };
  } catch (e) {
    // @ts-ignore
    return { data: undefined, error: e };
  }
}
