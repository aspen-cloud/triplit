import {
  AfterClauseWithNoOrderError,
  QueryClauseFormattingError,
} from './errors.js';
import { isFilterStatement, isIdFilter, isWhereFilter } from './filters.js';
import {
  CollectionQuery,
  FilterStatement,
  ModelFilterStatement,
  OrderStatement,
  QueryOrder,
  QueryResultCardinality,
  QuerySelectionFromQuery,
  QueryWhere,
  RefCollectionName,
  RefSubquery,
  RelationshipRef,
  RelationSubquery,
  SchemaQuery,
  ValueCursor,
  WithInclusion,
  WithInclusionRaw,
  WithSelection,
} from './query.js';
import { CollectionNameFromModels, Models } from './schema/index.js';
import { ValuePointer } from './utils/value-pointer.js';

export function queryBuilder<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>(collectionName: CN) {
  return new QueryBuilder<M, CN>(collectionName);
}

export class QueryBuilder<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  // When you init the builder, default to no inclusions
  Q extends CollectionQuery<M, CN> = WithInclusion<CollectionQuery<M, CN>, {}>,
> implements CollectionQuery<M, CN>
{
  collectionName: CN;
  select: Q['select'] = undefined;
  where: Q['where'] = undefined;
  limit: Q['limit'] = undefined;
  order: Q['order'] = undefined;
  include: Q['include'] = undefined;
  after: Q['after'] = undefined;
  vars: Q['vars'] = undefined;

  constructor(collectionName: CN, query?: Omit<Q, 'collectionName'>) {
    this.collectionName = collectionName;
    if (query) {
      this.select = query.select;
      this.where = query.where;
      this.limit = query.limit;
      this.order = query.order;
      this.include = query.include;
      this.after = query.after;
      this.vars = query.vars;
    }
  }

  Select<Selection extends QuerySelectionFromQuery<Q>>(
    value: ReadonlyArray<Selection> | undefined
  ): QueryBuilder<M, CN, WithSelection<Q, Selection>> {
    const select = value;
    return new QueryBuilder<M, CN, WithSelection<Q, Selection>>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        select,
      }
    );
  }

  Where(...args: FilterInput<M, CN>) {
    const where = QUERY_INPUT_TRANSFORMERS<M, CN>().where(this, ...args);
    return new QueryBuilder<M, CN, Q>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        where,
      }
    );
  }

  Id(value: string) {
    const where = this.where ? this.where.filter((f) => !isIdFilter(f)) : [];
    where.push(
      // @ts-expect-error
      ['id', '=', value]
    );
    return new QueryBuilder<M, CN, Q>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        where,
      }
    );
  }

  Limit(value: number) {
    const limit = value;
    return new QueryBuilder<M, CN, Q>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        limit,
      }
    );
  }

  Order(...args: OrderInput<M, CN>) {
    const order = QUERY_INPUT_TRANSFORMERS<M, CN>().order(this, ...args);
    return new QueryBuilder<M, CN, Q>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        order,
      }
    );
  }

  After(value: AfterInput<M, CN>, inclusive?: boolean) {
    const after = QUERY_INPUT_TRANSFORMERS<M, CN>().after(
      this,
      value,
      inclusive
    );
    return new QueryBuilder<M, CN, Q>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        after,
      }
    );
  }

  Vars(value: Record<string, any>) {
    const vars = value;
    return new QueryBuilder<M, CN, Q>(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        vars,
      }
    );
  }

  Include<
    Alias extends RelationshipRef<M, CN>,
    RQ extends RefSubquery<M, CN, Alias>,
  >(
    alias: Alias,
    queryExt: RQ
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: RQ }
    >
  >;
  Include<Alias extends string, RQ extends RefSubquery<M, CN>>(
    alias: Alias,
    builder: (
      rel: <Ref extends RelationshipRef<M, CN>>(
        ref: Ref
      ) => RelationBuilder<M, CN, Ref>
    ) => RQ
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: RQ }
    >
  >;
  Include<Alias extends RelationshipRef<M, CN>>(
    alias: Alias
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: null }
    >
  >;
  Include(alias: any, queryExt?: any): any {
    if (typeof queryExt === 'function') {
      queryExt = queryExt(relationBuilder);
    }
    const include = QUERY_INPUT_TRANSFORMERS<M, CN>().include(
      this,
      alias,
      queryExt
    );
    return new QueryBuilder(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        include,
      }
    );
  }

  SubqueryOne<Alias extends string, SQ extends SchemaQuery<M>>(
    alias: Alias,
    subquery: SQ
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: RelationSubquery<M, SQ, 'one'> }
    >
  >;
  SubqueryOne<Alias extends string, SQ extends SchemaQuery<M>>(
    alias: Alias,
    subquery: (
      sub: <CName extends CollectionNameFromModels<M>>(
        collectionName: CName
      ) => QueryBuilder<M, CName>
    ) => SQ
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: RelationSubquery<M, SQ, 'one'> }
    >
  >;
  SubqueryOne(alias: any, subquery: any): any {
    if (typeof subquery === 'function') {
      subquery = subquery(queryBuilder);
    }
    const include = QUERY_INPUT_TRANSFORMERS<M, CN>().include(this, alias, {
      subquery,
      cardinality: 'one',
    });
    return new QueryBuilder(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        include,
      }
    );
  }
  SubqueryMany<Alias extends string, SQ extends SchemaQuery<M>>(
    alias: Alias,
    subquery: SQ
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: RelationSubquery<M, SQ, 'many'> }
    >
  >;
  SubqueryMany<Alias extends string, SQ extends SchemaQuery<M>>(
    alias: Alias,
    subquery: (
      sub: <CName extends CollectionNameFromModels<M>>(
        collectionName: CName
      ) => QueryBuilder<M, CName>
    ) => SQ
  ): QueryBuilder<
    M,
    CN,
    WithInclusion<
      Q,
      // @ts-expect-error
      Q['include'] & { [K in Alias]: RelationSubquery<M, SQ, 'many'> }
    >
  >;
  SubqueryMany(alias: any, subquery: any): any {
    if (typeof subquery === 'function') {
      subquery = subquery(queryBuilder);
    }
    const include = QUERY_INPUT_TRANSFORMERS<M, CN>().include(this, alias, {
      subquery,
      cardinality: 'many',
    });
    return new QueryBuilder(
      this.collectionName,
      // @ts-expect-error
      {
        ...this,
        include,
      }
    );
  }
}

