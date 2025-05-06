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

export type SessionError = Extract<
  ServerCloseReasonType,
  'ROLES_MISMATCH' | 'TOKEN_EXPIRED' | 'SCHEMA_MISMATCH' | 'UNAUTHORIZED'
>;
/**
 * @deprecated Use `SessionError` instead.
 */
export type SessionErrors = SessionError;
export type OnSessionErrorCallback = (type: SessionError) => void;
export type TokenRefreshOptions = {
  refreshHandler: () => Promise<string | null>;
  interval?: number;
};
