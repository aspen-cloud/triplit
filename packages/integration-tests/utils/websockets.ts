import { TestFunction, vi } from 'vitest';

export function withWebsocketStub(
  testFn: TestFunction<{ openSockets: Set<WebSocket> }>
): TestFunction<{ openSockets: Set<WebSocket> }> {
  return async (ctx) => {
    const OriginalWebSocket = globalThis.WebSocket;
    const openSockets = new Set<WebSocket>();

    class StubWebSocket extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        openSockets.add(this);
        this.addEventListener('close', () => openSockets.delete(this));
      }
    }

    vi.stubGlobal('WebSocket', StubWebSocket);

    try {
      await testFn({ ...ctx, openSockets });
    } finally {
      // Cleanup stub on success or failure
      vi.stubGlobal('WebSocket', OriginalWebSocket);
    }
  };
}
