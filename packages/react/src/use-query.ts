import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClientFetchResult,
  TriplitClient,
  ClientQuery,
  Models,
  ClientQueryBuilder,
  SubscriptionOptions,
  Unalias,
} from '@triplit/client';
import type { WorkerClient } from '@triplit/client/worker-client';

type useQueryPayload<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
> = {
  results: Unalias<ClientFetchResult<Q>> | undefined;
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  error: any;
};

type usePaginatedQueryPayload<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
> = {
  results: Unalias<ClientFetchResult<Q>> | undefined;
  fetching: boolean;
  fetchingPage: boolean;
  error: any;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: () => void;
  prevPage: () => void;
  disconnect: () => void;
};

type useInfiniteQueryPayload<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
> = {
  results: Unalias<ClientFetchResult<Q>> | undefined;
  fetching: boolean;
  fetchingRemote: boolean;
  fetchingMore: boolean;
  error: any;
  hasMore: boolean;
  loadMore: () => void;
  disconnect: () => void;
};
/**
 * A React hook that subscribes to a query
 *
 * @param client The client instance to query with
 * @param query The query to subscribe to
 * @param options Additional options for the subscription
 * @returns An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: ClientQueryBuilder<Q>,
  options?: Partial<SubscriptionOptions>
): useQueryPayload<M, Q> {
  const [results, setResults] = useState<
    Unalias<ClientFetchResult<Q>> | undefined
  >(undefined);
  const [fetchingLocal, setFetchingLocal] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(
    client.connectionStatus !== 'CLOSED'
  );
  const [error, setError] = useState<any>(undefined);
  const [isInitialFetch, setIsInitialFetch] = useState(true);

  const hasResponseFromServer = useRef(false);
  const builtQuery = query && query.build();
  const fetching = fetchingLocal || (isInitialFetch && fetchingRemote);
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    client.isFirstTimeFetchingQuery(builtQuery).then((isFirstFetch) => {
      setIsInitialFetch(isFirstFetch);
    });
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
    if (!client) return;
    setResults(undefined);
    setFetchingLocal(true);
    const unsubscribe = client.subscribe(
      builtQuery,
      (localResults) => {
        setFetchingLocal(false);
        setError(undefined);
        setResults(new Map(localResults));
      },
      (error) => {
        setFetchingLocal(false);
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

    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery, client]);

  return {
    fetching,
    fetchingRemote,
    fetchingLocal,
    results,
    error,
  };
}
/**
 * A React hook that subscribes to a query in a paginated manner
 *
 * @param client The client instance to query with
 * @param query The query, with a limit set, to subscribe to
 * @param options Additional options for the subscription
 * @returns An object containing functions to load the previous and next pages, the fetching state, the result of the query, and any error that occurred
 */
export function usePaginatedQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: ClientQueryBuilder<Q>,
  options?: Partial<SubscriptionOptions>
): usePaginatedQueryPayload<M, Q> {
  const builtQuery = useMemo(() => query.build(), [query]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [results, setResults] = useState<
    Unalias<ClientFetchResult<Q>> | undefined
  >(undefined);
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingPage, setFetchingPage] = useState(false);

  const nextPageRef = useRef<() => void>();
  const prevPageRef = useRef<() => void>();
  const disconnectRef = useRef<() => void>();

  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    const { unsubscribe, nextPage, prevPage } = client.subscribeWithPagination(
      builtQuery,
      (results, info) => {
        setFetching(false);
        setError(undefined);
        setFetchingPage(false);
        setHasNextPage(info.hasNextPage);
        setHasPreviousPage(info.hasPreviousPage);
        setResults(new Map(results));
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
  }, [stringifiedQuery]);

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
 * @param client The client instance to query with
 * @param query The query, with a limit set, to subscribe to
 * @param options Additional options for the subscription
 * @returns An object containing a function to load more results, the fetching state, the result of the query, and any error that occurred
 */
export function useInfiniteQuery<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: ClientQueryBuilder<Q>,
  options?: Partial<SubscriptionOptions>
): useInfiniteQueryPayload<M, Q> {
  const builtQuery = useMemo(() => query.build(), [query]);
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);
  const [hasMore, setHasMore] = useState(false);
  const [results, setResults] = useState<
    Unalias<ClientFetchResult<Q>> | undefined
  >(undefined);
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(
    client.connectionStatus !== 'CLOSED'
  );
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadMoreRef = useRef<() => void>();
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
      builtQuery,
      (results, info) => {
        setFetching(false);
        setError(undefined);
        setFetchingMore(false);
        setHasMore(info.hasMore);
        setResults(new Map(results));
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
          console.log('remote fulfilled');
          setFetchingRemote(false);
        },
      }
    );
    loadMoreRef.current = loadMore;
    disconnectRef.current = unsubscribe;
    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery]);

  const loadMore = useCallback(() => {
    setFetchingMore(true);
    loadMoreRef.current?.();
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
