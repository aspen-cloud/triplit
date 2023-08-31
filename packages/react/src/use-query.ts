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
  const [fetchingLocal, setFetchingLocal] = useState(false);
  const [error, setError] = useState<any>(undefined);
  // const [fetchingRemote, setFetchingRemote] = useState(false);

  const builtQuery = query && query.build();
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    if (!client) return;
    setResults(undefined);
    setFetchingLocal(true);
    const unsubscribe = client.subscribe(
      builtQuery,
      (localResults) => {
        setFetchingLocal(false);
        setError(undefined);
        setResults(localResults);
      },
      (error) => {
        setFetchingLocal(false);
        setError(error);
      },
      options
    );

    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery, client]);

  return {
    fetchingLocal,
    // fetchingRemote,
    results,
    error,
  };
}
