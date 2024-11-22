import { createBunWebSocket } from 'hono/bun';
import { createTriplitHonoServer } from '@triplit/server';

const { upgradeWebSocket, websocket } = createBunWebSocket();

const honoServer = createTriplitHonoServer(
  {
    storage: 'bun-sqlite',
    jwtSecret: process.env.JWT_SECRET!,
    externalJwtSecret: process.env.EXTERNAL_JWT_SECRET,
    projectId: process.env.PROJECT_ID!,
    dbOptions:
      process.env.ENTITY_CACHE_ENABLED! === 'true'
        ? {
            experimental: {
              entityCache: {
                capacity: process.env.ENTITY_CACHE_CAPACITY
                  ? parseInt(process.env.ENTITY_CACHE_CAPACITY)
                  : 100000,
              },
            },
          }
        : {},
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
