import { DB, TriplitError, DurableClock, DBConfig, Storage } from '@triplit/db';
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
import { logger } from './logger.js';
import { parseAndValidateToken, ProjectJWT } from '@triplit/server-core/token';
import { Context, Hono } from 'hono';
import { StatusCode } from 'hono/utils/http-status';

import { WSContext, type UpgradeWebSocket, WSMessageReceive } from 'hono/ws';
import { type BaseClient as SentryClient } from '@sentry/core';

import { StoreKeys, resolveStorageStringOption } from './storage.js';
import { env } from 'hono/adapter';
import { logger as honoLogger } from 'hono/logger';

import { TriplitClient } from '@triplit/client';

type Variables = {
  token: ProjectJWT;
};

export type ServerOptions = {
  storage?: StoreKeys | Storage | (() => Storage);
  dbOptions?: DBConfig;
  watchMode?: boolean;
  verboseLogs?: boolean;
  upstream?: {
    url: string;
    token: string;
  };
};

export function createTriplitHonoServer(
  options: ServerOptions,
  upgradeWebSocket: UpgradeWebSocket,
  sentry?: SentryClient<any>
) {
  const dbSource = !!options?.storage
    ? typeof options.storage === 'string'
      ? resolveStorageStringOption(
          // @ts-ignore TODO: check why this is not working...might be module resolution issue?
          options.storage
        )
      : typeof options.storage === 'function'
      ? options.storage()
      : options.storage
    : undefined;
  if (options?.verboseLogs) logger.verbose = true;
  const dbOptions: Partial<DBConfig> = {
    experimental: {},
  };
  Object.assign(dbOptions, options?.dbOptions);
  const db = options.upstream
    ? new TriplitClient({
        // clientId: projectId,
        serverUrl: options.upstream.url,
        token: options.upstream.token,
        syncSchema: true,
        skipRules: false,
      })
    : new DB({
        source: dbSource,
        // tenantId: projectId,
        clock: new DurableClock(),
        ...dbOptions,
      });
  // @ts-expect-error
  const server = new TriplitServer(db, captureException);

  // DO THIS IN A CROSS PLATFORM WAY
  if (process.env.ENTITY_CACHE_ENABLED) {
    dbOptions.experimental!.entityCache = {
      capacity: process.env.ENTITY_CACHE_CAPACITY
        ? parseInt(process.env.ENTITY_CACHE_CAPACITY)
        : 100000,
    };
  }
  const app = new Hono<{ Variables: Variables }>();

  function captureException(e: any) {
    if (sentry && e instanceof Error) {
      sentry.captureException(e);
    }
  }

  app.use(honoLogger());

  // app.use(async (c, next) => {
  //   const reqBody = await c.req.text();
  //   const route = new URL(c.req.url).pathname;

  //   logger.logRequest(c.req.method, route, reqBody ?? undefined);
  //   const start = Date.now();
  //   await next();
  //   logger.logResponse(c.req.method, route, c.res.status, Date.now() - start);
  // });

  app.onError((error, c) => {
    if (error instanceof TriplitError) {
      if (error.status === 500) captureException(error);
      return c.json(error.toJSON(), error.status as StatusCode);
    }
    captureException(error);
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
          if (!ws.url) return;
          const queryParams = new URL(ws.url).searchParams;

          let token: ProjectJWT | undefined = undefined;

          try {
            const { data, error } = await parseAndValidateTokenWithEnv(
              queryParams.get('token')!,
              c
            );
            if (error) throw error;
            token = data;
          } catch (e) {
            captureException(e);
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
            const clientId = queryParams.get('client') as string;
            const clientHash = queryParams.get('schema')
              ? parseInt(queryParams.get('schema') as string)
              : undefined;
            const syncSchema = queryParams.get('sync-schema') === 'true';

            syncConnection = server.openConnection(token, {
              clientId,
              clientSchemaHash: clientHash,
              syncSchema,
            });
            const schemaIncompatibility =
              await syncConnection.isClientSchemaCompatible();
            if (schemaIncompatibility) {
              schemaIncompatibility.retry = !!options?.watchMode;
              closeSocket(ws, schemaIncompatibility, 1008);
              return;
            }
            syncConnection!.addListener((messageType, payload) => {
              sendMessage(ws, messageType, payload);
            });
          } catch (e) {
            console.error(e);
            captureException(e);
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
        onMessage(event, ws) {
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
          logger.logMessage('received', parsedMessage);
          syncConnection!.dispatchCommand(parsedMessage!);
        },
        onClose: (event, ws) => {
          if (!syncConnection) return;

          server.closeConnection(syncConnection.options.clientId);

          // Should this use the closeSocket function?
          ws.close(event.code, event.reason);
        },
        onError: (event, ws) => {
          console.log('error', event);
          // TODO: handle error
          captureException(event);
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
      const { data, error } = await parseAndValidateTokenWithEnv(token, c);
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

  app.post('/bulk-insert-file', async (c) => {
    const body = await c.req.formData();
    if (!body.has('data')) {
      return c.text('No data provided for file upload', 400);
    }
    const data = JSON.parse(body.get('data') as string);
    const token = c.get('token');
    const { statusCode, payload } = await server.handleRequest(
      ['bulk-insert'],
      data,
      token
    );
    return c.json(payload, statusCode as StatusCode);
  });
  app.post('*', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      throw new TriplitError('Invalid JSON body', 400);
    }
    const token = c.get('token');
    const { statusCode, payload } = await server.handleRequest(
      new URL(c.req.url).pathname.slice(1).split('/') as Route,
      body,
      token
    );
    return c.json(payload, statusCode as StatusCode);
  });

  return app;
}

function parseAndValidateTokenWithEnv(token: string, c: Context) {
  const { JWT_SECRET, PROJECT_ID, CLAIMS_PATH, EXTERNAL_JWT_SECRET } = env(c);
  return parseAndValidateToken(token, JWT_SECRET, PROJECT_ID, {
    payloadPath: CLAIMS_PATH,
    externalSecret: EXTERNAL_JWT_SECRET,
  });
}

function sendMessage(
  socket: WSContext,
  type: any,
  payload: any,
  options: { dropIfClosed?: boolean } = {}
) {
  // const send = socket.send;
  const message = JSON.stringify({ type, payload });
  // socket.send = (m) => {
  //   // logger.logMessage('sent', { type, payload });
  //   socket.send = send;
  //   return socket.send(m);
  // };
  if (socket.readyState === WebSocket.OPEN) {
    logger.logMessage('sent', { type, payload });
    socket.send(message);
  }
  // else if (!options.dropIfClosed) {
  //   // I think this is unlikely to be hit, but just in case the socket isnt opened yet, queue messages
  //   const send = () => {
  //     socket.send(message);
  //     socket.removeEventListener('open', send);
  //   };
  //   socket.addEventListener('open', send);
  // }
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
