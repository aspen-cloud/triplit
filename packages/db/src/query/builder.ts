import { Models, Path, RelationAttributes, SchemaPaths } from '../schema/types';
import {
  CollectionQuery,
  FilterStatement,
  Query,
  QueryOrder,
  QuerySelection,
  QueryValue,
  QueryWhere,
  ValueCursor,
  WhereFilter,
} from '../query.js';
import { CollectionNameFromModels, ModelFromModels } from '../db.js';
import { BuilderBase } from '../utility-types.js';
import { ReturnTypeFromQuery } from '../collection-query.js';
import {
  AfterClauseWithNoOrderError,
  QueryClauseFormattingError,
} from '../errors.js';

export class QueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Q extends CollectionQuery<M, CN>
> implements BuilderBase<CollectionQuery<M, CN>, 'collectionName'>
{
  protected query: Q;
  constructor(query: Q) {
    this.query = query;
  }

  build() {
    return this.query;
  }

  select<Selection extends QuerySelection<M, CN> | undefined>(
    selection: Selection
  ) {
    this.query = { ...this.query, select: selection };

    // TODO: I think this is going to break higher level builders, ensure it doenst (@triplit/react probably has error)
    // @ts-expect-error
    return this as QueryBuilder<M, CN, CollectionQuery<M, CN, Selection>>;
  }

  where(...args: FilterInput<M, CN, any>) {
    this.query = {
      ...this.query,
      where: QUERY_INPUT_TRANSFORMERS<M, CN>().where(this.query, ...args),
    };
    return this;
  }

  order(...args: OrderInput<M, CN>) {
    this.query = {
      ...this.query,
      order: QUERY_INPUT_TRANSFORMERS<M, CN>().order(this.query, ...args),
    };
    return this;
  }

  after(after: AfterInput<M, CN>, inclusive?: boolean) {
    this.query = {
      ...this.query,
      after: QUERY_INPUT_TRANSFORMERS<M, CN>().after(
        this.query,
        after,
        inclusive
      ),
    };
    return this;
  }

  include<
    RName extends M extends Models<any, any>
      ? RelationAttributes<ModelFromModels<M, CN>>
      : never
  >(relationName: RName, query?: Query<M, RName>) {
    this.query = {
      ...this.query,
      include: QUERY_INPUT_TRANSFORMERS<M, CN>().include(
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

  entityId(entityId: string) {
    this.query = { ...this.query, entityId };
    return this;
  }
}

type SelectInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = QuerySelection<M, CN> | undefined;

type FilterInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  P extends M extends Models<any, any> ? SchemaPaths<M, CN> : Path
> =
  | [typeof undefined]
  | FilterStatement<M, CN, P>
  | [FilterStatement<M, CN, P>]
  | WhereFilter<M, CN>[]
  | [QueryWhere<M, CN>];

type OrderInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = QueryOrder<M, CN> | QueryOrder<M, CN>[] | [QueryOrder<M, CN>[]];

type AfterInput<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> =
  | ValueCursor
  | (M extends Models<any, any> ? ReturnTypeFromQuery<M, CN> : undefined)
  | undefined;

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