export function relationBuilder<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN>,
>(ref: Ref) {
  return new RelationBuilder<M, CN, Ref>(ref);
}

export class RelationBuilder<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN> = RelationshipRef<M, CN>,
  RQ extends RefSubquery<M, CN, Ref> = WithInclusionRaw<
    RefSubquery<M, CN, Ref>,
    {}
  >,
> implements RefSubquery<M, CN, Ref>
{
  _extends: Ref;
  select: RQ['select'] = undefined;
  where: RQ['where'] = undefined;
  limit: RQ['limit'] = undefined;
  order: RQ['order'] = undefined;
  include: RQ['include'] = undefined;

  constructor(ref: Ref, query?: RQ) {
    this._extends = ref;
    if (query) {
      this.select = query.select;
      this.where = query.where;
      this.limit = query.limit;
      this.order = query.order;
      this.include = query.include;
    }
  }

  // TODO: add back include
  // TOOD: fixup types once you have included return types set up

  Select<Selection extends NonNullable<RQ['select']>[number]>(
    value: Selection[]
  ): RelationBuilder<
    M,
    CN,
    Ref,
    WithSelection<
      // @ts-expect-error
      RQ,
      Selection
    >
  > {
    const select = value;
    return new RelationBuilder<
      M,
      CN,
      Ref,
      WithSelection<
        // @ts-expect-error
        RQ,
        Selection
      >
    >(
      this._extends,
      // @ts-expect-error
      {
        ...this,
        select,
      }
    );
  }

  Where(...args: FilterInput<M, RefCollectionName<M, CN, Ref>>) {
    const where = QUERY_INPUT_TRANSFORMERS<
      M,
      RefCollectionName<M, CN, Ref>
    >().where(this, ...args);
    return new RelationBuilder<M, CN, Ref, RQ>(
      this._extends,
      // @ts-expect-error
      {
        ...this,
        where,
      }
    );
  }

  Id(id: string) {
    const where = this.where ? this.where.filter((f) => !isIdFilter(f)) : [];
    where.push(
      // @ts-expect-error
      ['id', '=', id]
    );
    return new RelationBuilder<M, CN, Ref, RQ>(
      this._extends,
      // @ts-expect-error
      {
        ...this,
        where,
      }
    );
  }

  Limit(value: number) {
    const limit = value;
    return new RelationBuilder<M, CN, Ref, RQ>(
      this._extends,
      // @ts-expect-error
      {
        ...this,
        limit,
      }
    );
  }

  Order(...args: OrderInput<M, RefCollectionName<M, CN, Ref>>) {
    const order = QUERY_INPUT_TRANSFORMERS<
      M,
      RefCollectionName<M, CN, Ref>
    >().order(this, ...args);
    return new RelationBuilder<M, CN, Ref, RQ>(
      this._extends,
      // @ts-expect-error
      {
        ...this,
        order,
      }
    );
  }

  Include<
    Alias extends string,
    NextRQ extends RefSubquery<M, RefCollectionName<M, CN, Ref>>,
  >(
    alias: Alias,
    queryExt: NextRQ
  ): RelationBuilder<
    M,
    CN,
    Ref,
    WithInclusionRaw<RQ, RQ['include'] & { [K in Alias]: RQ }>
  >;
  Include<
    Alias extends string,
    NextRQ extends RefSubquery<M, RefCollectionName<M, CN, Ref>>,
  >(
    alias: Alias,
    builder: (
      rel: <NextRef extends RelationshipRef<M, RefCollectionName<M, CN, Ref>>>(
        ref: NextRef
      ) => RelationBuilder<M, RefCollectionName<M, CN, Ref>, NextRef>
    ) => NextRQ
  ): RelationBuilder<
    M,
    CN,
    Ref,
    WithInclusionRaw<RQ, RQ['include'] & { [K in Alias]: NextRQ }>
  >;
  Include<Alias extends RelationshipRef<M, RefCollectionName<M, CN, Ref>>>(
    alias: Alias
  ): RelationBuilder<
    M,
    CN,
    Ref,
    WithInclusionRaw<RQ, RQ['include'] & { [K in Alias]: null }>
  >;
  Include(alias: any, queryExt?: any): any {
    if (typeof queryExt === 'function') {
      queryExt = queryExt(relationBuilder);
    }
    const include = QUERY_INPUT_TRANSFORMERS<M, CN>().include(
      this,
      alias,
      queryExt
    );
    return new RelationBuilder<M, CN, Ref, WithInclusionRaw<RQ, RQ['include']>>(
      this._extends,
      // @ts-expect-error
      {
        ...this,
        include,
      }
    );
  }

  // TODO: add subquery apis
}

