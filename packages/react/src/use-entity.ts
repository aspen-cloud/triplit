import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
  SubscriptionOptions,
  FetchResult,
} from '@triplit/client';
import { useQueryOne } from './use-query-one.js';
import { WorkerClient } from '@triplit/client/worker-client';

/**
 * A React hook that subscribes to an entity
 *
 * @param client - The client instance to query with
 * @param collectionName - The name of the collection to query
 * @param id - The id of the entity to query
 * @param options - Additional options for the subscription
 * @returns - An object containing the fetching state, the result of the query, and any error that occurred
 */
export function useEntity<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>(
  client: TriplitClient<M> | WorkerClient<M>,
  collectionName: CN,
  id: string,
  options?: Partial<SubscriptionOptions>
) {
  let query = client.query(collectionName).Id(id);
  return useQueryOne(client, query, options);
}
