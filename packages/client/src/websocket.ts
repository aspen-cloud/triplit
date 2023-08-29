export type ConnectionStatus = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

declare global {
  interface WebSocket {
    onconnectionchange: (status: ConnectionStatus) => void;
  }
}

export function friendlyReadyState(conn: WebSocket): ConnectionStatus {
  switch (conn.readyState) {
    case conn.CONNECTING:
      return 'CONNECTING';
    case conn.OPEN:
      return 'OPEN';
    case conn.CLOSING:
      return 'CLOSING'; // I'm not sure 'CLOSING' will ever be a state we see with connection change events
    case conn.CLOSED:
    // Default to closed... this shouldnt happen and probably indicates something is wrong
    default:
      return 'CLOSED';
  }
}

// Add any changes to the WebSocket type here (ex more event handlers)
var WebSocketProxy = new Proxy(WebSocket, {
  construct: function (target, args) {
    const instance = new target(
      // @ts-ignore
      ...args
    );

    function dispatchConnectionChangeEvent() {
      instance.dispatchEvent(new Event('connectionchange'));
      if (
        instance.onconnectionchange &&
        typeof instance.onconnectionchange === 'function'
      ) {
        instance.onconnectionchange(friendlyReadyState(instance));
      }
    }

    // Capture the connecting state after the constructor is called
    setTimeout(function () {
      dispatchConnectionChangeEvent();
    }, 0);

    const openHandler = () => {
      dispatchConnectionChangeEvent();
    };

    const closeHandler = () => {
      dispatchConnectionChangeEvent();
      instance.removeEventListener('open', openHandler);
      instance.removeEventListener('close', closeHandler);
    };

    instance.addEventListener('open', openHandler);
    instance.addEventListener('close', closeHandler);

    return instance;
  },
});

// replace the native WebSocket with the proxy
WebSocket = WebSocketProxy;
