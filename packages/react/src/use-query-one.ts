import {
  ClientQuery,
  Models,
  ClientQueryBuilder,
  SubscriptionOptions,
  TriplitClient,
  Unalias,
  FetchResultEntity,
  CollectionNameFromModels,
} from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';
import { useMemo } from 'react';
import { useQuery } from './use-query.js';
/**
 * A React hook that subscribes to a query and fetches only one result
 *
 * @param client - The client instance to query with
 * @param query - The query to subscribe to
 * @param options - Additional options for the subscription
 * @returns An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useQueryOne<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ClientQuery<M, CN>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  query: ClientQueryBuilder<M, CN, Q>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingLocal: boolean;
  fetchingRemote: boolean;
  result: Unalias<FetchResultEntity<M, Q>> | null;
  error: any;
} {
  const fetchOneQuery = query.limit(1);
  const { fetching, fetchingLocal, fetchingRemote, results, error } = useQuery(
    client,
    fetchOneQuery,
    options
  );
  const result = useMemo(() => {
    return Array.from(results?.values() ?? [])[0] ?? null;
  }, [results]);
  return { fetching, fetchingLocal, fetchingRemote, result, error };
}
