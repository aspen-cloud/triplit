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
import { Server } from '@triplit/server-core';
import {
  ClientSyncMessage,
  ParseResult,
  ParsedToken,
} from '@triplit/types/sync';
import { parseAndValidateToken } from '@triplit/server-core/token';

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
};

export function createServer(options?: ServerOptions) {
  const dbSource =
    options?.storage === 'sqlite' ? setupSqliteStorage() : new MemoryStorage();

  const triplitServers = new Map<string, Server>();

  function getServer(projectId: string) {
    if (triplitServers.has(projectId)) return triplitServers.get(projectId)!;
    const server = new Server(
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

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: true,
  });

  const heartbeatInterval = setInterval(function ping() {
    // @ts-ignore
    wss.clients.forEach(function each(ws: WS.WebSocket) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  function sendMessage(socket: WS.WebSocket, type: string, payload: any) {
    const message = JSON.stringify({ type, payload });
    if (socket.readyState === WS.OPEN) {
      socket.send(message);
    } else {
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
      session!.dispatchCommand(parsedMessage!);
    });

    socket.on('close', (code, reason) => {
      session!.close();
      socket.close(code, reason);
    });

    socket.on('error', (err) => {
      console.log('error', err);
    });

    sendMessage(socket, 'TRIPLES_REQUEST', {});
  });

  app.use(cors({ origin: true }));

  const authenticated = express.Router();
  authenticated.use(useHttpToken);

  // app.use(rateLimiterMiddleware);

  authenticated.post('/queryTriples', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.queryTriples(req.body);
    res.status(statusCode).json(payload);
  });

  authenticated.post('/clear', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.clearDB(req.body);
    res.status(statusCode).json(payload);
  });

  authenticated.get('/migration/status', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.getMigrationStatus();
    res.status(statusCode).json(payload);
  });

  authenticated.post('/migration/apply', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.applyMigration(req.body);
    res.status(statusCode).json(payload);
  });

  authenticated.get('/stats', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.getCollectionStats();
    res.status(statusCode).json(payload);
  });

  authenticated.get('/schema', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.getSchema(req.query);
    res.status(statusCode).json(payload);
  });

  authenticated.post('/fetch', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { query } = req.body;
    const { statusCode, payload } = await session.fetch(query);
    res.status(statusCode).json(payload);
  });

  authenticated.post('/insert', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { collectionName, entity } = req.body;
    const { statusCode, payload } = await session.insert(
      collectionName,
      entity
    );
    res.status(statusCode).json(payload);
  });

  authenticated.post('/bulk-insert', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { statusCode, payload } = await session.bulkInsert(req.body);
    res.status(statusCode).json(payload);
  });

  authenticated.post('/update', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { collectionName, entityId, patches } = req.body;
    const { statusCode, payload } = await session.update(
      collectionName,
      entityId,
      patches
    );
    res.status(statusCode).json(payload);
  });

  authenticated.post('/delete', async (req, res) => {
    const server = getServer(process.env.PROJECT_ID!);
    const session = server.createSession(req.token!);
    const { collectionName, entityId } = req.body;
    const { statusCode, payload } = await session.delete(
      collectionName,
      entityId
    );
    res.status(statusCode).json(payload);
  });

  authenticated.post('/message', async (req, res) => {
    try {
      const server = getServer(process.env.PROJECT_ID!);
      const { message, options } = req.body;
      const { clientId } = options;
      const session = server.getConnection(clientId);
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

  // set up a server sent event stream
  app.get('/message-events', async (req, res) => {
    // Can't set headers with EventSource, check query params
    const { schema, client, syncSchema, token: rawToken } = req.query;
    const { data: token, error } = await parseAndValidateToken(
      rawToken as string,
      process.env.JWT_SECRET!,
      process.env.PROJECT_ID!,
      { payloadPath: process.env.CLAIMS_PATH! }
    );
    if (error) {
      console.error(error);
      return res.sendStatus(401);
    }
    const server = getServer(process.env.PROJECT_ID!);

    const connection = server.openConnection(token, {
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
    console.log('error', err);
  });
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return function startServer(port: number, onOpen?: (() => void) | undefined) {
    const server = app.listen(port, onOpen);

    server.on('upgrade', (request, socket, head) => {
      readWSToken(request)
        .then(({ data: token, error }) => {
          if (!token || error) {
            console.error(error);
            // TODO: Send 401?
            socket.end();
            return;
          }

          wss.handleUpgrade(request, socket, head, async (socket) => {
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
                // @ts-ignore
                socket.session = connection;
                const schemaIncombaitility =
                  await connection.isClientSchemaCompatible();
                if (schemaIncombaitility) {
                  schemaIncombaitility.retry = !!options?.watchMode;
                  socket.close(1008, JSON.stringify(schemaIncombaitility));
                  return;
                }
              }
            } catch (e) {
              console.error(e);
              // TODO: send info about the error back to the server, at least if its a TriplitError
              socket.close(
                1008,
                JSON.stringify({ type: 'INTERNAL_ERROR', retry: false })
              );
              return;
            }

            wss.emit('connection', socket, request);
          });
        })
        .catch((e) => {
          console.error(e);
          socket.end();
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
