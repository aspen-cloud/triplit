import { CollectionNameFromModels, Models } from '../../schema/types/models.js';
import { StringKey, Unalias } from '../../utils/types.js';
import {
  Decoded,
  ModelPaths,
  ModelRelationshipPaths,
  PathFiltered,
  ResolveRelationshipPath,
  SchemaPaths,
} from '../../schema/index.js';

/**
 * All possible queries for a schema, keyed by collection name.
 */
export type SchemaQueries<M extends Models<M> = Models> = {
  [CN in CollectionNameFromModels<M>]: CollectionQuery<M, CN>;
};

/**
 * A selection of queries for a schema, returning a union if there are multiple matches
 */
export type SchemaQuery<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = SchemaQueries<M>[CN];

/**
 * A prepared query, which is used internally by the query engine
 */
export interface PreparedQuery {
  collectionName: string;
  select?: string[];
  where?: PreparedWhere;
  order?: PreparedOrder;
  limit?: number;
  after?: QueryAfter;
  include?: PreparedInclusions;
}

/**
 * A user defined query on the database, which may reference the schema or other database objects.
 */
export interface CollectionQuery<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> {
  collectionName: CN;
  select?: QuerySelection<M, CN>[];
  where?: QueryWhere<M, CN>;
  order?: QueryOrder<M, CN>;
  limit?: number;
  after?: QueryAfter;
  vars?: Record<string, any>;
  include?: QueryInclusions<M, CN>;
}

/**
 * Cardinality of a query result:
 * - 'one' - a single result
 * - 'many' - multiple results
 */
export type QueryResultCardinality = 'one' | 'many';

export type QuerySelectionFromQuery<Q extends CollectionQuery<any, any>> =
  Q extends CollectionQuery<infer M, infer CN> ? QuerySelection<M, CN> : never;
export type QuerySelection<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = SchemaPaths<M, CN>;

// ====== Filter Types ======
/**
 * A query filter, which is a collection of many filters.
 */
export type QueryWhere<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = WhereFilter<M, CN>[];

/**
 * A single filter, which may have various structures.
 */
// I've done this with ExistsFilter, but adding a 'type' property to each type for narrowing would be helpful. Should still support old props for backwards compatibility.
export type WhereFilter<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> =
  // TODO: investigate usage of ModelFilterStatements (may improve type completion)
  | FilterStatement<M, CN>
  | FilterGroup<M, CN>
  | SubQueryFilter<M>
  | RelationshipExistsFilter<M, CN>
  | boolean;

export type ModelFilterStatements<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  [K in ModelPaths<M, CN>]: FilterStatement<M, CN, K>;
};
export type ModelFilterStatement<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  K extends ModelPaths<M, CN> = ModelPaths<M, CN>,
> = ModelFilterStatements<M, CN>[K];

/**
 * A single filter statement of the shape [path, operator, value].
 */
export type FilterStatement<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  K extends ModelPaths<M, CN> = ModelPaths<M, CN>,
> = [
  K,
  //Operations<ResolveModelPath<M, CN, K>> I think typescript has trouble inferring this because its a tuple, seeing a union of all ops, which is fine for now
  // However, it also causes small issues with the type system with ex. try S.RelationMany('users', { where: [ or([ ['id', '=', '$liked_by_ids'], or([['id', '=', '$liked_by_ids']]), ]), ], })
  // It (i think) doesn't recognize string in ['id', string, string] as a valid operator and is failing
  string,
  any,
];

export type PreparedWhere = PreparedWhereFilter[];

export type PreparedWhereFilter =
  | FilterStatement
  | PreparedFilterGroup
  | PreparedSubQueryFilter
  | boolean;

export type PreparedFilterGroup = FilterGroup<
  Models,
  CollectionNameFromModels<Models>,
  PreparedWhere
>;

export type PreparedSubQueryFilter = {
  exists: PreparedQuery;
};

/**
 * A set of filters specified to be combined with AND or OR.
 */
export type FilterGroup<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  W extends QueryWhere<M, CN> | PreparedWhere =
    | QueryWhere<M, CN>
    | PreparedWhere,