type RelationshipRefFromQuery<Q extends CollectionQuery<any, any>> =
  Q extends CollectionQuery<infer M, infer CN> ? RelationshipRef<M, CN> : never;

/**
 * Input for builder where() clauses
 */
export type FilterInput<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> =
  // .Where(undefined)
  | [typeof undefined]
  // .Where("id", "=", "123")
  | ModelFilterStatement<M, CN>
  // .Where(["id", "=", "123"], ["name", "=", "foo"])
  | QueryWhere<M, CN>
  // .Where(ternary ? ["id", "=", "123"] : undefined)
  | [QueryWhere<M, CN>[number] | undefined]
  // .Where([["id", "=", "123"], ["name", "=", "foo"]])
  | [QueryWhere<M, CN>];

/**
 * Input for builder order() clauses
 */
export type OrderInput<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> =
  | [typeof undefined]
  | OrderStatement<M, CN>
  | QueryOrder<M, CN>
  // Handle ternary
  | [QueryOrder<M, CN>[number] | undefined]
  | [QueryOrder<M, CN>];

/**
 * Input for builder after() clauses
 */
export type AfterInput<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
> = ValueCursor | undefined; // FetchResultEntity<CollectionQueryDefault<M, CN>>

// /**
//  * Helper type to extract the subquery information from a relation name based on include() inputs
//  */
// export type InclusionByRName<
//   M extends Models,
//   CN extends CollectionNameFromModels<M>,
//   RName extends RelationAttributes<M, CN>,
// > = RelationSubquery<
//   M,
//   ToQuery<M, RefQuery<M, CN, RName>>,
//   Ref<M, CN, RName>['cardinality']
// >;

