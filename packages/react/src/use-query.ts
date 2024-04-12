import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClientFetchResult,
  TriplitClient,
  ClientQuery,
  CollectionNameFromModels,
  Models,
  ClientQueryBuilder,
  SubscriptionOptions,
} from '@triplit/client';

export function useQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<M, CN>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  results: ClientFetchResult<ClientQuery<M, CN>> | undefined;
  error: any;
} {
  const [results, setResults] = useState<
    ClientFetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [fetchingLocal, setFetchingLocal] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(
    client.syncEngine.connectionStatus !== 'CLOSED'
  );
  const [error, setError] = useState<any>(undefined);
  const [isInitialFetch, setIsInitialFetch] = useState(true);

  const hasResponseFromServer = useRef(false);
  const builtQuery = query && query.build();
  const fetching = fetchingLocal || (isInitialFetch && fetchingRemote);
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    client.syncEngine
      .isFirstTimeFetchingQuery(builtQuery)
      .then((isFirstFetch) => {
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
        setResults(
          new Map(localResults) as ClientFetchResult<ClientQuery<M, CN>>
        );
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

export function usePaginatedQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<M, CN>,
  options?: Partial<SubscriptionOptions>
) {
  const builtQuery = useMemo(() => query.build(), [query]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [results, setResults] = useState<
    ClientFetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingPage, setFetchingPage] = useState(false);

  const nextPageRef = useRef<() => void>();
  const prevPageRef = useRef<() => void>();
  const disconnectRef = useRef<() => void>();

  useEffect(() => {
    const { unsubscribe, nextPage, prevPage } = client.subscribeWithPagination(
      builtQuery,
      (results, info) => {
        setFetching(false);
        setError(undefined);
        setFetchingPage(false);
        setHasNextPage(info.hasNextPage);
        setHasPreviousPage(info.hasPreviousPage);
        setResults(new Map(results) as ClientFetchResult<ClientQuery<M, CN>>);
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
  }, [builtQuery]);

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

export function useInfiniteQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<M, CN>,
  options?: Partial<SubscriptionOptions>
) {
  const builtQuery = useMemo(() => query.build(), [query]);
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);
  const [hasMore, setHasMore] = useState(false);
  const [results, setResults] = useState<
    ClientFetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(
    client.syncEngine.connectionStatus !== 'CLOSED'
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
        setResults(new Map(results) as ClientFetchResult<ClientQuery<M, CN>>);
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
  }, [builtQuery]);

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