> = AndFilterGroup<M, CN, W> | OrFilterGroup<M, CN, W>;

export type QueryFilterGroup<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = FilterGroup<M, CN, QueryWhere<M, CN>>;

/**
 * A group of filters combined with AND.
 */
export type AndFilterGroup<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  W extends QueryWhere<M, CN> | PreparedWhere =
    | QueryWhere<M, CN>
    | PreparedWhere,
> = {
  mod: 'and';
  filters: W;
};

/**
 * A group of filters combined with OR.
 */
export type OrFilterGroup<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  W extends QueryWhere<M, CN> | PreparedWhere =
    | QueryWhere<M, CN>
    | PreparedWhere,
> = {
  mod: 'or';
  filters: W;
};

/**
 * An exists filter that will check if a subquery returns any results.
 */
export type SubQueryFilter<
  M extends Models<M> = Models,
  SQ extends SchemaQuery<M> = SchemaQuery<M>,
  // This is the collection name of the subquery, not the parent query
  // SubqueryCN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  exists: SQ;
};

/**
 * An exists filter that will check if a relationship in the schema returns any results.
 */
// This may be never if M = any ... might be a place to be more flexible
export type RelationshipRef<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = StringKey<NonNullable<M[CN]['relationships']>>;

export type IsRelationshipRef<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Ref extends string,
> = Ref extends RelationshipRef<M, CN> ? true : false;

// TODO: unify with { exists }

export type RelationshipExistsFilter<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  P extends ModelRelationshipPaths<M, CN> = ModelRelationshipPaths<M, CN>,
  Ext extends RelationshipExistsExtension<
    M,
    CN,
    P
  > = RelationshipExistsExtension<M, CN, P>,
> = {
  exists: Ext & {
    _extends: P;
  };
};

export type RelationshipExistsExtension<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  P extends ModelRelationshipPaths<M, CN> = ModelRelationshipPaths<M, CN>,
> = Pick<
  SchemaQuery<M, ResolveRelationshipPath<M, CN, P>['query']['collectionName']>,
  'where'
>;

// ====== Order Types ======
// ========= Prepared Types =========
export type PreparedOrder = PreparedOrderStatement[];
export type PreparedOrderStatement = OrderStatement | RelationalOrderStatement;
// TODO: break this out into unprepared and prepared types
// TODO: make this an object or different form that is easier to guard against
export type RelationalOrderStatement<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = [
  property: ModelPaths<M, CN>,
  direction: 'ASC' | 'DESC',
  subquery: PreparedRelationSubquery<'one'>,
];
// ========= Unprepared Types =========
/**
 * A query order, which is a collection of many orders.
 */
export type QueryOrder<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = OrderStatement<M, CN>[];

/**
 * A single order statement of the shape [path, direction].
 */
export type OrderStatement<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = [property: ModelPaths<M, CN>, direction: 'ASC' | 'DESC'];

// ====== Pagination Types ======
export type QueryAfter = [ValueCursor, boolean];
export type ValueCursor = [
  value: QueryValuePrimitive,
  ...values: QueryValuePrimitive[],
];

// ====== Inclusion Types ======
// ========= Prepared Types =========
/**
 * A map of prepared inclusions, keyed by alias.
 */
export type PreparedInclusions = {
  [K in string]: PreparedInclusion;
};
/**
 * A possible inclusion value in a query.
 */
export type PreparedInclusion = PreparedRelationSubquery;

/**
 * A subquery definition for a prepared query.
 */
export type PreparedRelationSubquery<
  Cardinality extends QueryResultCardinality = QueryResultCardinality,
> = {
  subquery: PreparedQuery;
  cardinality: Cardinality;
};

// ========= Unprepared Types =========
/**
 * A map of inclusions, keyed by alias.
 */
export type QueryInclusions<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  // Optimally we could exclude RefShorthand from non-relationship keys, but this is tricky to do with TS
  [K in string]: QueryInclusion<M, CN>;
};

/**
 * A possible inclusion value in a query.
 */
export type QueryInclusion<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = RefShorthand | RelationSubquery<M> | RefSubquery<M, CN>;

/**
 * A shorthand for including a reference.
 */
