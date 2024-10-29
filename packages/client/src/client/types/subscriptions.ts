import { ClientDBFetchOptions } from './fetch.js';

export type PaginatedSubscription = {
  unsubscribe: () => void;
  nextPage: () => void;
  prevPage: () => void;
};

export type InfiniteSubscription = {
  unsubscribe: () => void;
  loadMore: (pageSize?: number) => void;
};

type ClientSubscriptionOptions = {
  localOnly: boolean;
  onRemoteFulfilled?: () => void;
};
export type SubscriptionOptions = ClientDBFetchOptions &
  ClientSubscriptionOptions;

export type SubscribeBackgroundOptions = { onError?: ErrorCallback };

export type ErrorCallback = (error: Error) => void | Promise<void>;
