import {
  CollectionNameFromModels,
  CollectionQuery,
  CollectionQueryDefault,
  ModelQueries,
  Models,
  QueryBuilder,
  QuerySelection,
} from '@triplit/db';
import { ClientSchema } from '../client/types';

export class HttpClientQueryBuilder<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN> = CollectionQueryDefault<M, CN>
> extends QueryBuilder<M, CN, Q> {
  constructor(query: Q) {
    super(query);
  }
}

export function httpClientQueryBuilder<
  M extends ClientSchema,
  CN extends CollectionNameFromModels<M>
  // syncStatus doesn't apply for the remote client
>(collectionName: CN, params?: Omit<CollectionQuery<M, CN>, 'collectionName'>) {
  const query: CollectionQuery<M, CN> = {
    collectionName,
    ...params,
  };
  return new QueryBuilder<
    M,
    CN,
    CollectionQuery<M, CN, QuerySelection<M, CN>, {}>
  >(query);
}
