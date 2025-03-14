import { createServer } from '@triplit/server';
import { ServerOptions } from '@triplit/server/hono';

export async function runServer(
  port: number,
  options?: Partial<ServerOptions>
) {
  let server: ReturnType<typeof startServer>;
  const startServer = await createServer({
    storage: 'memory',
    ...(options ?? {}),
    jwtSecret: process.env.JWT_SECRET!,
    externalJwtSecret: process.env.EXTERNAL_JWT_SECRET,
    logHandler: options?.logHandler ?? {
      log: () => {},
      startSpan: () => {},
      endSpan: () => {},
      recordMetric: () => {},
    },
  });
  await new Promise<void>((res) => {
    server = startServer(port, res);
  });
  // @ts-expect-error
  return server;
}

const usedPorts = new Set<number>();

export async function tempTriplitServer(
  options: {
    serverOptions?: Partial<ServerOptions>;
  } = {}
) {
  const { serverOptions } = options;
  let randomPort = Math.floor(Math.random() * 1000) + 3000;
  while (usedPorts.has(randomPort)) {
    randomPort++;
  }
  const server = await runServer(randomPort, serverOptions);
  return {
    port: randomPort,
    [Symbol.dispose]: () => {
      server.close();
      usedPorts.delete(randomPort);
    },
  };
}
