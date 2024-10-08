import WS, { WebSocketServer } from 'ws';
import express from 'express';
import { DB, DBConfig, DurableClock, Storage, TriplitError } from '@triplit/db';
import {
  MalformedMessagePayloadError,
  RateLimitExceededError,
} from '@triplit/server-core/errors';
import cors from 'cors';
import { useHttpToken, readWSToken } from './middleware/token-reader.js';
import url from 'url';
import {
  Server as TriplitServer,
  ServerCloseReason,
  ClientSyncMessage,
  ParseResult,
  SyncConnection,
} from '@triplit/server-core';
import { parseAndValidateToken, ProjectJWT } from '@triplit/server-core/token';
import { logger } from './logger.js';
import { Route } from '@triplit/server-core/triplit-server';
import multer from 'multer';
import * as Sentry from '@sentry/node';
import {
  StoreKeys,
  defaultArrayStorage,
  defaultBTreeStorage,
  defaultFileStorage,
  defaultLMDBStorage,
  defaultLevelDBStorage,
  defaultMemoryStorage,
  defaultSQLiteStorage,
} from './storage.js';
import path from 'path';
import { createRequire } from 'module';
import { TriplitClient } from '@triplit/client';
import PublicRouter from './routes/public.js';

const upload = multer();

function parseClientMessage(
  message: WS.RawData
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
function initSentry() {
  if (process.env.SENTRY_DSN) {
    // Warning: this is not bundler friendly
    // Adding this with node 22 dropping support for assert (https://v8.dev/features/import-attributes#deprecation-and-eventual-removal-of-assert), preferring 'with'
    // Issue: https://github.com/nodejs/node/issues/51622
    // TODO: properly import package.json so in a way that works with bundlers, typescript, and all versions of node
    // You may also need to upgrade typescript to support 'with' syntax
    const require = createRequire(import.meta.url);
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const packageDotJson = require(path.join(__dirname, '../package.json'));
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: packageDotJson.version,
    });
  }
}

function captureException(e: any) {
  if (Sentry.isInitialized() && e instanceof Error) {
    Sentry.captureException(e);
  }
}

function resolveStorageStringOption(storage: StoreKeys): Storage {
  switch (storage) {
    case 'file':
      return defaultFileStorage();
    case 'leveldb':
      return defaultLevelDBStorage();
    case 'lmdb':
      return defaultLMDBStorage();
    case 'memory':
      return defaultMemoryStorage();
    case 'memory-array':
      return defaultBTreeStorage();
    case 'memory-btree':
      return defaultArrayStorage();
    case 'sqlite':
      return defaultSQLiteStorage();
    default:
      throw new TriplitError(`Invalid storage option: ${storage}`);
  }
}

