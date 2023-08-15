import { TriplitClient } from '@triplit/client';
import { CollectionNameFromModels, Model } from '@triplit/db';
import { useQuery } from './use-query';

export function useEntity<M extends Model<any>>(
  client: TriplitClient<any>,
  collectionName: CollectionNameFromModels<M>,
  id: string
) {
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
