import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { createTriplitHonoServer } from '@triplit/server';

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const honoServer = createTriplitHonoServer(
  // { storage: 'bun-sqlite' },
  { storage: 'memory' },
  upgradeWebSocket
);
type WSHandler = WebSocketHandler<any>;

const port = +(process.env.PORT || 8080);

const bunServer = Bun.serve({
  fetch: honoServer.fetch,
  websocket: websocket as WSHandler,
  port,
});

console.log(`Listening on http://localhost:${bunServer.port} ...`);
