import { DB, DurableClock, TriplitError } from '@triplit/db';
import {
  MalformedMessagePayloadError,
  Route,
  Server as TriplitServer,
} from '@triplit/server-core';
import {
  ServerCloseReason,
  ParseResult,
  ClientSyncMessage,
} from '@triplit/types/sync.js';
import DurableObjectStore from '@triplit/db/storage/durable-object-tuple-store';

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  TRIPLIT_DB: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
  //
  // Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
  // MY_QUEUE: Queue;

  // SECRET
  JWT_SECRET: string;
}
// @ts-ignore
import { schema } from '@/schema';
import { parseAndValidateToken, ProjectJWT } from '@triplit/server-core/token';

export default {
  /**
   * This will mostly just pass request to Triplit Durable Object
   * but also can be where you serve static assets or do any basic
   * rendering at the "edge"
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const dbWorkerId = env.TRIPLIT_DB.idFromName('default-db');

    const dbWorker = env.TRIPLIT_DB.get(dbWorkerId);
    return dbWorker.fetch(request);
  },
};

export class TriplitDurableObject implements DurableObject {
  db: any;
  triplitServer: TriplitServer;
  constructor(readonly state: DurableObjectState, readonly env: Env) {
    this.db = new DB({
      schema: { collections: schema },
      clock: new DurableClock(),
      source: new DurableObjectStore(state.storage),
      tenantId: 'server',
    });
    this.triplitServer = new TriplitServer(this.db);
  }

  async fetch(request: Request): Promise<Response> {
    const projectId = request.headers.get('x-triplit-project-id')!;
    const xTriplitToken = request.headers.get('x-triplit-token');
    const jwt_secret = request.headers.get('x-triplit-jwt-secret');
    const external_jwt_path =
      request.headers.get('x-triplit-external-jwt-path') ?? undefined;
    const external_jwt_secret =
      request.headers.get('x-triplit-external-jwt-secret') ?? undefined;
    const upgradeHeader = request.headers.get('Upgrade');

    const { data: token, error } = await parseAndValidateToken(
      xTriplitToken,
      jwt_secret,
      projectId,
      {
        payloadPath: external_jwt_path,
        externalSecret: external_jwt_secret,
      }
    );
    if (error) {
      if (upgradeHeader === 'websocket') {
        return handleWebSocketUpgradeFailure(error.toString());
      }
      return new Response(error.toString(), { status: error.status });
    }
    if (upgradeHeader === 'websocket') {
      return this.handleWebSocketUpgrade(request, token);
    }
    if (request.method === 'POST') {
      let path = new URL(request.url).pathname.slice(1).split('/');
      let body;
      if (path[0] === 'bulk-insert-file') {
        path = ['bulk-insert'];
        body = await request.formData();
        if (body.has('data')) body = JSON.parse(body.get('data') as string);
        else {
          return new Response('No data provided for file upload', {
            status: 400,
          });
        }
      } else {
        body = await parseBodyIfExists(request);
      }
      const { statusCode, payload } = await this.triplitServer.handleRequest(
        path as Route,
        body,
        token
      );
      return new Response(JSON.stringify(payload), {
        status: statusCode,
        headers: {
          'content-type': 'application/json;charset=UTF-8',
        },
      });
    }
    return new Response('Hello world from Triplit Cloud V2');
  }

  async handleWebSocketUpgrade(
    request: Request,
    token: ProjectJWT
  ): Promise<Response> {
    const url = new URL(request.url);
    const clientId = url.searchParams.get('client')!;
    const clientSchemaHashString = url.searchParams.get('schema')!;
    const clientSchemaHash = clientSchemaHashString
      ? parseInt(clientSchemaHashString)
      : undefined;
    const syncSchema = url.searchParams.get('sync-schema') === 'true';
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const response = new Response(null, {
      status: 101,
      // @ts-ignore
      webSocket: client,
    });

    server.accept();

    const syncConnection = this.triplitServer.openConnection(token, {
      clientSchemaHash,
      clientId,
      syncSchema,
    });

    const unsubscribeMessageListener = syncConnection.addListener(
      (messageType, payload) => {
        sendMessage(server, messageType, payload);
      }
    );

    server.addEventListener('message', async (message) => {
      const { data: parsedMessage, error } = parseClientMessage(message);
      if (error)
        return sendErrorMessage(
          server,
          undefined,
          new MalformedMessagePayloadError(),
          {
            message,
          }
        );
      syncConnection.dispatchCommand(parsedMessage);
    });
    let errorHandler = (evt: ErrorEvent) => {
      // This is what will fire if, for example, platform limitations are hit like message size
      // Unfortunately the returned error (at least in wrangler) is not descriptive at all
      closeSocket(
        server,
        { type: 'INTERNAL_ERROR', retry: false, message: evt?.error?.message },
        1011
      );
      syncConnection.close();
      unsubscribeMessageListener();
    };
    let closeHandler = (evt: CloseEvent) => {
      // For now echo back code and reason
      // Should this use the closeSocket function?
      server.close(evt.code, evt.reason);
      syncConnection.close();
      unsubscribeMessageListener();
    };
    server.addEventListener('close', closeHandler);
    server.addEventListener('error', errorHandler);

    return response;
  }
}

function handleWebSocketUpgradeFailure(reason: string): Response {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);
  server.accept();
  const response = new Response(null, {
    status: 101,
    // @ts-ignore
    webSocket: client,
  });
  closeSocket(
    server,
    {
      type: 'UNAUTHORIZED',
      retry: false,
      message: reason,
    },
    1008
  );
  return response;
}

function closeSocket(
  socket: WebSocket,
  reason: ServerCloseReason,
  code?: number
) {
  // Send message informing client of upcoming close, may include message containing reason
  sendMessage(socket, 'CLOSE', reason);
  // Close connection
  // Close payload must remain under 125 bytes
  socket.close(
    code,
    JSON.stringify({ type: reason.type, retry: reason.retry })
  );
}

function parseClientMessage(
  message: MessageEvent
): ParseResult<ClientSyncMessage> {
  // TODO: do more validation here
  try {
    const parsedMessage = JSON.parse(message.data as string);
    return { data: parsedMessage, error: undefined };
  } catch (e) {
    return { data: undefined, error: e as Error };
  }
}

function sendMessage(socket: WebSocket, type: string, payload: any) {
  const message = JSON.stringify({ type, payload });
  socket.send(message);
}

function sendErrorMessage(
  socket: WebSocket,
  originalMessage: ClientSyncMessage | undefined, // message is undefined if we cannot parse it,
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

export async function parseBodyIfExists(request: Request) {
  try {
    return await request.json();
  } catch (e) {
    return undefined;
  }
}
