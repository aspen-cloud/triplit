import { useEffect, useState } from 'react';
import {
  FetchResult,
  TriplitClient,
  ClientQuery,
  toBuilder,
} from '@triplit/client';

export function useQuery<CQ extends ClientQuery<any>>(
  client: TriplitClient<any>,
  query: toBuilder<CQ>
) {
  const [results, setResults] = useState<FetchResult<CQ> | undefined>(
    undefined
  );
  const [fetchingLocal, setFetchingLocal] = useState(false);
  const [error, setError] = useState<any>(undefined);
  // const [fetchingRemote, setFetchingRemote] = useState(false);

  const builtQuery = query.build();
  const stringifiedQuery = JSON.stringify(builtQuery);

  useEffect(() => {
    setResults(undefined);
    setFetchingLocal(true);
    const unsubscribe = client.subscribe(builtQuery, (localResults, error) => {
      setFetchingLocal(false);
      setResults(localResults);
      setError(error);
    });

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
