import { SyncOptions } from '@triplit/client';
import { ConnectionStatus, friendlyReadyState } from './websocket';

function getWsURI(
  syncOptions: SyncOptions,
  clientId: string,
  schemaVersion?: number
) {
  const { secure: isSecure, apiKey, server } = syncOptions;
  if (!server || !apiKey) {
    console.warn(
      'Both a server and apiKey are required to sync. Skipping sync connection.'
    );
    return undefined;
  }
  const wsOptions = new URLSearchParams();
  if (schemaVersion) {
    wsOptions.set('version', schemaVersion.toString());
  }
  wsOptions.set(
    'keep-open-on-schema-mismatch',
    String(syncOptions.keepOpenOnSchemaMismatch)
  );
  wsOptions.set('client', clientId);
  wsOptions.set('token', apiKey);
  return `${isSecure ? 'wss' : 'ws'}://${server}?${wsOptions.toString()}`;
}

export interface SyncTransport {
  isOpen: boolean;
  connectionStatus: ConnectionStatus | undefined;
  onOpen(callback: (ev: any) => void): void;
  sendMessage(type: string, payload: any): void;
  onMessage(callback: (message: any) => void): void;
  onError(callback: (ev: any) => void): void;
  close(code?: number, reason?: string): void;
  onClose(callback: (ev: any) => void): void;
  onConnectionChange(callback: (state: ConnectionStatus) => void): void;
}

export class WebSocketTransport implements SyncTransport {
  ws: WebSocket | undefined = undefined;
  constructor(
    public syncOptions: SyncOptions,
    public clientId: string,
    public schemaVersion?: number
  ) {
    const uri = getWsURI(syncOptions, clientId, schemaVersion);
    if (!uri) {
      console.warn(
        'Both a server and apiKey are required to sync. Skipping sync connection.'
      );
      return;
    }
    this.ws = new WebSocket(uri);
  }
  get isOpen(): boolean {
    return !!this.ws && this.ws.readyState === this.ws.OPEN;
  }
  get connectionStatus(): ConnectionStatus | undefined {
    return this.ws ? friendlyReadyState(this.ws) : undefined;
  }
  onOpen(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onopen = callback;
  }
  sendMessage(type: string, payload: any): void {
    // For now, skip sending messages if we're not connected. I dont think we need a queue yet.
    if (!this.ws) return;
    if (!this.isOpen) {
      console.log('skipping', type, payload);
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }
  onMessage(callback: (message: any) => void): void {
    if (this.ws) this.ws.onmessage = callback;
  }
  onError(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onerror = callback;
  }
  close(code?: number, reason?: string): void {
    this.ws && this.ws.close(code, reason);
  }
  onClose(callback: (ev: any) => void): void {
    if (this.ws) this.ws.onclose = callback;
  }
  onConnectionChange(callback: (state: ConnectionStatus) => void): void {
    if (this.ws) this.ws.onconnectionchange = callback;
  }
}
