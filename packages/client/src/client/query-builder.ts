import {
  QUERY_INPUT_TRANSFORMERS,
  ModelFromModels,
  AfterInput,
  BuilderBase,
  FilterInput,
  IncludeSubquery,
  OrderInput,
  CollectionQueryCollectionName,
  CollectionQueryInclusion,
  CollectionQueryModels,
  CollectionQuerySelection,
  RelationAttributes,
  CollectionNameFromModels,
  QuerySelectionValue,
  Models,
  RelationSubquery,
  RefSubquery,
  RelationBuilder,
  InclusionByRName,
  relationBuilder,
  SchemaQueries,
  QueryResultCardinality,
} from '@triplit/db';
import {
  ClientSchema,
  ClientQuery,
  ClientQueryDefault,
  SyncStatus,
} from './types';

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

  select<Selection extends ReadonlyArray<QuerySelectionValue<M, CN>>>(
    selection: Selection | undefined
  ) {
    return new ClientQueryBuilder({
      ...this.query,
      select: selection,
    }) as ClientQueryBuilder<
      ClientQuery<M, CN, Selection, CollectionQueryInclusion<Q>>
    >;
  }

  where(...args: FilterInput<M, CN>) {
    return new ClientQueryBuilder<Q>({
      ...this.query,
      where: QUERY_INPUT_TRANSFORMERS<M, CN>().where(
        // @ts-expect-error
        this.query,
        ...args
      ),
    });
  }

  id(id: string) {
    const nextWhere = [
      ['id', '=', id],
      ...(this.query.where ?? []).filter(
        (w) => !Array.isArray(w) || w[0] !== 'id'
      ),
    ];
    return new ClientQueryBuilder<Q>({
      ...this.query,
      where: nextWhere,
    });
  }

  order(...args: OrderInput<M, CN>) {
    return new ClientQueryBuilder<Q>({
      ...this.query,
      order: QUERY_INPUT_TRANSFORMERS<M, CN>().order(
        // @ts-expect-error

        this.query,
        ...args
      ),
    });
  }

  after(after: AfterInput<M, CN>, inclusive?: boolean) {
    return new ClientQueryBuilder<Q>({
      ...this.query,
      after: QUERY_INPUT_TRANSFORMERS<M, CN>().after(
        // @ts-expect-error

        this.query,
        after,
        inclusive
      ),
    });
  }

  /**
   * Include data from a relation in the query and extend the relation with additional query parameters
   * @param alias - the alias to use for the included relation
   * @param queryExt - the query to extend the included relation
   */
  include<Alias extends string, RQ extends RefSubquery<M, CN>>(
    alias: Alias,
    queryExt: RQ
  ): ClientQueryBuilder<
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in Alias]: RQ;
      }
    >
  >;
  /**
   * Include data from a relation in the query and extend the relation with additional query parameters
   * @param alias - the alias to use for the included relation
   * @param builder - a function returning a query builder to extend the included relation
   */
  include<Alias extends string, RQ extends RefSubquery<M, CN>>(
    alias: Alias,
    builder: (
      rel: <RName extends RelationAttributes<ModelFromModels<M, CN>>>(
        relationName: RName
      ) => RelationBuilder<M, CN, RName>
    ) => RQ
  ): ClientQueryBuilder<
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in Alias]: RQ;
      }
    >
  >;
  /**
   * Include data from a relation in the query
   * @param relationName - the name of the relation to include
   */
  include<RName extends RelationAttributes<ModelFromModels<M, CN>>>(
    relationName: RName
  ): ClientQueryBuilder<
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in RName]: InclusionByRName<M, CN, RName>;
      }
    >
  >;
  include(relationName: any, queryExt?: any) {
    if (typeof queryExt === 'function') {
      queryExt = queryExt(relationBuilder);
    }
    return new ClientQueryBuilder<ClientQuery<any, any, any, any>>({
      ...this.query,
      include: QUERY_INPUT_TRANSFORMERS<M, CN>().include(
        this.query,
        relationName,
        queryExt
      ),
    });
  }

  subquery<
    Alias extends string,
    PQ extends SchemaQueries<M>,
    Cardinality extends QueryResultCardinality = 'many'
  >(
    relationName: Alias,
    query: PQ,
    cardinality: Cardinality = 'many' as Cardinality
  ): ClientQueryBuilder<
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in Alias]: RelationSubquery<M, PQ, Cardinality>;
      }
    >
  > {
    //@ts-expect-error
    return new ClientQueryBuilder<ClientQuery<any, any, any, any>>({
      ...this.query,
      include: QUERY_INPUT_TRANSFORMERS<M, CN>().include(
        this.query,
        relationName,
        {
          subquery: query,
          cardinality,
        }
      ),
    });
  }

  limit(limit: number) {
    return new ClientQueryBuilder<Q>({ ...this.query, limit });
  }

  vars(vars: Record<string, any>) {
    return new ClientQueryBuilder<Q>({ ...this.query, vars });
  }

  /**
   * @deprecated Use 'id()' instead.
   */
  entityId(entityId: string) {
    return this.id(entityId);
  }

  syncStatus(status: SyncStatus) {
    return new ClientQueryBuilder<Q>({ ...this.query, syncStatus: status });
  }
}
