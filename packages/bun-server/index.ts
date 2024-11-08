import { createBunWebSocket } from 'hono/bun';
import { createTriplitHonoServer } from '@triplit/server';

const { upgradeWebSocket, websocket } = createBunWebSocket();

const honoServer = createTriplitHonoServer(
  { storage: 'bun-sqlite' },
  upgradeWebSocket
);

const port = +(process.env.PORT || 8080);

const bunServer = Bun.serve({
  fetch: honoServer.fetch,
  websocket,
  port,
});

console.log(`Listening on http://localhost:${bunServer.port} ...`);
