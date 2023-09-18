import { useEffect, useState } from 'react';
import {
  FetchResult,
  TriplitClient,
  ClientQuery,
  ClientQueryBuilder,
  SubscriptionOptions,
} from '@triplit/client';

export function useQuery<CQ extends ClientQuery<any>>(
  client: TriplitClient<any>,
  query: ClientQueryBuilder<CQ>,
  options?: SubscriptionOptions
) {
  const [results, setResults] = useState<FetchResult<CQ> | undefined>(
    undefined
  );
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
        setResults(new Map(localResults) as FetchResult<CQ>);
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
