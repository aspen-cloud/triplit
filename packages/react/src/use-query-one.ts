import {
  Models,
  SubscriptionOptions,
  TriplitClient,
  SchemaQuery,
  FetchResult,
  SubscriptionSignalPayload,
} from '@triplit/client';
import { useMemo } from 'react';
import { useQuery } from './use-query.js';

type useQueryOnePayload<M extends Models<M>, Q extends SchemaQuery<M>> = Omit<
  SubscriptionSignalPayload<M, Q>,
  'results'
> & { result: FetchResult<M, Q, 'one'> };

/**
 * A React hook that subscribes to a query and fetches only one result
 *
 * @param client - The client instance to query with
 * @param query - The query to subscribe to
 * @param options - Additional options for the subscription
 * @returns An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useQueryOne<M extends Models<M>, Q extends SchemaQuery<M>>(
  client: TriplitClient<M>,
  query: Q,
  options?: Partial<SubscriptionOptions>
): useQueryOnePayload<M, Q> {
  const { fetching, fetchingLocal, fetchingRemote, results, error } = useQuery(
    client,
    { ...query, limit: 1 },
    options
  );
  const result = useMemo(() => {
    return results?.[0] ?? null;
  }, [results]);
  return { fetching, fetchingLocal, fetchingRemote, result, error };
}
