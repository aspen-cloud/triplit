import WS, { WebSocketServer } from 'ws';
import express from 'express';
import { DB, DBConfig, DurableClock, TriplitError } from '@triplit/db';
import { MemoryBTreeStorage as MemoryStorage } from '@triplit/db/storage/memory-btree';
import { SQLiteTupleStorage as SqliteStorage } from '@triplit/db/storage/sqlite';
import {
  MalformedMessagePayloadError,
  RateLimitExceededError,
} from '@triplit/server-core/errors';
import cors from 'cors';
import { useHttpToken, readWSToken } from './middleware/token-reader.js';
import { rateLimiterMiddlewareWs } from './middleware/rate-limiter.js';
import url from 'url';
import sqlite from 'better-sqlite3';
import {
  Server as TriplitServer,
  ServerCloseReason,
  ClientSyncMessage,
  ParseResult,
  ParsedToken,
} from '@triplit/server-core';
import { parseAndValidateToken } from '@triplit/server-core/token';
import { logger } from './logger.js';
import { Route } from '@triplit/server-core/triplit-server';
import path from 'path';
import multer from 'multer';

const upload = multer();
// ESM override for __dirname
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

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

// Set up database

function setupSqliteStorage() {
  const dbPath = process.env.LOCAL_DATABASE_URL || __dirname + '/app.db';
  const db = sqlite(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = memory;
    PRAGMA mmap_size = 30000000000;
  `);
  return new SqliteStorage(db);
}

export type ServerOptions = {
  storage?: 'sqlite' | 'memory';
  dbOptions?: DBConfig<any>;
  watchMode?: boolean;
  verboseLogs?: boolean;
};

export function createServer(options?: ServerOptions) {
  const dbSource =
    options?.storage === 'sqlite' ? setupSqliteStorage() : new MemoryStorage();
  if (options?.verboseLogs) logger.verbose = true;
  const triplitServers = new Map<string, TriplitServer>();

  function getServer(projectId: string) {
    if (triplitServers.has(projectId)) return triplitServers.get(projectId)!;
    const server = new TriplitServer(
      new DB({
        source: dbSource,
        tenantId: projectId,
        clock: new DurableClock(),
        ...(options?.dbOptions ?? {}),
      })
    );
    triplitServers.set(projectId, server);
    return server;
  }

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const start = new Date();
    let send = res.send;
    res.send = (c) => {
      const end = new Date();
      let body = c;
      try {
        body = JSON.parse(c);
      } catch (e) {}
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
    const session = socket.session;

    session!.addListener((messageType, payload) => {
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

      // Assign for usage in catch
      const overLimit = !(await rateLimiterMiddlewareWs(socket));
      if (overLimit) {
        return sendErrorMessage(
          socket,
          parsedMessage,
          new RateLimitExceededError()
        );
      }
      logger.logMessage('received', parsedMessage);
      session!.dispatchCommand(parsedMessage!);
    });

    socket.on('close', (code, reason) => {
      session!.close();
      // Should this use the closeSocket function?
      socket.close(code, reason);
    });

    socket.on('error', (err) => {
      closeSocket(socket, { type: 'INTERNAL_ERROR', retry: false }, 1011);
    });

    sendMessage(socket, 'TRIPLES_REQUEST', {});
  });

  app.use(cors({ origin: true }));

  const authenticated = express.Router();
  authenticated.use(useHttpToken);
  // app.use(rateLimiterMiddleware);
  const triplitServer = getServer(process.env.PROJECT_ID!);

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
    // let body = '';
    // req.on('data', (chunk) => {
    //   body += chunk.toString();
    // });
    // req.on('end', async () => {
    //   try {
    //     console.log(body);
    //     body.split;
    //     const parsed = JSON.parse(body);
    //     await triplitServer.handleRequest(
    //       ['bulk-insert'],
    //       parsed['triples'],
    //       req.token!
    //     );
    //     return res.sendStatus(200);
    //   } catch (e) {
    //     console.error(e);
    //     return res.sendStatus(500);
    //   }
    // });
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
      process.env.JWT_SECRET!,
      process.env.PROJECT_ID!,
      {
        payloadPath: process.env.CLAIMS_PATH,
        externalSecret: process.env.EXTERNAL_JWT_SECRET,
      }
    );
    if (error) {
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

  wss.on('error', (err) => {
    console.log(err);
  });
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return function startServer(port: number, onOpen?: (() => void) | undefined) {
    const server = app.listen(port, onOpen);

    server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, async (socket) => {
        let token: ParsedToken | undefined = undefined;
        try {
          const tokenRes = await readWSToken(request);
          if (tokenRes.error) throw tokenRes.error;
          token = tokenRes.data;
        } catch (e) {
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
            const server = getServer(process.env.PROJECT_ID!);
            const connection = server.openConnection(token!, {
              clientId,
              clientSchemaHash: clientHash,
              syncSchema,
            });
            // @ts-expect-error
            socket.session = connection;
            const schemaIncombaitility =
              await connection.isClientSchemaCompatible();
            if (schemaIncombaitility) {
              schemaIncombaitility.retry = !!options?.watchMode;
              closeSocket(socket, schemaIncombaitility, 1008);
              return;
            }
          }
        } catch (e) {
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
