import { Models, RelationAttributes } from '../schema/types';
import {
  CollectionQuery,
  FilterStatement,
  Query,
  QueryOrder,
  QuerySelectionValue,
  QueryValue,
  QueryWhere,
  ValueCursor,
  RelationSubquery,
} from '../query.js';
import { CollectionNameFromModels, ModelFromModels } from '../db.js';
import {
  AfterClauseWithNoOrderError,
  QueryClauseFormattingError,
} from '../errors.js';
import {
  CollectionQueryCollectionName,
  CollectionQueryInclusion,
  CollectionQueryModels,
  CollectionQuerySelection,
  BuilderBase,
  FilterInput,
  OrderInput,
  AfterInput,
  IncludeSubquery,
  InclusionFromArgs,
} from './types';

export class QueryBuilder<
  Q extends CollectionQuery<any, any, any, any>,
  M extends Models<any, any> | undefined = CollectionQueryModels<Q>,
  // @ts-expect-error
  CN extends CollectionNameFromModels<M> = CollectionQueryCollectionName<Q>
> implements BuilderBase<CollectionQuery<any, any>, 'collectionName', 'id'>
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
    return this as QueryBuilder<
      CollectionQuery<M, CN, Selection, CollectionQueryInclusion<Q>>
    >;
  }

  where(...args: FilterInput<M, CN>) {
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
  ): QueryBuilder<
    CollectionQuery<
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
  ): QueryBuilder<
    CollectionQuery<
      M,
      CN,
      // @ts-expect-error TODO: not sure why this has error (maybe defaults)
      CollectionQuerySelection<Q>,
      CollectionQueryInclusion<Q> & {
        [K in RName]: InclusionFromArgs<M, CN, RName, null>;
      }
    >
  >;
  include(relationName: any, query?: any) {
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
}

export type QUERY_INPUT_TRANSFORMERS<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = ReturnType<typeof QUERY_INPUT_TRANSFORMERS<M, CN>>;

// TODO: add functional type guards for conditionals
export const QUERY_INPUT_TRANSFORMERS = <
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>() => ({
  where: <A extends FilterInput<M, CN, any>>(
    q: Query<M, CN>,
    ...args: A
  ): QueryWhere<M, CN> => {
    let newWhere: QueryWhere<M, CN> = [];
    if (args[0] == undefined) return q.where ?? [];
    if (typeof args[0] === 'string') {
      /**
       * E.g. where("id", "=", "123")
       */
      newWhere = [args as FilterStatement<M, CN>];
    } else if (
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((filter) => typeof filter === 'object')
    ) {
      /**
       *  E.g. where([["id", "=", "123"], ["name", "=", "foo"]])
       */
      newWhere = args[0] as FilterStatement<M, CN>[];
    } else if (args.every((arg) => typeof arg === 'object')) {
      /**
       * E.g. where(["id", "=", "123"], ["name", "=", "foo"]);
       */
      newWhere = args as QueryWhere<M, CN>;
    } else {
      throw new QueryClauseFormattingError('where', args);
    }
    return [...(q.where ?? []), ...newWhere];
  },
  order: (
    q: Query<M, CN>,
    ...args: OrderInput<M, CN>
  ): QueryOrder<M, CN>[] | undefined => {
    if (!args[0]) return undefined;
    let newOrder: QueryOrder<M, CN>[] = [];
    /**
     * E.g. order("id", "ASC")
     */
    if (
      args.length === 2 &&
      (args as any[]).every((arg) => typeof arg === 'string')
    ) {
      newOrder = [[...args] as QueryOrder<M, CN>];
    } else if (
      /**
       * E.g. order([["id", "ASC"], ["name", "DESC"]])
       */
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((arg) => arg instanceof Array)
    ) {
      newOrder = args[0] as NonNullable<Query<M, CN>['order']>;
    } else if (args.every((arg) => arg instanceof Array)) {
      /**
       * E.g. order(["id", "ASC"], ["name", "DESC"])
       */
      newOrder = args as NonNullable<Query<M, CN>['order']>;
    } else {
      throw new QueryClauseFormattingError('order', args);
    }
    return [...(q.order ?? []), ...newOrder];
  },
  include<
    RName extends M extends Models<any, any>
      ? RelationAttributes<ModelFromModels<M, CN>>
      : never
  >(
    q: Query<M, CN>,
    relationName: RName,
    query?: Query<M, RName>
  ): Record<string, any> {
    // TODO: include should be typed as a set of subqueries
    return {
      ...q.include,
      // Set to null so the inclusion of the key can be serialized
      [relationName]: query ?? null,
    };
  },
  after(
    q: Query<M, CN>,
    after: AfterInput<M, CN>,
    inclusive?: boolean
  ): [ValueCursor, boolean] | undefined {
    if (!after) return undefined;
    if (!q.order) throw new AfterClauseWithNoOrderError(after);
    const attributeToOrderBy = q.order[0][0];
    if (after instanceof Array && after.length === 2)
      return [after, inclusive ?? false];
    if (
      typeof after === 'object' &&
      !(after instanceof Array) &&
      Object.hasOwn(after, 'id') &&
      Object.hasOwn(after, attributeToOrderBy)
    ) {
      return [
        [after[attributeToOrderBy] as QueryValue, after.id as string],
        inclusive ?? false,
      ];
    }
    throw new QueryClauseFormattingError('after', after);
  },
});
