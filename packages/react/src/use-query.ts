import { useEffect, useState } from 'react';
import {
  QueryResults,
  TriplitClient,
  ClientQuery,
  toBuilder,
} from '@triplit/client';

export function useQuery<CQ extends ClientQuery<any>>(
  client: TriplitClient<any>,
  query: toBuilder<CQ>
) {
  const [results, setResults] = useState<QueryResults<CQ> | undefined>(
    undefined
  );
  const [fetchingLocal, setFetchingLocal] = useState(false);
  // const [fetchingRemote, setFetchingRemote] = useState(false);

  const builtQuery = query.build();
  const stringifiedQuery = JSON.stringify(builtQuery);

  useEffect(() => {
    setResults(undefined);
    setFetchingLocal(true);
    const unsubscribe = client.subscribe(builtQuery, (localResults) => {
      setFetchingLocal(false);
      setResults(localResults);
    });

    return () => {
      unsubscribe();
    };
  }, [stringifiedQuery, client]);

  return {
    fetchingLocal,
    // fetchingRemote,
    results,
    error: null,
  };
}
