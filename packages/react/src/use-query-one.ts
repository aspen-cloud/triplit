import {
  ClientFetchResultEntity,
  ClientQuery,
  Models,
  ClientQueryBuilder,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';
import { useMemo } from 'react';
import { useQuery } from './use-query.js';

export function useQueryOne<
  M extends Models<any, any> | undefined,
  Q extends ClientQuery<M, any, any, any>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: ClientQueryBuilder<Q>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  result: Unalias<ClientFetchResultEntity<Q>> | null;
  error: any;
} {
  const fetchOneQuery = query.limit(1);
  const { fetching, fetchingLocal, fetchingRemote, results, error } = useQuery(
    client,
    fetchOneQuery,
    options
  );
  const result = useMemo<ClientFetchResultEntity<Q> | null>(() => {
    return Array.from(results?.values() ?? [])[0] ?? null;
  }, [results]);
  return { fetching, fetchingLocal, fetchingRemote, result, error };
}
