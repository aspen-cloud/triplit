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

// This works for now, fine to refactor in any way if needed
export async function withServer(
  options: { port: number; serverOptions?: ServerOptions },
  callback: (server: any) => void | Promise<void>
) {
  const { port, serverOptions } = options;
  const server = await runServer(port, serverOptions);
  try {
    await callback(server);
  } finally {
    await new Promise<void>((res) => server.close(res));
  }
}
