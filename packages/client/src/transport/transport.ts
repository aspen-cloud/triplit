import { ClientSyncMessage, CloseReason } from '../@triplit/types/sync.js';

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
  /**
   * Sends a message to the server. If the message could not be sent, this should return false. If successfully sent, this should return true.
   */
  sendMessage(message: ClientSyncMessage): boolean;
  /**
   * Connect to the server with the given parameters. If this transport is already connected, it should will close the existing connection and open a new one.
   */
  connect(params: TransportConnectParams): void;
  /**
   * Closes the connection to the server. If the transport is not connected, this should be a no op.
   */
  close(reason?: CloseReason): void;
  onClose(callback: (ev: any) => void): void;
  onConnectionChange(callback: (state: ConnectionStatus) => void): void;
  onError(callback: (ev: any) => void): void;
  onMessage(callback: (message: any) => void): void;
  onOpen(callback: (ev: any) => void): void;
}

export type TransportConnectParams = {
  server: string;
  token: string;
  schema: number | undefined;
  syncSchema?: boolean;
};
