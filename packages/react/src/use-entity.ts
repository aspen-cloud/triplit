import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
  SubscriptionOptions,
  ReturnTypeFromQuery,
  FetchByIdQueryParams,
  ClientQuery,
} from '@triplit/client';
import { useQuery } from './use-query.js';

export function useEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<M>,
  collectionName: CN,
  id: string,
  queryParams?: FetchByIdQueryParams<M, CN>,
  options?: Partial<SubscriptionOptions>
): {
  fetching: boolean;
  fetchingRemote: boolean;
  fetchingLocal: boolean;
  results: ReturnTypeFromQuery<ClientQuery<M, CN>> | undefined;
  error: any;
} {
  // @ts-ignore
  let query = client.query(collectionName).where('id', '=', id).limit(1);
  if (queryParams?.include) {
    for (const [relation, subquery] of Object.entries(queryParams.include)) {
      if (subquery) {
        // @ts-expect-error
        query = query.include(relation, subquery);
      } else {
        // @ts-expect-error TODO: fixup builder type
        query = query.include(
          // @ts-expect-error expecting typed as relationship from schema
          relation
        );
      }
    }
  }
  const { fetching, fetchingRemote, fetchingLocal, results, error } = useQuery(
    client,
    query,
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
