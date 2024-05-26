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

export function useEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<M> | WorkerClient<M>,
  collectionName: CN,
  id: string,
  queryParams?: FetchByIdQueryParams<M, CN>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingRemote: boolean;
  fetchingLocal: boolean;
  results: ReturnTypeFromQuery<ClientQueryDefault<M, CN>> | undefined;
  error: any;
} {
  // @ts-ignore
  let builder = client.query(collectionName).where('id', '=', id).limit(1);
  if (queryParams?.include) {
    for (const [relation, subquery] of Object.entries(queryParams.include)) {
      if (subquery) {
        // @ts-expect-error
        builder = builder.include(relation, subquery);
      } else {
        // @ts-expect-error TODO: fixup builder type
        builder = builder.include(
          // @ts-expect-error expecting typed as relationship from schema
          relation
        );
      }
    }
  }
  // const query = builder.build();
  const { fetching, fetchingRemote, fetchingLocal, results, error } = useQuery(
    client,
    builder,
    options
  );
  return {
    fetching,
    fetchingRemote,
    fetchingLocal,
    results: results ? results.get(id) : undefined,
    error,
  };
}
