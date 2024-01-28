import { ClientSyncMessage, CloseReason } from '@triplit/types/sync';
import {
  ConnectionStatus,
  SyncTransport,
  TransportConnectParams,
} from './transport.js';

const DEFAULT_PAYLOAD_SIZE_LIMIT = (1024 * 1024) / 2;

interface WebSocketTransportOptions {
  messagePayloadSizeLimit?: number;
}

export class WebSocketTransport implements SyncTransport {
  ws: WebSocket | undefined = undefined;
  private connectionListeners: Set<(state: ConnectionStatus) => void> =
    new Set();
  constructor(private options: WebSocketTransportOptions = {}) {
    this.options.messagePayloadSizeLimit =
      // allow 0 to disable the limit
      this.options.messagePayloadSizeLimit == undefined
        ? DEFAULT_PAYLOAD_SIZE_LIMIT
        : this.options.messagePayloadSizeLimit;
  }
  get isOpen(): boolean {
    return !!this.ws && this.ws.readyState === this.ws.OPEN;
  }
  get connectionStatus(): ConnectionStatus {
    return this.ws ? friendlyReadyState(this.ws) : 'CLOSED';
  }
  onOpen(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onopen = callback;
  }
  sendMessage(message: ClientSyncMessage): void {
    // For now, skip sending messages if we're not connected. I dont think we need a queue yet.
    if (!this.ws) return;
    if (!this.isOpen) {
      // console.log('skipping', type, payload);
      return;
    }

    // Perform chunking if the message is too large
    const serializedMessage = JSON.stringify(message);
    const bytes = getPayloadSize(serializedMessage);
    if (
      this.options.messagePayloadSizeLimit &&
      bytes > this.options.messagePayloadSizeLimit
    ) {
      const chunks = chunkMessage(
        serializedMessage,
        Math.ceil(bytes / this.options.messagePayloadSizeLimit)
      );
      const messageid = (Math.random() + 1).toString(36).substring(7);
      for (let i = 0; i < chunks.length; i++) {
        this.ws.send(
          JSON.stringify({
            type: 'CHUNK',
            payload: {
              data: chunks[i],
              total: chunks.length,
              index: i,
              id: messageid,
            },
          })
        );
      }
      return;
    }
    this.ws.send(JSON.stringify(message));
  }
  connect(params: TransportConnectParams): void {
    if (this.ws && this.isOpen) this.close();
    const { token, clientId, schema, syncSchema, server, secure } = params;
    const missingParams = [];
    if (!token || !clientId || !server) {
      if (!token) missingParams.push('token');
      if (!clientId) missingParams.push('clientId');
      if (!server) missingParams.push('server');
      console.warn(
        `Missing required params: [${missingParams.join(
          ', '
        )}]. Skipping sync connection.`
      );
      return;
    }
    const wsOptions = new URLSearchParams();
    if (schema) {
      wsOptions.set('schema', schema.toString());
    }
    wsOptions.set('sync-schema', String(syncSchema));
    wsOptions.set('client', clientId);
    wsOptions.set('token', token);
    const wsUri = `${
      secure ? 'wss' : 'ws'
    }://${server}?${wsOptions.toString()}`;
    this.ws = new WebSocket(wsUri);
    this.ws.onconnectionchange = (status) => {
      this.connectionListeners.forEach((listener) => listener(status));
    };
  }
  onMessage(callback: (message: any) => void): void {
    if (this.ws) this.ws.onmessage = callback;
  }
  onError(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onerror = callback;
  }
  close(reason?: CloseReason): void {
    // Assuming normal close for now (1000), possibly map reasons to codes later
    this.ws && this.ws.close(1000, JSON.stringify(reason));
  }
  onClose(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onclose = callback;
  }
  onConnectionChange(callback: (state: ConnectionStatus) => void): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }
}

function getPayloadSize(payload: string): number {
  return new TextEncoder().encode(payload).length;
}

function chunkMessage(message: string, numChunks: number): string[] {
  let chunks = [];
  const chunkSize = Math.ceil(message.length / numChunks);
  for (let i = 0; i < message.length; i += chunkSize) {
    chunks.push(message.slice(i, i + chunkSize));
  }
  return chunks;
}

declare global {
  interface WebSocket {
    onconnectionchange: (status: ConnectionStatus) => void;
  }
}

function friendlyReadyState(conn: WebSocket): ConnectionStatus {
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

// temporary defensive check for node env
if (typeof window !== 'undefined') {
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
}
