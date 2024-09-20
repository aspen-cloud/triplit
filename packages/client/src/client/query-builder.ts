import {
  QUERY_INPUT_TRANSFORMERS,
  AfterInput,
  BuilderBase,
  FilterInput,
  OrderInput,
  CollectionQueryInclusion,
  CollectionQuerySelection,
  RelationAttributes,
  CollectionNameFromModels,
  Models,
  RelationSubquery,
  RefSubquery,
  RelationBuilder,
  InclusionByRName,
  relationBuilder,
  SchemaQueries,
  QueryResultCardinality,
  QuerySelection,
  ModelQueries,
} from '@triplit/db';
import {
  ClientSchema,
  ClientQuery,
  ClientQueryDefault,
  SyncStatus,
} from './types';

export function clientQueryBuilder<
  M extends ClientSchema,
  CN extends CollectionNameFromModels<M>
>(collectionName: CN, params?: Omit<ClientQuery<M, CN>, 'collectionName'>) {
  const query = {
    collectionName,
    ...params,
  };
  return new ClientQueryBuilder<M, CN, ClientQueryDefault<M, CN>>(query);
}

// The fact that builder methods will update generics makes it tough to re-use the builder from the db
// - DB builder returns specific type QueryBuilder<...Params>
// - The client builder needs to return ClientQueryBuilder<...Params>
// - cant return 'this' because we need to update generics
export class ClientQueryBuilder<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN> = ClientQueryDefault<M, CN>
> implements
    BuilderBase<
      ClientQuery<any, any, any, any>,
      'collectionName' | 'entityId',
      'id'
    >
{
  protected query: Q;
  constructor(query: Q) {
    this.query = query;
  }

  build() {
    return this.query;
  }

  select<Selection extends QuerySelection<M, CN>>(
    selection: Selection[] | undefined
  ) {
    return new ClientQueryBuilder({
      ...this.query,
      select: selection,
    }) as ClientQueryBuilder<
      M,
      CN,
      ClientQuery<M, CN, Selection, CollectionQueryInclusion<M, CN, Q>>
    >;
  }

  where(...args: FilterInput<M, CN>) {
    return new ClientQueryBuilder<M, CN, Q>({
      ...this.query,
      where: QUERY_INPUT_TRANSFORMERS<M, CN>().where(this.query, ...args),
    });
  }

  id(id: string) {
    const nextWhere = [
      ['id', '=', id],
      ...(this.query.where ?? []).filter(
        (w) => !Array.isArray(w) || w[0] !== 'id'
      ),
    ];
    return new ClientQueryBuilder<M, CN, Q>({
      ...this.query,
      where: nextWhere,
    });
  }

  order(...args: OrderInput<M, CN>) {
    return new ClientQueryBuilder<M, CN, Q>({
      ...this.query,
      order: QUERY_INPUT_TRANSFORMERS<M, CN>().order(this.query, ...args),
    });
  }

  after(after: AfterInput<M, CN>, inclusive?: boolean) {
    return new ClientQueryBuilder<M, CN, Q>({
      ...this.query,
      after: QUERY_INPUT_TRANSFORMERS<M, CN>().after(
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
    M,
    CN,
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<M, CN, Q>,
      CollectionQueryInclusion<M, CN, Q> & {
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
      rel: <RName extends RelationAttributes<M, CN>>(
        relationName: RName
      ) => RelationBuilder<M, CN, RName>
    ) => RQ
  ): ClientQueryBuilder<
    M,
    CN,
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<M, CN, Q>,
      CollectionQueryInclusion<M, CN, Q> & {
        [K in Alias]: RQ;
      }
    >
  >;
  /**
   * Include data from a relation in the query
   * @param relationName - the name of the relation to include
   */
  include<RName extends RelationAttributes<M, CN>>(
    relationName: RName
  ): ClientQueryBuilder<
    M,
    CN,
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<M, CN, Q>,
      CollectionQueryInclusion<M, CN, Q> & {
        [K in RName]: InclusionByRName<M, CN, RName>;
      }
    >
  >;
  include(relationName: any, queryExt?: any) {
    if (typeof queryExt === 'function') {
      queryExt = queryExt(relationBuilder);
    }
    return new ClientQueryBuilder<M, CN>({
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
    M,
    CN,
    ClientQuery<
      M,
      CN,
      CollectionQuerySelection<M, CN, Q>,
      CollectionQueryInclusion<M, CN, Q> & {
        [K in Alias]: RelationSubquery<M, PQ, Cardinality>;
      }
    >
  > {
    //@ts-expect-error
    return new ClientQueryBuilder<M, CN>({
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
    return new ClientQueryBuilder<M, CN, Q>({ ...this.query, limit });
  }

  vars(vars: Record<string, any>) {
    return new ClientQueryBuilder<M, CN, Q>({ ...this.query, vars });
  }

  syncStatus(status: SyncStatus) {
    return new ClientQueryBuilder<M, CN, Q>({
      ...this.query,
      syncStatus: status,
    });
  }
}
