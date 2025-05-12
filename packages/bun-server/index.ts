import { createBunWebSocket } from 'hono/bun';
import { createTriplitHonoServer } from '@triplit/server/hono';
const { upgradeWebSocket, websocket } = createBunWebSocket();

const honoServer = await createTriplitHonoServer(
  {
    storage: 'sqlite',
    verboseLogs: !!process.env.VERBOSE_LOGS,
    jwtSecret: process.env.JWT_SECRET!,
    projectId: process.env.PROJECT_ID,
    externalJwtSecret: process.env.EXTERNAL_JWT_SECRET,
    maxPayloadMb: process.env.MAX_BODY_SIZE,
  },
  upgradeWebSocket
);

const port = +(process.env.PORT || 8080);

const bunServer = Bun.serve({
  fetch: honoServer.fetch,
  websocket,
  port,
});

console.log(`Listening on http://localhost:${bunServer.port} ...`);
