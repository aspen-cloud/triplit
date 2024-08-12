import {
  CollectionNameFromModels,
  CollectionQuery,
  QueryBuilder,
  QuerySelection,
} from '@triplit/db';
import { ClientSchema } from '../client/types';

export class HttpClientQueryBuilder<
  CQ extends CollectionQuery<any, any, any, any>
> extends QueryBuilder<CQ> {
  constructor(query: CQ) {
    super(query);
  }
}

export function httpClientQueryBuilder<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>
  // syncStatus doesn't apply for the remote client
>(collectionName: CN, params?: Omit<CollectionQuery<M, CN>, 'collectionName'>) {
  const query: CollectionQuery<M, CN> = {
    collectionName,
    ...params,
  };
  return new QueryBuilder<CollectionQuery<M, CN, QuerySelection<M, CN>, {}>>(
    query
  );
}
