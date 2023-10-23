import {
  TriplitClient,
  Models,
  CollectionNameFromModels,
  SubscriptionOptions,
  ResultTypeFromModel,
  ModelFromModels,
} from '@triplit/client';
import { useQuery } from './use-query.js';

export function useEntity<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  client: TriplitClient<M>,
  collectionName: CN,
  id: string,
  options?: SubscriptionOptions
): {
  fetching: boolean;
  fetchingRemote: boolean;
  results: ResultTypeFromModel<ModelFromModels<M, CN>> | undefined;
  error: any;
} {
  const { fetching, fetchingRemote, results, error } = useQuery(
    client,
    client.query(collectionName).entityId(id),
    options
  );
  return {
    fetching,
    fetchingRemote,
    results: results ? results.get(id) : undefined,
    error,
  };
}
