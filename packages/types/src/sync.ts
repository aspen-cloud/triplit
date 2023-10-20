import { CollectionQuery, TripleRow } from '@triplit/db';

type SyncMessage<Type extends string, Payload extends any> = {
  type: Type;
  payload: Payload;
};

export type ServerSyncMessage =
  | SyncMessage<'TRIPLES_ACK', { txIds: string[] }>
  | SyncMessage<'TRIPLES', { triples: TripleRow[]; forQueries: string[] }>
  | SyncMessage<'TRIPLES_REQUEST', {}>
  | SyncMessage<
      'ERROR',
      { messageType: ClientSyncMessage['type']; error: any; metadata: any }
    >;

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
