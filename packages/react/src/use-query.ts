import { useEffect, useRef, useState } from 'react';
import {
  ClientFetchResult,
  TriplitClient,
  ClientQuery,
  SubscriptionOptions,
  CollectionNameFromModels,
  Models,
  ClientQueryBuilder,
} from '@triplit/client';

export function useQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<M, CN>,
  options?: { localOnly?: boolean }
): {
  fetching: boolean;
  fetchingRemote: boolean;
  results: ClientFetchResult<ClientQuery<M, CN>> | undefined;
  error: any;
} {
  const [results, setResults] = useState<
    ClientFetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(
    client.syncEngine.connectionStatus === 'OPEN'
  );
  const [error, setError] = useState<any>(undefined);
  const hasResponseFromServer = useRef(false);

  const builtQuery = query && query.build();
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    const unsub = client.syncEngine.onConnectionStatusChange((status) => {
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
    setFetching(true);
    const unsubscribe = client.subscribe(
      builtQuery,
      (localResults) => {
        setFetching(false);
        setError(undefined);
        setResults(
          new Map(localResults) as ClientFetchResult<ClientQuery<M, CN>>
        );
      },
      (error) => {
        setFetching(false);
        setError(error);
      },
      options?.localOnly
        ? { localOnly: true }
        : {
            localOnly: false,
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
    results,
    error,
  };
}

export function useInfiniteQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(client: TriplitClient<any>, query: ClientQuery<M, CN>) {
  const [hasMore, setHasMore] = useState(false);
  const [results, setResults] = useState<
    ClientFetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [error, setError] = useState<any>(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);

  const loadMoreRef = useRef<() => void>();
  const disconnectRef = useRef<() => void>();

  useEffect(() => {
    const { unsubscribe, loadMore } = client.infiniteSubscribe(
      query,
      (results, info) => {
        setFetching(false);
        setError(undefined);
        setFetchingMore(false);
        setHasMore(info.hasMore);
        setResults(new Map(results) as ClientFetchResult<ClientQuery<M, CN>>);
      }
    );
    loadMoreRef.current = loadMore;
    disconnectRef.current = unsubscribe;
    return () => {
      unsubscribe();
    };
  }, [query]);

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
    fetchingMore,
    error,
    hasMore,
    loadMore,
    disconnect,
  };
}
