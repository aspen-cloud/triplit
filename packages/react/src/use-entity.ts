import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
  SubscriptionOptions,
  MaybeReturnTypeFromQuery,
  FetchByIdQueryParams,
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
  results: MaybeReturnTypeFromQuery<M, CN> | undefined;
  error: any;
} {
  // @ts-ignore
  let query = client.query(collectionName).where('id', '=', id).limit(1);
  if (queryParams?.include) {
    for (const [relation, subquery] of Object.entries(queryParams.include)) {
      if (subquery)
        query = query.include(
          // @ts-expect-error
          relation,
          subquery
        );
      else
        query = query.include(
          // @ts-expect-error
          relation
        );
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
