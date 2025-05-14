import { createTriplitHonoServer } from './hono.js';
import { createBunWebSocket } from 'hono/bun';

export async function createBunServer(
  options: Parameters<typeof createTriplitHonoServer>[0]
) {
  if (typeof Bun === 'undefined') {
    throw new Error(
      'No Bun environment detected. Please run this in a Bun environment. Provide the --bun flag if necessary.'
    );
  }

  const { upgradeWebSocket, websocket } = createBunWebSocket();
  const { fetch } = await createTriplitHonoServer(options, upgradeWebSocket);

  return function startServer(port: number, onOpen?: (() => void) | undefined) {
    const server = Bun.serve({
      fetch,
      websocket,
      port,
    });
    onOpen && onOpen();
    return {
      close: (onClose?: () => void) => {
        server.stop();
        onClose && onClose();
      },
    };
  };
}
