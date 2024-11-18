import { ServerOptions } from '../../server/src/server.js';
import { createServer } from '@triplit/server';

export async function runServer(port: number, options?: ServerOptions) {
  let server: ReturnType<typeof startServer>;
  const startServer = createServer({ storage: 'memory', ...(options ?? {}) });
  await new Promise<void>((res) => {
    server = startServer(port, res);
  });
  // @ts-expect-error
  return server;
}

const usedPorts = new Set<number>();

export async function tempTriplitServer(
  options: {
    serverOptions?: ServerOptions;
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
