import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
} from '@triplit/client';
import { useQuery } from './use-query';

export function useEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(client: TriplitClient<M>, collectionName: CN, id: string) {
  const { fetchingLocal, results, error } = useQuery(
    client,
    client.query(collectionName).entityId(id)
  );
  return {
    fetchingLocal,
    results: results ? results.get(id) : undefined,
    error,
  };
}
