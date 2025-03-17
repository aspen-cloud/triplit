import { ClientSyncMessage, CloseReason } from '../@triplit/types/sync.js';
import { WebSocketsUnavailableError } from '../errors.js';
import {
  ConnectionStatus,
  SyncTransport,
  TransportConnectParams,
} from '../types.js';

const DEFAULT_PAYLOAD_SIZE_LIMIT = (1024 * 1024) / 2;

interface WebSocketTransportOptions {
  messagePayloadSizeLimit?: number;
}

function webSocketsAreAvailable(): boolean {
  return typeof WebSocket !== 'undefined';
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
    // @ts-expect-error
    return this.ws ? friendlyReadyState(this.ws) : 'UNINITIALIZED';
  }
  onOpen(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onopen = callback;
  }
  sendMessage(message: ClientSyncMessage): boolean {
    // For now, skip sending messages if we're not connected. I dont think we need a queue yet.
    if (!this.ws) return false;
    if (!this.isOpen) {
      // console.log('skipping', type, payload);
      return false;
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
      return true;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }
  connect(params: TransportConnectParams): void {
    // Close any existing connection
    this.close();

    // Setup connection URL
    const { token, schema, syncSchema, server } = params;
    const wsOptions = new URLSearchParams();
    if (schema) {
      wsOptions.set('schema', schema.toString());
    }
    wsOptions.set('sync-schema', String(!!syncSchema));
    wsOptions.set('token', token);
    const secure = server.startsWith('https://');
    const domain = server.slice(secure ? 8 : 7); // remove protocol
    const wsUri = `${
      secure ? 'wss' : 'ws'
    }://${domain}?${wsOptions.toString()}`;
    if (!webSocketsAreAvailable()) {
      throw new WebSocketsUnavailableError();
    }

    // Create a new WebSocket connection and set up event listeners
    this.ws = new WebSocket(wsUri);
    this.ws.onconnectionchange = (status) => {
      this.connectionListeners.forEach((listener) => listener(status));
    };
  }

  // TODO: feels a bit awkward that these have to be set up after connect()
  onMessage(callback: (message: any) => void): void {
    if (this.ws) this.ws.onmessage = callback;
  }
  onError(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onerror = callback;
  }
  close(reason?: CloseReason): void {
    // Assuming normal close for now (1000), possibly map reasons to codes later
    if (!this.ws) return;

    // If socket is open, close
    if (this.ws.readyState === this.ws.OPEN) {
      return this.ws.close(1000, JSON.stringify(reason));
    }

    // If socket is connecting, close once open
    if (this.ws.readyState === this.ws.CONNECTING) {
      return this.ws.addEventListener(
        'open',
        () => {
          this.ws?.close(1000, JSON.stringify(reason));
        },
        { once: true }
      );
    }
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
  var sizeInBytes = 0;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    sizeInBytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return sizeInBytes;
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

if (typeof globalThis !== 'undefined' && globalThis.WebSocket) {
  var WebSocketProxy = new Proxy(globalThis.WebSocket, {
    construct: function (target, args) {
      //@ts-expect-error
      const instance = new target(...args);

      function dispatchConnectionChangeEvent() {
        instance.dispatchEvent(new Event('connectionchange'));
        if (
          instance.onconnectionchange &&
          typeof instance.onconnectionchange === 'function'
        ) {
          instance.onconnectionchange(friendlyReadyState(instance));
        }
      }

      // Handle connecting state after constructor
      setTimeout(() => {
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

  // Replace native/global WebSocket with the proxy
  globalThis.WebSocket = WebSocketProxy;
}
