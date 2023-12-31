import {
  Builder,
  CollectionNameFromModels,
  CollectionQuery,
  FetchByIdQueryParams,
  Models,
  QUERY_INPUT_TRANSFORMERS,
  ReturnTypeFromQuery,
  toBuilder,
} from '@triplit/db';

//  There is some odd behavior when using infer with intersection types
//  Our query types are set up as:
//  CollectionQuery<...> = Query<...> & { ... }
//  ClientQuery<...> = CollectionQuery<...> & { ... }
//
//  However, if you attempt to infer the generic of a base object (ex. CollectionQuery<infer M>) with the intersected object (ClientQuery<any>) the inferred type M is overly generic
//
//  Recreating the fetch result type here to avoid this issue
//  Playground: https://www.typescriptlang.org/play?#code/KYDwDg9gTgLgBDAnmYcCyEAmwA2BnAHgCg44BhCHHYAYxgEsIA7AOQEMBbVUGYJzPHDwwo9JgHMANCTgAVODz4C4AJVrRMBYaImShIseIB8RI3AC8q9VE0UqtBs3Zc9sowG4iRJCjgAhNjxgAjQFEF5+QQxsfAI2JkQ9eMQjPTIWMIjlAGtgRAgAM3QzSwBvGTYYEQBGAC50AG10gF1PAF8vH1QAUXClYE1QxUj0LFxCZKSE1PIM4Zy8wuKLf0DgtDSWMwAyOFLKkQAmeu1DNs9vZFRZYGFqgnl5wQCguISplJK5TKVntbfEnBkmYAPxwADkYECeHBcHq4IKbHoOHBni6cluMEODx+IxewUmQOmX0efTx-zEBWAUDgAFUPqC6XCIYjkajOlc4ABJJhgACu8EsvSyAwIpV4wnq+3hBQgEHBbTaenBEpg4I8HN8ajwfJwMGqKxudwIPP5MA16O1uqxhsx2NNAo8QA
/**
 * Results from a query based on the query's model in the format `Map<id, entity>`
 */
export type ClientFetchResult<C extends ClientQuery<any, any>> = Map<
  string,
  ClientFetchResultEntity<C>
>;

export type ClientFetchResultEntity<C extends ClientQuery<any, any>> =
  C extends ClientQuery<infer M, infer CN>
    ? M extends Models<any, any>
      ? ReturnTypeFromQuery<M, CN>
      : any
    : never;

export type SyncStatus = 'pending' | 'confirmed' | 'all';

export type ClientQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  syncStatus?: SyncStatus;
} & CollectionQuery<M, CN>;

export function ClientQueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  collectionName: CN,
  params?: Omit<ClientQuery<M, CN>, 'collectionName'>
): toBuilder<
  ClientQuery<M, CN>,
  'collectionName',
  QUERY_INPUT_TRANSFORMERS<M, CN>
> {
  const query: ClientQuery<M, CN> = {
    collectionName,
    ...params,
    syncStatus: params?.syncStatus ?? 'all',
  };
  const transformers = QUERY_INPUT_TRANSFORMERS<M, CN>();
  return Builder(query, {
    protectedFields: ['collectionName'],
    inputTransformers: transformers,
  });
}

export type ClientQueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = ReturnType<typeof ClientQueryBuilder<M, CN>>;

export function prepareFetchOneQuery<CQ extends ClientQuery<any, any>>(
  query: CQ
): CQ {
  query.limit = 1;
  return query;
}

export function prepareFetchByIdQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(
  collectionName: CN,
  id: string,
  queryParams?: FetchByIdQueryParams<M, CN>
): ClientQuery<M, CN> {
  let query = ClientQueryBuilder(collectionName).entityId(id);
  if (queryParams?.include) {
    for (const [relation, subquery] of Object.entries(queryParams.include)) {
      if (subquery) query = query.include(relation, subquery);
      else query = query.include(relation);
    }
  }
  return query.build() as ClientQuery<M, CN>;
}
