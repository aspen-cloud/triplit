import { useEffect, useState } from 'react';
import {
  FetchResult,
  Model,
  TriplitClient,
  ClientQuery,
  ClientQueryBuilder,
  SubscriptionOptions,
} from '@triplit/client';

export function useQuery<M extends Model | undefined>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<ClientQuery<M>>,
  options?: SubscriptionOptions
) {
  const [results, setResults] = useState<
    FetchResult<ClientQuery<M>> | undefined
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
        setResults(new Map(localResults) as FetchResult<ClientQuery<M>>);
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
