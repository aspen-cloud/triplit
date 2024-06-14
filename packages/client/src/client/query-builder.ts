import {
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
  CollectionNameFromModels,
  QuerySelectionValue,
  Models,
  RelationSubquery,
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
