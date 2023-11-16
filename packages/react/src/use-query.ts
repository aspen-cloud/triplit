import { useEffect, useState } from 'react';
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
    client.syncEngine.connectionStatus === 'CONNECTING' ||
    client.syncEngine.connectionStatus === 'OPEN'
  );
  const [error, setError] = useState<any>(undefined);

  const builtQuery = query && query.build();
  const stringifiedQuery = builtQuery && JSON.stringify(builtQuery);

  useEffect(() => {
    const unsub = client.syncEngine.onConnectionStatusChange((status) => {
      if (status === 'CLOSING' || status === 'CLOSED') {
        setFetchingRemote(false);
      }
    });
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
