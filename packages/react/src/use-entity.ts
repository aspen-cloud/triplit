import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
  SubscriptionOptions,
  ReturnTypeFromQuery,
  FetchByIdQueryParams,
  ClientQueryDefault,
} from '@triplit/client';
import { useQuery } from './use-query.js';
import type { WorkerClient } from '@triplit/client/worker-client';
import { useQueryOne } from './use-query-one.js';

export function useEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  collectionName: CN,
  id: string,
  options?: Partial<SubscriptionOptions>
) {
  let builder = client.query(collectionName).id(id);
  const queryData = useQueryOne(client, builder, options);
  return {
    ...queryData,
    /**
     * @deprecated use `result` instead
     */
    results: queryData.result,
  };
}
