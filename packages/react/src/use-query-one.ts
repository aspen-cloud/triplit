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
/**
 * A React hook that subscribes to a query and fetches only one result
 *
 * @param client The client instance to query with
 * @param query The query to subscribe to
 * @param options Additional options for the subscription
 * @returns An object containing the fetching state, the result of the query, and any error that occurred
 */
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
