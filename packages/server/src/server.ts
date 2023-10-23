import WS, { WebSocketServer } from 'ws';
import express from 'express';
import { DB, TriplitError, MemoryStorage, SqliteStorage } from '@triplit/db';
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

type ServerOptions = {
  storage?: 'sqlite' | 'memory';
};

export function createServer(options?: ServerOptions) {
  const dbSource =
    options?.storage === 'sqlite' ? setupSqliteStorage() : new MemoryStorage();

  const triplitServers = new Map<string, Server>();

  function getServer(token: ParsedToken) {
    const projectId = token.projectId;
    if (triplitServers.has(projectId)) return triplitServers.get(projectId)!;
    const server = new Server(
      new DB({
        source: dbSource,
        tenantId: projectId,
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
  app.use(useHttpToken);

  // app.use(rateLimiterMiddleware);

  app.post('/queryTriples', async (req, res) => {
    const server = getServer(req.token!);
    const { statusCode, payload } = await server.queryTriples(req.body);
    res.json(payload).status(statusCode);
  });

  app.post('/clear', async (req, res) => {
    const server = getServer(req.token!);
    const { statusCode, payload } = await server.clearDB(req.body, req.token!);
    res.json(payload).status(statusCode);
  });

  app.get('/migration/status', async (req, res) => {
    const server = getServer(req.token!);
    const { statusCode, payload } = await server.getMigrationStatus(req.token!);
    res.json(payload).status(statusCode);
  });

  app.post('/migration/apply', async (req, res) => {
    const server = getServer(req.token!);
    const { statusCode, payload } = await server.applyMigration(
      req.body,
      req.token
    );
    res.json(payload).status(statusCode);
  });

  app.get('/stats', async (req, res) => {
    const server = getServer(req.token!);
    const { statusCode, payload } = await server.getCollectionStats(req.token!);
    res.json(payload).status(statusCode);
  });

  app.get('/schema', async (req, res) => {
    const server = getServer(req.token!);
    const { statusCode, payload } = await server.getSchema({}, req.token!);
    res.json(payload).status(statusCode);
  });

  wss.on('error', (err) => {
    console.log('error', err);
  });
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return function startServer(
    port: number,
    callback?: (() => void) | undefined
  ) {
    const server = app.listen(port, callback);

    server.on('upgrade', (request, socket, head) => {
      readWSToken(request).then(({ data: token, error }) => {
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
              const server = getServer(token);
              const session = await server.getSession(
                clientId,
                token,
                clientHash,
                syncSchema
              );
              // @ts-ignore
              socket.session = session;
              const schemaIncombaitility =
                await session.isClientSchemaCompatible();
              if (schemaIncombaitility) {
                socket.close(
                  schemaIncombaitility.code,
                  JSON.stringify(schemaIncombaitility.metadata)
                );
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