// /**
//  * A collection query with just allowed params for a subquery in an include() clause
//  */
// export type IncludeSubquery<
//   M extends Models,
//   CN extends CollectionNameFromModels<M>,
// > = Pick<
//   CollectionQueryDefault<M, CN>,
//   'select' | 'order' | 'where' | 'limit' | 'include'
// >;

/**
 * E.g. where(undefined)
 */
function isInputNoOp(args: any): args is [undefined] {
  return Array.isArray(args) && args[0] === undefined;
}

/**
 * E.g. where("id", "=", "123")
 */
function isInputSpreadFilter<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>(args: any): args is FilterStatement<M, CN> {
  return isFilterStatement(args);
}

/**
 * E.g. where(["id", "=", "123"], more filters)
 */
function isInputSpreadClauses<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>(args: any): args is QueryWhere<M, CN> {
  return Array.isArray(args) && args.every((arg: any) => isWhereFilter(arg));
}

/**
 *  E.g. where([["id", "=", "123"], ["name", "=", "foo"]])
 */
function isInputClauseGroup<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>(args: any): args is [QueryWhere<M, CN>] {
  return args.length === 1 && isInputSpreadClauses(args[0]);
}

export const QUERY_INPUT_TRANSFORMERS = <
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
>() => ({
  where: <A extends FilterInput<M, CN>>(
    q: Pick<CollectionQuery<M, CN>, 'where'>,
    ...args: A
  ): QueryWhere<M, CN> => {
    let newWhere: QueryWhere<M, CN> = [];
    if (isInputNoOp(args)) return q.where ?? [];
    if (isInputSpreadFilter<M, CN>(args)) {
      newWhere = [args];
    } else if (isInputSpreadClauses<M, CN>(args)) {
      newWhere = args;
    } else if (isInputClauseGroup<M, CN>(args)) {
      newWhere = args[0];
    } else {
      throw new QueryClauseFormattingError('where', args);
    }
    return [...(q.where ?? []), ...newWhere];
  },
  order: (
    q: Pick<CollectionQuery<M, CN>, 'order'>,
    ...args: OrderInput<M, CN>
  ): QueryOrder<M, CN> | undefined => {
    if (!args[0]) return q.order ?? [];
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
    const orderAttributes = q.order.map((o) => o[0]);
    if (after instanceof Array) return [after, inclusive ?? false];
    if (typeof after === 'object') {
      return [
        // Maybe even sunset this and only use ValueCursor format
        orderAttributes.map((attr) =>
          ValuePointer.Get(after as any, attr)
        ) as ValueCursor,
        inclusive ?? false,
      ];
    }
    throw new QueryClauseFormattingError('after', after);
  },
});
