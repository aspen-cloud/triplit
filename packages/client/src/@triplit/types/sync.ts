import { ITriplitError } from './errors.js';

type CollectionQuery<T, U> = any;
export type SyncTimestamp = [number, number, string];

type SyncMessage<Type extends string, Payload extends any> = {
  type: Type;
  payload: Payload;
};

export type QueryState = {
  timestamp: SyncTimestamp;
  entityIds: { [collection: string]: string[] };
};

export type ServerCloseReason = {
  type: ServerCloseReasonType;
  retry: boolean;
  message?: string;
};

/**
 * Reasons for a client side connection close
 * - CONNECTION_OVERRIDE: The client has opened a new connection and this one is no longer needed
 * - MANUAL_DISCONNECT: The client has manually closed the connection
 * - NETWORK_OFFLINE: The client has lost network connectivity
 */
export type ClientCloseReasonType =
  | 'CONNECTION_OVERRIDE'
  | 'MANUAL_DISCONNECT'
  | 'NETWORK_OFFLINE';
export type ServerCloseReasonType =
  | 'SCHEMA_MISMATCH'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'ROLES_MISMATCH'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';
export type CloseReasonType = ClientCloseReasonType | ServerCloseReasonType;
export type CloseReason = {
  type: CloseReasonType;
  retry: boolean;
};

export type ServerEntityDataMessage = SyncMessage<
  'ENTITY_DATA',
  { changes: any; timestamp: any; forQueries: string[] }
>;
export type ServerChangesAckMessage = SyncMessage<
  'CHANGES_ACK',
  { timestamp: any }
>;
export type ServerErrorMessage = SyncMessage<
  'ERROR',
  {
    messageType: ClientSyncMessage['type'];
    error: ITriplitError;
    metadata?: {
      // Sync errors
      queryKey?: string;
      innerError?: ITriplitError;
      // Write errors
      failures: { txId: string; error: ITriplitError }[];
    };
  }
>;
export type ServerCloseMessage = SyncMessage<'CLOSE', ServerCloseReason>;
export type ServerSchemaRequestMessage = SyncMessage<'SCHEMA_REQUEST', {}>;
export type ServerReadyMessage = SyncMessage<
  'READY',
  {
    clientId: string;
  }
>;
export type ServerPongMessage = SyncMessage<
  'PONG',
  { clientTimestamp?: number; serverTimestamp?: number }
>;

export type ServerSyncMessage =
  | ServerErrorMessage
  | ServerCloseMessage
  | ServerEntityDataMessage
  | ServerChangesAckMessage
  | ServerSchemaRequestMessage
  | ServerReadyMessage
  | ServerPongMessage;

export type ClientConnectQueryMessage = SyncMessage<
  'CONNECT_QUERY',
  {
    id: string;
    params: CollectionQuery<any, any>;
    state?: QueryState;
  }
>;
export type ClientDisconnectQueryMessage = SyncMessage<
  'DISCONNECT_QUERY',
  { id: string }
>;

export type ClientChunkMessage = SyncMessage<
  'CHUNK',
  { data: string; total: number; index: number; id: string }
>;
export type ClientChangesMessage = SyncMessage<'CHANGES', { changes: any }>;

export type ClientUpdateTokenMessage = SyncMessage<
  'UPDATE_TOKEN',
  { token: string }
>;
export type ClientSchemaResponseMessage = SyncMessage<
  'SCHEMA_RESPONSE',
  { schema: any }
>;

export type ClientPingMessage = SyncMessage<
  'PING',
  { clientTimestamp?: number }
>;

export type ClientSyncMessage =
  | ClientConnectQueryMessage
  | ClientDisconnectQueryMessage
  | ClientChunkMessage
  | ClientUpdateTokenMessage
  | ClientChangesMessage
  | ClientSchemaResponseMessage
  | ClientPingMessage;

type SuccessResult<T> = { data: T; error?: undefined };
type ErrorResult<E> = { data?: undefined; error: E };
export type ParseResult<T, E = Error> = SuccessResult<T> | ErrorResult<E>;
