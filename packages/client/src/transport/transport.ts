import { ClientSyncMessage, CloseReason } from '@triplit/types/sync';

/**
 * Possible values reflect the WebSocket readyState: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
 *
 * - CONNECTING: An attempt to connect is being made
 * - OPEN: The connection is open and ready to communicate
 * - CLOSING: The connection is in the process of closing
 * - CLOSED: The connection is closed or couldn't be opened
 */
export type ConnectionStatus = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

export interface SyncTransport {
  isOpen: boolean;
  connectionStatus: ConnectionStatus;
  onOpen(callback: (ev: any) => void): void;
  sendMessage<Msg extends ClientSyncMessage>(
    type: Msg['type'],
    payload: Msg['payload']
  ): void;
  onMessage(callback: (message: any) => void): void;
  onError(callback: (ev: any) => void): void;
  connect(params: TransportConnectParams): void;
  close(reason?: CloseReason): void;
  onClose(callback: (ev: any) => void): void;
  onConnectionChange(callback: (state: ConnectionStatus) => void): void;
}

export type TransportConnectParams = {
  server?: string;
  secure?: boolean;
  token?: string;
  clientId: string;
  schema?: number;
  syncSchema?: boolean;
};
