// Modified from Hono Source https://github.com/honojs/hono/blob/main/src/adapter/cloudflare-workers/websocket.ts

import {
  defineWebSocketHelper,
  UpgradeWebSocket,
  WSContext,
  WSEvents,
  WSReadyState,
} from 'hono/ws';

// Based on https://github.com/honojs/hono/issues/1153#issuecomment-1767321332
export const upgradeWebSocket: UpgradeWebSocket<
  WebSocket,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Omit<WSEvents<WebSocket>, 'onOpen'>
> = defineWebSocketHelper(async (c, events) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return;
  }

  // @ts-expect-error WebSocketPair is not typed
  const webSocketPair = new WebSocketPair();
  const client: any = webSocketPair[0];
  const server: any = webSocketPair[1];

  const wsContext = new WSContext<WebSocket>({
    close: (code, reason) => server.close(code, reason),
    get protocol() {
      return server.protocol;
    },
    raw: server,
    get readyState() {
      return server.readyState as WSReadyState;
    },
    url: server.url ? new URL(server.url) : null,
    send: (source) => server.send(source),
  });

  // note: cloudflare workers doesn't support 'open' event

  if (events.onClose) {
    // CloseEvent not typed
    server.addEventListener('close', (evt: any) =>
      events.onClose?.(evt, wsContext)
    );
  }
  if (events.onMessage) {
    server.addEventListener('message', (evt: MessageEvent) =>
      events.onMessage?.(evt, wsContext)
    );
  }
  if (events.onError) {
    server.addEventListener('error', (evt: Event) =>
      events.onError?.(evt, wsContext)
    );
  }

  server.accept?.();

  if (events.onOpen) {
    events.onOpen(new Event('open'), wsContext);
  }

  return new Response(null, {
    status: 101,
    // @ts-expect-error - webSocket is not typed
    webSocket: client,
  });
});

export function upgradeWebSocketHibernation(
  ctx: any
): UpgradeWebSocket<WebSocket, any, Omit<WSEvents<WebSocket>, 'onOpen'>> {
  return defineWebSocketHelper(async (c, events) => {
    const upgradeHeader = c.req.header('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return;
    }

    // @ts-expect-error WebSocketPair is not typed
    const webSocketPair = new WebSocketPair();
    const client: any = webSocketPair[0];
    const server: any = webSocketPair[1];

    const wsContext = new WSContext<WebSocket>({
      close: (code, reason) => server.close(code, reason),
      get protocol() {
        return server.protocol;
      },
      raw: server,
      get readyState() {
        return server.readyState as WSReadyState;
      },
      url: server.url ? new URL(server.url) : null,
      send: (source) => server.send(source),
    });

    // Add hono content so its accessible by the durable object after initialization
    ctx.honoWs = {
      events,
      wsContext,
    };
    // This API allows the durable object to accept the WebSocket connection
    ctx.acceptWebSocket(server);

    // note: cloudflare workers doesn't support 'open' event
    if (events.onOpen) {
      events.onOpen(new Event('open'), wsContext);
    }

    return new Response(null, {
      status: 101,
      // @ts-expect-error - webSocket is not typed
      webSocket: client,
    });
  });
}