export type RefShorthand = true | null;

// ============ Ref Subquery Types ============
export type RefSubquery<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN> = RelationshipRef<M, CN>,
> = {
  _extends: Ref;
} & RefQueryExtension<M, CN, Ref>;

/**
 * An extension of a referential subquery, specifying additional query parameters.
 */
export type RefQueryExtension<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN> = RelationshipRef<M, CN>,
> = Pick<
  SchemaQuery<M, RefCollectionName<M, CN, Ref>>,
  'select' | 'include' | 'limit' | 'where' | 'order'
>;

export type RefDefinition<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN>,
> = NonNullable<M[CN]['relationships']>[Ref];

export type RefQuery<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN>,
> = RefDefinition<M, CN, Ref>['query'];

export type RefCollectionName<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Ref extends RelationshipRef<M, CN>,
> = RefQuery<M, CN, Ref>['collectionName'];

// ============ Relational Subquery Types ============
/**
 * A subquery defining a relationship, specifying the subquery and cardinality of the result.
 */
export type RelationSubquery<
  M extends Models<M> = Models,
  Q extends SchemaQuery<M> = SchemaQuery<M>,
  Cardinality extends QueryResultCardinality = QueryResultCardinality,
> = {
  subquery: Q;
  cardinality: Cardinality;
};

// OTHER TYPES TODO

type QueryValuePrimitive = number | string | boolean | Date | null;
/**
 * Possible values that can be passed into a the query engine by a user
 */
export type QueryValue =
  | QueryValuePrimitive
  | NonNullable<QueryValuePrimitive>[];

export type FetchResult<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
  C extends QueryResultCardinality,
> = Unalias<AliasedFetchResult<M, Q, C>>;

export type AliasedFetchResult<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
  C extends QueryResultCardinality,
> = C extends 'one'
  ? AliasedQueryResult<M, Q> | null
  : AliasedQueryResult<M, Q>[];

type AliasedQueryResult<M extends Models<M>, Q extends SchemaQuery<M>> =
  Q extends CollectionQuery<M, infer CN>
    ? (Q['select'] extends ReadonlyArray<infer S>
        ? // If we have a selection, use that
          PathFiltered<Decoded<M[CN]['schema']>, S extends string ? S : never>
        : // Else use the entire schema
          Decoded<M[CN]['schema']>) & {
        // also use inclusions
        [K in StringKey<Q['include']>]: InclusionResult<
          M,
          CN,
          K,
          // @ts-expect-error
          Q['include'][K]
        >;
      }
    : never;

type InclusionResult<
  M extends Models<M>,
  CN extends CollectionNameFromModels<M>,
  Alias extends string,
  Inclusion extends QueryInclusion<M, CN>,
> =
  // Inclusion is subquery
  Inclusion extends RelationSubquery<M, infer Subquery, infer Cardinality>
    ? AliasedFetchResult<M, Subquery, Cardinality>
    : // Inclusion is relation extension
      Inclusion extends RefSubquery<M, CN, infer Ref>
      ? AliasedFetchResult<
          M,
          RefQuery<M, CN, Ref> & Omit<Inclusion, '_extends'>,
          RefDefinition<M, CN, Ref>['cardinality']
        >
      : // Inclusion is relation shorthand
        Inclusion extends RefShorthand
        ? Alias extends RelationshipRef<M, CN>
          ? AliasedFetchResult<
              M,
              RefDefinition<M, CN, Alias>['query'],
              RefDefinition<M, CN, Alias>['cardinality']
            >
          : never
        : never;

export type WithSelection<
  Q extends CollectionQuery<any, any>,
  Selection extends QuerySelectionFromQuery<Q>,
> = Omit<Q, 'select'> & {
  select: Selection[];
};

export type WithInclusion<
  Q extends CollectionQuery<any, any>,
  Inclusion extends Q extends CollectionQuery<infer M, infer CN>
    ? QueryInclusions<M, CN>
    : never,
> = Omit<Q, 'include'> & {
  include: Inclusion;
};

export type WithInclusionRaw<Q, Inclusion> = Omit<Q, 'include'> & {
  include: Inclusion;
};
