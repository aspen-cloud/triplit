import { CollectionQuery, TripleRow } from '@triplit/db';

type SyncMessage<Type extends string, Payload extends any> = {
  type: Type;
  payload: Payload;
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
  | 'INTERNAL_ERROR';
export type CloseReasonType = ClientCloseReasonType | ServerCloseReasonType;
export type CloseReason = {
  type: CloseReasonType;
  retry: boolean;
};

export type ServerSyncMessage =
  | SyncMessage<'TRIPLES_ACK', { txIds: string[] }>
  | SyncMessage<'TRIPLES', { triples: TripleRow[]; forQueries: string[] }>
  | SyncMessage<'TRIPLES_REQUEST', {}>
  | SyncMessage<
      'ERROR',
      { messageType: ClientSyncMessage['type']; error: any; metadata: any }
    >
  | SyncMessage<'CLOSE', ServerCloseReason>;

export type ClientSyncMessage =
  | SyncMessage<
      'CONNECT_QUERY',
      { id: string; params: CollectionQuery<any, any> }
    >
  | SyncMessage<'DISCONNECT_QUERY', { id: string }>
  | SyncMessage<'TRIPLES_PENDING', {}>
  | SyncMessage<'TRIPLES', { triples: TripleRow[] }>;

export type ParsedToken = {
  projectId: string;
  type: string;
  userId?: string;
};

type SuccessResult<T> = { data: T; error?: undefined };
type ErrorResult<E> = { data?: undefined; error: E };
export type ParseResult<T, E = Error> = SuccessResult<T> | ErrorResult<E>;
