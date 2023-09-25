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
  const [error, setError] = useState<any>(undefined);

  const builtQuery = query && query.build();
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    if (!client) return;
    setResults(undefined);
    setFetching(true);
    const unsubscribe = client.subscribe(
      builtQuery,
      (localResults) => {
        setFetching(false);
        setError(undefined);
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
    results,
    error,
  };
}