export function createServer(options?: ServerOptions) {
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
  const triplitServers = new Map<string, TriplitServer>();

  function getServer(projectId: string, upstream?: ServerOptions['upstream']) {
    if (triplitServers.has(projectId)) return triplitServers.get(projectId)!;
    const db = upstream
      ? new TriplitClient({
          clientId: projectId,
          serverUrl: upstream.url,
          token: upstream.token,
          syncSchema: true,
          skipRules: false,
        })
      : new DB({
          source: dbSource,
          tenantId: projectId,
          clock: new DurableClock(),
          ...(options?.dbOptions ?? {}),
        });
    // @ts-expect-error
    const server = new TriplitServer(db);
    triplitServers.set(projectId, server);
    return server;
  }
  initSentry();
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const start = new Date();
    let send = res.send;
    res.send = (c) => {
      const end = new Date();
      let body = c;
      const resWithBody = {
        ...res,
        body,
      };
      logger.logRequestAndResponse(
        req,
        resWithBody,
        end.getTime() - start.getTime()
      );
      res.send = send;
      return res.send(c);
    };
    next();
  });

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: true,
  });

  const heartbeatInterval = setInterval(function ping() {
    // @ts-expect-error
    wss.clients.forEach(function each(ws: WS.WebSocket) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  function sendMessage(
    socket: WS.WebSocket,
    type: string,
    payload: any,
    options: { dropIfClosed?: boolean } = {}
  ) {
    const send = socket.send;
    const message = JSON.stringify({ type, payload });
    socket.send = (m) => {
      // @ts-expect-error
      logger.logMessage('sent', { type, payload });
      socket.send = send;
      return socket.send(m);
    };
    if (socket.readyState === WS.OPEN) {
      socket.send(message);
    } else if (!options.dropIfClosed) {
      // I think this is unlikely to be hit, but just in case the socket isnt opened yet, queue messages
      const send = () => {
        socket.send(message);
        socket.removeEventListener('open', send);
      };
      socket.addEventListener('open', send);
    }
  }

  function sendErrorMessage(
    socket: WS.WebSocket,
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

  function closeSocket(socket: WS, reason: ServerCloseReason, code?: number) {
    // Send message informing client of upcoming close, may include message containing reason
    // @ts-expect-error
    sendMessage(socket, 'CLOSE', reason, { dropIfClosed: true });
    // Close connection
    // Close payload must remain under 125 bytes
    socket.close(
      code,
      JSON.stringify({ type: reason.type, retry: reason.retry })
    );
  }

  wss.on('connection', async (socket: WS.WebSocket) => {
    const syncConnection = socket.syncConnection;

    syncConnection!.addListener((messageType, payload) => {
      sendMessage(socket, messageType, payload);
    });

    socket.isAlive = true;
    socket.on('pong', function heartbeat() {
      socket.isAlive = true;
    });

    socket.on('message', async (message: WS.RawData) => {
      const { data: parsedMessage, error } = parseClientMessage(message);
      if (error)
        return sendErrorMessage(
          socket,
          undefined,
          new MalformedMessagePayloadError(),
          {
            message,
          }
        );

      logger.logMessage('received', parsedMessage);
      syncConnection!.dispatchCommand(parsedMessage!);
    });

    socket.on('close', (code, reason) => {
      if (!socket.syncConnection) return;

      const triplitServer = getServer(
        process.env.PROJECT_ID!,
        options?.upstream
      );
      triplitServer.closeConnection(socket.syncConnection.options.clientId);

      // Should this use the closeSocket function?
      socket.close(code, reason);
    });

    socket.on('error', (err) => {
      captureException(err);
      closeSocket(socket, { type: 'INTERNAL_ERROR', retry: false }, 1011);
    });

    sendMessage(socket, 'TRIPLES_REQUEST', {});
  });

  app.use(cors({ origin: true }));

  app.use(PublicRouter);

  const authenticated = express.Router();
  authenticated.use(useHttpToken);
  // app.use(rateLimiterMiddleware);
  const triplitServer = getServer(process.env.PROJECT_ID!, options?.upstream);

  authenticated.post('/message', async (req, res) => {
    try {
      const { message, options } = req.body;
      const { clientId } = options;
      const session = triplitServer.getConnection(clientId);
      if (!session) {
        throw new Error('NO CONNECTION OPEN!');
      }
      await session.dispatchCommand(message);
      return res.sendStatus(200);
    } catch (e) {
      console.error(e);
      captureException(e);
      return res.sendStatus(500);
    }
  });
  authenticated.post('/bulk-insert-file', upload.none(), async (req, res) => {
    const jsonBody = JSON.parse(req.body.data);
    const { statusCode, payload } = await triplitServer.handleRequest(
      ['bulk-insert'],
      jsonBody,
      req.token!
    );
    res.status(statusCode).json(payload);
  });
  authenticated.post('*', async (req, res) => {
    const path = req.path.split('/').slice(1) as Route; // ignore first empty string from split
    const { statusCode, payload } = await triplitServer.handleRequest(
      path,
      req.body,
      req.token!
    );
    res.status(statusCode).json(payload);
  });

  // set up a server sent event stream
  app.get('/message-events', async (req, res) => {
    // Can't set headers with EventSource, check query params
    const { schema, client, syncSchema, token: rawToken } = req.query;
    const { data: token, error } = await parseAndValidateToken(
      rawToken as string,
      process.env.JWT_SECRET,
      process.env.PROJECT_ID,
      {
        payloadPath: process.env.CLAIMS_PATH,
        externalSecret: process.env.EXTERNAL_JWT_SECRET,
      }
    );
    if (error) {
      captureException(error);
      return res.sendStatus(401);
    }

    const connection = triplitServer.openConnection(token, {
      clientId: client as string,
      clientSchemaHash: schema ? parseInt(schema as string) : undefined,
      syncSchema: syncSchema === 'true',
    });

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    let unsubscribe: (() => void) | undefined = undefined;
    // If client closes connection, stop sending events
    res.on('close', () => {
      unsubscribe?.();
      res.end();
    });

    const schemaIncombaitility = await connection.isClientSchemaCompatible();
    if (schemaIncombaitility) {
      res.write(
        `data: ${JSON.stringify({
          type: 'CLOSE',
          payload: schemaIncombaitility,
        })}\n\n`
      );
      return;
    }

    unsubscribe = connection.addListener((messageType, payload) => {
      res.write(`data: ${JSON.stringify({ type: messageType, payload })}\n\n`);
    });

    return;
  });

  app.use('/', authenticated);

  app.on('error', (err) => {
    console.error(err);
    captureException(err);
  });

  wss.on('error', (err) => {
    console.error(err);
    captureException(err);
  });
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return function startServer(port: number, onOpen?: (() => void) | undefined) {
    const server = app.listen(port, onOpen);

    server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, async (socket) => {
        let token: ProjectJWT | undefined = undefined;
        try {
          const tokenRes = await readWSToken(request);
          if (tokenRes.error) throw tokenRes.error;
          token = tokenRes.data;
        } catch (e) {
          captureException(e);
          closeSocket(
            socket,
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
          if (request.url) {
            const parsedUrl = url.parse(request.url!, true);
            const clientId = parsedUrl.query.client as string;
            const clientHash = parsedUrl.query.schema
              ? parseInt(parsedUrl.query.schema as string)
              : undefined;
            const syncSchema = parsedUrl.query['sync-schema'] === 'true';
            const server = getServer(
              process.env.PROJECT_ID!,
              options?.upstream
            );
            const connection = server.openConnection(token!, {
              clientId,
              clientSchemaHash: clientHash,
              syncSchema,
            });
            (socket as WS.WebSocket).syncConnection = connection;
            const schemaIncombaitility =
              await connection.isClientSchemaCompatible();
            if (schemaIncombaitility) {
              schemaIncombaitility.retry = !!options?.watchMode;
              closeSocket(socket, schemaIncombaitility, 1008);
              return;
            }
          }
        } catch (e) {
          console.error(e);
          captureException(e);
          closeSocket(
            socket,
            {
              type: 'INTERNAL_ERROR',
              retry: false,
              message: e instanceof Error ? e.message : undefined,
            },
            1011
          );
          return;
        }

        wss.emit('connection', socket, request);
      });
    });

    return {
      close: (onClose?: () => void) => {
        wss.clients.forEach((socket) => socket.terminate());
        server.close();
        onClose && onClose();
      },
    };
  };
}
