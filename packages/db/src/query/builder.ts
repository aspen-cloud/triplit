import { Models, RelationAttributes } from '../schema/types/index.js';
import { CollectionNameFromModels, ModelFromModels } from '../db.js';
import {
  AfterClauseWithNoOrderError,
  QueryClauseFormattingError,
} from '../errors.js';
import {
  CollectionQueryInclusion,
  CollectionQuerySelection,
  BuilderBase,
  FilterInput,
  OrderInput,
  AfterInput,
  InclusionByRName,
  CollectionQuery,
  FilterStatement,
  QueryOrder,
  QueryValue,
  QueryWhere,
  ValueCursor,
  RelationSubquery,
  OrderStatement,
  SchemaQueries,
  QueryResultCardinality,
  RefSubquery,
  RefQueryExtension,
  QueryInclusions,
  RefCollectionName,
  QuerySelection,
  CollectionQueryDefault,
  KeyedModelQueries,
  ModelQueries,
} from './types/index.js';

export class QueryBuilder<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN> = CollectionQueryDefault<M, CN>,
> implements
    BuilderBase<CollectionQuery<M, CN>, 'collectionName' | 'entityId', 'id'>
{
  protected query: Q;
  constructor(query: Q) {
    this.query = query;
  }

  build() {
    return this.query;
  }

  select<Selection extends QuerySelection<M, CN>>(
    selection: ReadonlyArray<Selection> | undefined
  ) {
    return new QueryBuilder({
      ...this.query,
      select: selection,
    }) as QueryBuilder<
      M,
      CN,
      CollectionQuery<M, CN, Selection, CollectionQueryInclusion<M, CN, Q>>
    >;
  }

  where(...args: FilterInput<M, CN>) {
    return new QueryBuilder<M, CN, Q>({
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
    return new QueryBuilder<M, CN, Q>({
      ...this.query,
      where: nextWhere,
    });
  }

  order(...args: OrderInput<M, CN>) {
    return new QueryBuilder<M, CN, Q>({
      ...this.query,
      order: QUERY_INPUT_TRANSFORMERS<M, CN>().order(this.query, ...args),
    });
  }

  after(after: AfterInput<M, CN>, inclusive?: boolean) {
    return new QueryBuilder<M, CN, Q>({
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
  ): QueryBuilder<
    M,
    CN,
    CollectionQuery<
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
  ): QueryBuilder<
    M,
    CN,
    CollectionQuery<
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
  ): QueryBuilder<
    M,
    CN,
    CollectionQuery<
      M,
      CN,
      CollectionQuerySelection<M, CN, Q>,
      CollectionQueryInclusion<M, CN, Q> & {
        [K in RName]: true; //InclusionByRName<M, CN, RName>;
      }
    >
  >;
  include(relationName: any, queryExt?: any): any {
    if (typeof queryExt === 'function') {
      queryExt = queryExt(relationBuilder);
    }
    return new QueryBuilder<M, CN>({
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
    Cardinality extends QueryResultCardinality = 'many',
  >(
    relationName: Alias,
    query: PQ,
    cardinality: Cardinality = 'many' as Cardinality
  ): QueryBuilder<
    M,
    CN,
    CollectionQuery<
      M,
      CN,
      CollectionQuerySelection<M, CN, Q>,
      CollectionQueryInclusion<M, CN, Q> & {
        [K in Alias]: RelationSubquery<M, PQ, Cardinality>;
      }
    >
  > {
    return new QueryBuilder<
      M,
      CN,
      CollectionQuery<
        M,
        CN,
        CollectionQuerySelection<M, CN, Q>,
        CollectionQueryInclusion<M, CN, Q> & {
          [K in Alias]: RelationSubquery<M, PQ, Cardinality>;
        }
      >
    >({
      ...this.query,
      // @ts-expect-error
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
    return new QueryBuilder<M, CN, Q>({ ...this.query, limit });
  }

  vars(vars: Record<string, any>) {
    return new QueryBuilder<M, CN, Q>({ ...this.query, vars });
  }
}

export function relationBuilder<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  RName extends RelationAttributes<M, CN>,
>(relationName: RName) {
  return new RelationBuilder<M, CN, RName>(relationName);
}

export class RelationBuilder<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  RName extends RelationAttributes<M, CN>,
  RelSelection extends QuerySelection<
    M,
    RefCollectionName<M, CN, RName>
  > = QuerySelection<M, RefCollectionName<M, CN, RName>>,
  RelInclusions extends QueryInclusions<
    M,
    RefCollectionName<M, CN, RName>
  > = {},
> {
  private relationName: RName;
  private ext: RefQueryExtension<
    M,
    CN,
    CollectionQuery<
      M,
      RefCollectionName<M, CN, RName>,
      RelSelection,
      RelInclusions
    >
  >;
  constructor(relationName: RName) {
    this.relationName = relationName;
    this.ext = {};
  }

  build() {
    return {
      _rel: this.relationName,
      ...this.ext,
    };
  }

  select<Selection extends QuerySelection<M, RefCollectionName<M, CN, RName>>>(
    selection: ReadonlyArray<Selection>
  ) {
    // @ts-expect-error
    this.ext.select = selection;
    return this as RelationBuilder<M, CN, RName, Selection, RelInclusions>;
  }

  order(...args: OrderInput<M, RefCollectionName<M, CN, RName>>) {
    this.ext.order = QUERY_INPUT_TRANSFORMERS<M, CN>().order(this.ext, ...args);
    return this;
  }

  where(...args: FilterInput<M, CN, RefCollectionName<M, CN, RName>>) {
    this.ext.where = QUERY_INPUT_TRANSFORMERS<M, CN>().where(this.ext, ...args);
    return this;
  }

  limit(limit: number) {
    this.ext.limit = limit;
    return this;
  }

  include<
    Alias extends string,
    RQ extends RefSubquery<M, RefCollectionName<M, CN, RName>>,
  >(
    alias: Alias,
    refQuery: RQ
  ): RelationBuilder<
    M,
    CN,
    RName,
    RelSelection,
    RelInclusions & { [K in Alias]: RQ }
  >;
  include<
    Alias extends string,
    RQ extends RefSubquery<M, RefCollectionName<M, CN, RName>>,
  >(
    alias: Alias,
    builder: (
      rel: <
        InclusionRName extends RelationAttributes<
          M,
          RefCollectionName<M, CN, RName>
        >,
      >(
        relationName: InclusionRName
      ) => RelationBuilder<M, RefCollectionName<M, CN, RName>, InclusionRName>
    ) => RQ
  ): RelationBuilder<
    M,
    CN,
    RName,
    RelSelection,
    RelInclusions & { [K in Alias]: RQ }
  >;
  // @ts-expect-error
  include<Alias extends RelationAttributes<M, RefCollectionName<M, CN, RName>>>(
    alias: Alias
  ): RelationBuilder<
    M,
    CN,
    RName,
    RelSelection,
    RelInclusions & {
      [K in Alias]: InclusionByRName<M, RefCollectionName<M, CN, RName>, Alias>;
    }
  >;
  include(alias: any, queryExt?: any) {
    if (typeof queryExt === 'function') {
      queryExt = queryExt(relationBuilder);
    }
    // @ts-expect-error
    this.ext.include = QUERY_INPUT_TRANSFORMERS<M, CN>().include(
      this.ext,
      alias,
      queryExt
    );
    return this;
  }
}

export type QUERY_INPUT_TRANSFORMERS<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = ReturnType<typeof QUERY_INPUT_TRANSFORMERS<M, CN>>;

// TODO: add functional type guards for conditionals
export const QUERY_INPUT_TRANSFORMERS = <
  M extends Models,
  CN extends CollectionNameFromModels<M>,
>() => ({
  where: <A extends FilterInput<M, CN, any>>(
    q: Pick<CollectionQuery<M, CN>, 'where'>,
    ...args: A
  ): QueryWhere<M, CN> => {
    let newWhere: QueryWhere<M, CN> = [];
    if (args[0] == undefined) return q.where ?? [];
    if (typeof args[0] === 'boolean') {
      newWhere = [args[0]];
    } else if (typeof args[0] === 'string') {
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
    q: Pick<CollectionQuery<M, CN>, 'order'>,
    ...args: OrderInput<M, CN>
  ): QueryOrder<M, CN> | undefined => {
    if (!args[0]) return undefined;
    let newOrder: QueryOrder<M, CN> = [];
    /**
     * E.g. order("id", "ASC")
     */
    if (
      args.length === 2 &&
      (args as any[]).every((arg) => typeof arg === 'string')
    ) {
      newOrder = [[...args] as OrderStatement<M, CN>];
    } else if (
      /**
       * E.g. order([["id", "ASC"], ["name", "DESC"]])
       */
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((arg) => arg instanceof Array)
    ) {
      newOrder = args[0] as NonNullable<QueryOrder<M, CN>>;
    } else if (args.every((arg) => arg instanceof Array)) {
      /**
       * E.g. order(["id", "ASC"], ["name", "DESC"])
       */
      newOrder = args as NonNullable<QueryOrder<M, CN>>;
    } else {
      throw new QueryClauseFormattingError('order', args);
    }
    return [...(q.order ?? []), ...newOrder];
  },
  include<Alias extends string>(
    q: Pick<CollectionQuery<M, CN>, 'include'>,
    alias: Alias,
    query?: any
  ): Record<string, any> {
    // TODO: include should be typed as a set of subqueries
    return {
      ...q.include,
      // Set to null so the inclusion of the key can be serialized
      [alias]: query ?? null,
    };
  },
  after(
    q: Pick<CollectionQuery<M, CN>, 'after' | 'order'>,
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
        // @ts-expect-error TODO: properly type this
        // Maybe even sunset this and only use ValueCursor format
        [after[attributeToOrderBy] as QueryValue, after.id as string],
        inclusive ?? false,
      ];
    }
    throw new QueryClauseFormattingError('after', after);
  },
});
