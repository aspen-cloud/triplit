import { useEffect, useState } from 'react';
import {
  FetchResult,
  TriplitClient,
  ClientQuery,
  ClientQueryBuilder,
  SubscriptionOptions,
  CollectionNameFromModels,
  Models,
} from '@triplit/client';

export function useQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<ClientQuery<M, CN>>,
  options?: SubscriptionOptions
) {
  const [results, setResults] = useState<
    FetchResult<ClientQuery<M, CN>> | undefined
  >(undefined);
  const [fetching, setFetching] = useState(true);
  const [fetchingRemote, setFetchingRemote] = useState(true);
  const [error, setError] = useState<any>(undefined);

  const builtQuery = query && query.build();
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    if (!client) return;
    setResults(undefined);
    setFetching(true);
    const unsubscribe = client.subscribe(
      builtQuery,
      (localResults, { hasRemoteFulfilled }) => {
        setFetching(false);
        setError(undefined);
        setFetchingRemote(!hasRemoteFulfilled);
        setResults(new Map(localResults) as FetchResult<ClientQuery<M, CN>>);
      },
      (error) => {
        setFetching(false);
        setError(error);
      },
      options
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
