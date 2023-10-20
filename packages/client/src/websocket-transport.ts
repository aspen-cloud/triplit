import { TransportConnectParams, SyncTransport } from './triplit-client.js';
import { ConnectionStatus, friendlyReadyState } from './websocket.js';

export class WebSocketTransport implements SyncTransport {
  ws: WebSocket | undefined = undefined;
  constructor() {}
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
      // console.log('skipping', type, payload);
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }
  connect(params: TransportConnectParams): void {
    if (this.ws && this.isOpen) this.ws.close();
    const { apiKey, clientId, schema, syncSchema, server, secure } = params;
    const missingParams = [];
    if (!apiKey || !clientId || !server) {
      if (!apiKey) missingParams.push('apiKey');
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
    wsOptions.set('token', apiKey);
    const wsUri = `${
      secure ? 'wss' : 'ws'
    }://${server}?${wsOptions.toString()}`;
    this.ws = new WebSocket(wsUri);
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
