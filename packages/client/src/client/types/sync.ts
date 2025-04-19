import { Logger } from '@triplit/logger';
import {
  ClientSyncMessage,
  ServerCloseReasonType,
  ServerSyncMessage,
} from '../../@triplit/types/sync.js';
import { SyncTransport } from '../../types.js';

export interface SyncOptions {
  transport?: SyncTransport;
  logger: Logger;
  pingInterval?: number;
}

export type OnMessageReceivedCallback = (message: ServerSyncMessage) => void;
export type OnMessageSentCallback = (message: ClientSyncMessage) => void;

export type SessionErrors = Extract<
  ServerCloseReasonType,
  'ROLES_MISMATCH' | 'TOKEN_EXPIRED' | 'SCHEMA_MISMATCH' | 'UNAUTHORIZED'
>;
export type OnSessionErrorCallback = (type: SessionErrors) => void;
export type TokenRefreshOptions = {
  refreshHandler: () => Promise<string | null>;
  interval?: number;
};
