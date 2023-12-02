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
  options?: SubscriptionOptions
): {
  fetching: boolean;
  fetchingRemote: boolean;
  results: MaybeReturnTypeFromQuery<M, CN> | undefined;
  error: any;
} {
  let query = client.query(collectionName).entityId(id);
  for (const inc of queryParams?.include ?? []) {
    query = query.include(inc);
  }
  const { fetching, fetchingRemote, results, error } = useQuery(
    client,
    query,
    options
  );
  return {
    fetching,
    fetchingRemote,
    results: results ? results.get(id) : undefined,
    error,
  };
}
