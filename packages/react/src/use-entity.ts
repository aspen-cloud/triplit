import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
  FetchOptions,
} from '@triplit/client';
import { useQuery } from './use-query';

export function useEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<M>,
  collectionName: CN,
  id: string,
  options?: FetchOptions
) {
  const { fetchingLocal, results, error } = useQuery(
    client,
    client.query(collectionName).entityId(id),
    options
  );
  return {
    fetchingLocal,
    results: results ? results.get(id) : undefined,
    error,
  };
}
