import {
  CollectionNameFromModels,
  CollectionQuery,
  FetchByIdQueryParams,
  Models,
  QueryBuilder,
  ReturnTypeFromQuery,
  QuerySelectionValue,
  RelationSubquery,
  Unalias,
  QUERY_INPUT_TRANSFORMERS,
  ModelFromModels,
  AfterInput,
  BuilderBase,
  FilterInput,
  IncludeSubquery,
  InclusionFromArgs,
  OrderInput,
  CollectionQueryCollectionName,
  CollectionQueryInclusion,
  CollectionQueryModels,
  CollectionQuerySelection,
  RelationAttributes,
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

export type ClientSchema = Models<any, any>;

export type ClientFetchResultEntity<C extends ClientQuery<any, any, any, any>> =
  ReturnTypeFromQuery<C>;

export type SyncStatus = 'pending' | 'confirmed' | 'all';

export type Entity<
  M extends ClientSchema,
  CN extends CollectionNameFromModels<M>
> = Unalias<ReturnTypeFromQuery<ClientQueryDefault<M, CN>>>;

export type ClientQuery<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelectionValue<M, CN> = QuerySelectionValue<M, CN>,
  Inclusions extends Record<string, RelationSubquery<M, any>> = Record<
    string,
    RelationSubquery<M, any>
  >
> = {
  syncStatus?: SyncStatus;
} & CollectionQuery<M, CN, Selection, Inclusions>;

// The fact that builder methods will update generics makes it tough to re-use the builder from the db
// - DB builder returns specific type QueryBuilder<...Params>
// - The client builder needs to return ClientQueryBuilder<...Params>
// - cant return 'this' because we need to update generics
export class ClientQueryBuilder<
  Q extends ClientQuery<any, any, any, any>,
  M extends Models<any, any> | undefined = CollectionQueryModels<Q>,
  // @ts-expect-error
  CN extends CollectionNameFromModels<M> = CollectionQueryCollectionName<Q>
> implements
    BuilderBase<ClientQuery<any, any, any, any>, 'collectionName', 'id'>
{
  protected query: Q;
  constructor(query: Q) {
    this.query = query;
  }

  build() {
    return this.query;
  }

  select<Selection extends QuerySelectionValue<M, CN>>(
    selection: Selection[] | undefined
  ) {
    this.query = { ...this.query, select: selection };
    return this as ClientQueryBuilder<
      ClientQuery<M, CN, Selection, CollectionQueryInclusion<Q>>
    >;
  }

  where(...args: FilterInput<M, CN, any>) {
    this.query = {
      ...this.query,
      where: QUERY_INPUT_TRANSFORMERS<M, CN>().where(
        // @ts-expect-error
        this.query,
        ...args
      ),
    };
    return this;
  }

  id(id: string) {
    return this.where(
      // @ts-expect-error
      ['id', '=', id]
    );
  }

  order(...args: OrderInput<M, CN>) {
    this.query = {
      ...this.query,
      order: QUERY_INPUT_TRANSFORMERS<M, CN>().order(
        // @ts-expect-error

        this.query,
        ...args
      ),
    };
    return this;
  }

  after(after: AfterInput<M, CN>, inclusive?: boolean) {
    this.query = {
      ...this.query,
      after: QUERY_INPUT_TRANSFORMERS<M, CN>().after(
        // @ts-expect-error

        this.query,
        after,
        inclusive
      ),
    };
    return this;
  }

  include<RName extends string, SQ extends RelationSubquery<M, any>>(
    relationName: RName,
    query: RelationSubquery<M, any>
  ): ClientQueryBuilder<
    ClientQuery<
      M,
      CN,
      // @ts-expect-error TODO: not sure why this has error (maybe defaults)
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in RName]: SQ;
      }
    >
  >;
  include<RName extends RelationAttributes<ModelFromModels<M, CN>>>(
    relationName: RName,
    query?: IncludeSubquery<
      M,
      // @ts-expect-error Doesn't know that Model['RName'] is a query type
      ModelFromModels<M, CN>['properties'][RName]['query']['collectionName']
    >
  ): ClientQueryBuilder<
    ClientQuery<
      M,
      CN,
      // @ts-expect-error TODO: not sure why this has error (maybe defaults)
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in RName]: InclusionFromArgs<M, CN, RName, null>;
      }
    >
  >;
  include(relationName: any, query?: any): any {
    this.query = {
      ...this.query,
      include: QUERY_INPUT_TRANSFORMERS<M, CN>().include(
        // @ts-expect-error
        this.query,
        relationName,
        query
      ),
    };
    return this;
  }

  limit(limit: number) {
    this.query = { ...this.query, limit };
    return this;
  }

  vars(vars: Record<string, any>) {
    this.query = { ...this.query, vars };
    return this;
  }

  /**
   * @deprecated Use 'id()' instead.
   */
  entityId(entityId: string) {
    return this.id(entityId);
  }

  syncStatus(status: SyncStatus) {
    this.query.syncStatus = status;
    return this;
  }
}

export type ClientQueryDefault<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>
> = ClientQuery<M, CN, QuerySelectionValue<M, CN>, {}>;

export function clientQueryBuilder<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>
>(collectionName: CN, params?: Omit<ClientQuery<M, CN>, 'collectionName'>) {
  const query = {
    collectionName,
    ...params,
  };
  return new ClientQueryBuilder<ClientQueryDefault<M, CN>>(query);
}

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
  return new QueryBuilder<
    CollectionQuery<M, CN, QuerySelectionValue<M, CN>, {}>
  >(query);
}

export function prepareFetchOneQuery<CQ extends ClientQuery<any, any>>(
  query: CQ
): CQ {
  return { ...query, limit: 1 };
}

export function prepareFetchByIdQuery<
  M extends ClientSchema | undefined,
  CN extends CollectionNameFromModels<M>
>(collectionName: CN, id: string, queryParams?: FetchByIdQueryParams<M, CN>) {
  let query = clientQueryBuilder<M, CN>(collectionName).entityId(id);
  if (queryParams?.include) {
    for (const [relation, subquery] of Object.entries(queryParams.include)) {
      if (subquery) {
        query = query.include(relation, subquery);
      } else {
        // @ts-expect-error TODO: fixup builder type
        query = query.include(relation);
      }
    }
  }
  return query.build();
}
