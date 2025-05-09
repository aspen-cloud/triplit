import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  TriplitClient,
  Models,
  SubscriptionOptions,
  FetchResult,
  SchemaQuery,
  SubscriptionSignalPayload,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

type usePaginatedQueryPayload<M extends Models<M>, Q extends SchemaQuery<M>> = {
  results: FetchResult<M, Q, 'many'> | undefined;
  fetching: boolean;
  fetchingPage: boolean;
  error: any;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: () => void;
  prevPage: () => void;
  disconnect: () => void;
};

type useInfiniteQueryPayload<M extends Models<M>, Q extends SchemaQuery<M>> = {
  results: FetchResult<M, Q, 'many'> | undefined;
  fetching: boolean;
  fetchingRemote: boolean;
  fetchingMore: boolean;
  error: any;
  hasMore: boolean;
  loadMore: (pageSize?: number) => void;
  disconnect: () => void;
};

export function createStateSubscription<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
) {
  let latestValue: SubscriptionSignalPayload<M, Q> = {
    results: undefined,
    fetching: true,
    fetchingLocal: true,
    fetchingRemote: false,
    error: undefined,
  };
  return [
    (callback: () => void) => {
      return client.subscribeWithStatus(
        query,
        (newVal) => {
          latestValue = newVal;
          callback();
        },
        options
      );
    },
    () => latestValue,
  ] as const;
}

/**
 * A React hook that subscribes to a query
 *
 * @param client - The client instance to query with
 * @param query - The query to subscribe to
 * @param options - Additional options for the subscription
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled.
 * @returns An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
) {
  const stringifiedQuery = query && JSON.stringify(query);
  const [subscribe, snapshot] = useMemo(
    () => createStateSubscription(client, query, options),
    [stringifiedQuery, client, options?.localOnly!!]
  );
  const getServerSnapshot = useCallback(() => {
    return snapshot();
  }, [snapshot]);
  return useSyncExternalStore(subscribe, snapshot, getServerSnapshot);
}
/**
 * A React hook that subscribes to a query in a paginated manner
 *
 * @param client - The client instance to query with
 * @param query - The query, with a limit set, to subscribe to
 * @param options - Additional options for the subscription
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled.
 * @returns An object containing functions to load the previous and next pages, the fetching state, the result of the query, and any error that occurred
 */
export function usePaginatedQuery<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
): usePaginatedQueryPayload<M, Q> {
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [results, setResults] = useState<FetchResult<M, Q, 'many'> | undefined>(
    undefined
  );
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingPage, setFetchingPage] = useState(false);

  const nextPageRef = useRef<() => void>();
  const prevPageRef = useRef<() => void>();
  const disconnectRef = useRef<() => void>();

  const stringifiedQuery = query && JSON.stringify(query);

  useEffect(() => {
    const { unsubscribe, nextPage, prevPage } = client.subscribeWithPagination(
      query,
      (results, info) => {
        setFetching(false);
        setError(undefined);
        setFetchingPage(false);
        setHasNextPage(info.hasNextPage);
        setHasPreviousPage(info.hasPreviousPage);
        // TODO: fix types to match
        setResults(results as any);
      },
      (error) => {
        setFetching(false);
        setFetchingPage(false);
        setError(error);
      },
      options
    );
    nextPageRef.current = nextPage;
    prevPageRef.current = prevPage;
    disconnectRef.current = unsubscribe;
    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery, client]);

  const nextPage = useCallback(() => {
    setFetchingPage(true);
    nextPageRef.current?.();
  }, []);

  const prevPage = useCallback(() => {
    setFetchingPage(true);
    prevPageRef.current?.();
  }, []);

  const disconnect = useCallback(() => {
    disconnectRef.current?.();
  }, []);

  return {
    results,
    fetching,
    fetchingPage,
    error,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    prevPage,
    disconnect,
  };
}

/**
 * A React hook that subscribes to a query with an initial limit and allows for loading more results
 *
 * @param client - The client instance to query with
 * @param query - The query, with a limit set, to subscribe to
 * @param options - Additional options for the subscription
 * @param options.localOnly - If true, the subscription will only use the local cache. Defaults to false.
 * @param options.onRemoteFulfilled - An optional callback that is called when the remote query has been fulfilled. * @returns An object containing a function to load more results, the fetching state, the result of the query, and any error that occurred
 */
export function useInfiniteQuery<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
): useInfiniteQueryPayload<M, Q> {
  const stringifiedQuery = query && JSON.stringify(query);
  const [hasMore, setHasMore] = useState(false);
  const [results, setResults] = useState<FetchResult<M, Q, 'many'> | undefined>(
    undefined
  );
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(
    client.connectionStatus !== 'CLOSED'
  );
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadMoreRef = useRef<(pageSize?: number) => void>();
  const disconnectRef = useRef<() => void>();
  const hasResponseFromServer = useRef(false);

  useEffect(() => {
    const unsub = client.onConnectionStatusChange((status) => {
      if (status === 'CLOSING' || status === 'CLOSED') {
        setFetchingRemote(false);
        return;
      }
      if (status === 'OPEN' && hasResponseFromServer.current === false) {
        setFetchingRemote(true);
        return;
      }
    }, true);
    return () => {
      unsub();
    };
  }, [stringifiedQuery, client]);

  useEffect(() => {
    const { unsubscribe, loadMore } = client.subscribeWithExpand(
      query,
      (results, info) => {
        setFetching(false);
        setError(undefined);
        setFetchingMore(false);
        setHasMore(info.hasMore);
        setResults(
          // TODO: fix types to match
          results as any
        );
      },
      (error) => {
        setFetching(false);
        setFetchingRemote(false);
        setFetchingMore(false);
        setError(error);
      },
      {
        ...(options ?? {}),
        onRemoteFulfilled: () => {
          hasResponseFromServer.current = true;
          setFetchingRemote(false);
        },
      }
    );
    loadMoreRef.current = loadMore;
    disconnectRef.current = unsubscribe;
    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery, client]);

  const loadMore = useCallback((pageSize?: number) => {
    setFetchingMore(true);
    loadMoreRef.current?.(pageSize);
  }, []);

  const disconnect = useCallback(() => {
    disconnectRef.current?.();
  }, []);

  return {
    results,
    fetching,
    fetchingRemote,
    fetchingMore,
    error,
    hasMore,
    loadMore,
    disconnect,
  };
}
