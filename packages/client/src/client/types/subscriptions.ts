import { Change, FetchResult, Models, SchemaQuery } from '@triplit/db';
import { ClientFetchOptions } from './fetch.js';

export type SubscriptionSignalPayload<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
> = {
  results: FetchResult<M, Q, 'many'> | undefined;
  error: any;
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
};

export type PaginatedSubscription = {
  unsubscribe: () => void;
  nextPage: () => void;
  prevPage: () => void;
};

export type InfiniteSubscription = {
  unsubscribe: () => void;
  loadMore: (pageSize?: number) => void;
};

export type QuerySyncState =
  | 'NOT_STARTED'
  | 'IN_FLIGHT'
  | 'FULFILLED'
  | 'ERROR';
export type SyncStateCallback = (
  state: QuerySyncState,
  context: any
) => Promise<void> | void;

type ClientSubscriptionOptions = {
  localOnly: boolean;
  onRemoteFulfilled?: () => void;
  onQuerySyncStateChange?: SyncStateCallback;
};
export type SubscriptionOptions = Omit<ClientFetchOptions, 'policy'> &
  ClientSubscriptionOptions;

export type SubscribeBackgroundOptions = {
  // TODO: could have onResults(triples) here as well
  onFulfilled?: () => void;
  onError?: ErrorCallback;
};

export type ErrorCallback = (error: Error) => void | Promise<void>;
export type EntitySyncErrorCallback = (
  error: Error,
  entity: Change
) => void | Promise<void>;
export type EntitySyncSuccessCallback = () => void | Promise<void>;
