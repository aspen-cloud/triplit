import { ExtractOperators, ExtractValueInputs } from '../../data-types/type.js';
import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import {
  ExtractTypeFromRecord,
  ModelPaths,
  Models,
  Path,
  RelationPaths,
  RelationshipCollectionName,
  SchemaPaths,
} from '../../schema/types';
import { EntityId } from '../../triple-store-utils.js';

/**
 * A query that fetches data from a collection
 *
 * - select: the fields to select
 * - where: the filters to apply
 * - order: the order to sort the results
 * - limit: the maximum number of results to return
 * - after: the cursor to start fetching results from
 * - vars: variables to use in the query
 * - collectionName: the name of the collection to query
 * - include: the relations to include in the results
 */
export type CollectionQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelectionValue<M, CN> = QuerySelectionValue<M, CN>,
  Inclusions extends Record<string, RelationSubquery<M, any>> = Record<
    string,
    RelationSubquery<M, any>
  >
> = {
  where?: QueryWhere<M, CN>;
  select?: Selection[];
  // | [string, CollectionQuery<M, any>]
  order?: QueryOrder<M, CN>;
  limit?: number;
  after?: [ValueCursor, boolean];
  /**
   * @deprecated define a where filter instead
   */
  entityId?: string; // Syntactic sugar for where("id", "=", entityId), should not be relied on in query engine
  vars?: Record<string, any>;
  collectionName: CN;
  include?: Inclusions;
};

/**
 * A collection query without the collection name.
 */
export type Query<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelectionValue<M, CN> = QuerySelectionValue<M, CN>
> = Omit<CollectionQuery<M, CN, Selection>, 'collectionName'>;

// Should be friendly types that we pass into queries
// Not to be confused with the Value type that we store in the triple store
export type QueryValue =
  | number
  | string
  | boolean
  | Date
  | null
  | number[]
  | boolean[]
  | string[];

// === Generics Helpers ===
type BaseCollectionQuery = CollectionQuery<any, any, any, any>;

/**
 * A collection query with default selection and inclusion.
 */
export type CollectionQueryDefault<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = CollectionQuery<M, CN, QuerySelectionValue<M, CN>, {}>;

/**
 * Extracts the schema type from a collection query.
 */
export type CollectionQueryModels<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<infer M, any, any, any> ? M : never;

/**
 * Extracts the collection name from a collection query.
 */
export type CollectionQueryCollectionName<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<infer M, infer CN, any, any> ? CN : never;

/**
 * Extracts the selection of a collection query.
 */
export type CollectionQuerySelection<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<any, any, infer S, any> ? S : never;

/**
 * Extracts the inclusion of a collection query.
 */
export type CollectionQueryInclusion<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<any, any, any, infer I> ? I : never;

// === Query Types ===
// ====== Selection Types ======
/**
 * Possible set of values to select in a query
 */
export type QuerySelectionValue<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = M extends Models<any, any> ? ModelPaths<M, CN> : Path;

/**
 * A subquery defining a relationship, specifying the subquery and cardinality of the result.
 */
export type RelationSubquery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  subquery: CollectionQuery<M, CN>;
  cardinality: QueryResultCardinality;
};

/**
 * Cardinality of a query result:
 * - 'one' - a single result
 * - 'many' - multiple results
 */
export type QueryResultCardinality = 'one' | 'many';

// ====== Filter Types ======
/**
 * A query filter, which is a collection of many filters.
 */
export type QueryWhere<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = WhereFilter<M, CN>[];

/**
 * A single filter, which may have various structures.
 */
// I've done this with ExistsFilter, but adding a 'type' property to each type for narrowing would be helpful. Should still support old props for backwards compatibility.
export type WhereFilter<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> =
  | FilterStatement<M, CN>
  | FilterGroup<M, CN>
  | SubQueryFilter<M, CN>
  | RelationshipExistsFilter<M, CN>
  | boolean;

/**
 * A single filter statement of the shape [path, operator, value].
 */
export type FilterStatement<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  K extends M extends Models<any, any>
    ? SchemaPaths<M, CN>
    : Path = M extends Models<any, any> ? SchemaPaths<M, CN> : Path
> = [
  K,
  M extends Models<any, any>
    ? ExtractOperators<ExtractTypeFromRecord<ModelFromModels<M, CN>, M, K>>
    : string,
  M extends Models<any, any>
    ? ExtractValueInputs<ExtractTypeFromRecord<ModelFromModels<M, CN>, M, K>>
    : QueryValue
];

/**
 * A set of filters specified to be combined with AND or OR.
 */
export type FilterGroup<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = AndFilterGroup<M, CN> | OrFilterGroup<M, CN>;

/**
 * A group of filters combined with AND.
 */
export type AndFilterGroup<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  mod: 'and';
  filters: QueryWhere<M, CN>;
};

/**
 * A group of filters combined with OR.
 */
export type OrFilterGroup<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  mod: 'or';
  filters: QueryWhere<M, CN>;
};

/**
 * An exists filter that will check if a subquery returns any results.
 */
export type SubQueryFilter<
  M extends Models<any, any> | undefined = any,
  CN extends CollectionNameFromModels<M> = any
> = {
  exists: CollectionQuery<M, CN>;
};

/**
 * An exists filter that will check if a relationship in the schema returns any results.
 */
export type RelationshipExistsFilter<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  P extends M extends Models<any, any>
    ? RelationPaths<ModelFromModels<M, CN>, M>
    : Path = M extends Models<any, any>
    ? RelationPaths<ModelFromModels<M, CN>, M>
    : Path
> = {
  type: 'relationshipExists';
  relationship: P;
  query?: Pick<
    CollectionQuery<M, RelationshipCollectionName<M, CN, P>>,
    'where'
  >;
};

// ====== Order Types ======
/**
 * A query order, which is a collection of many orders.
 */
export type QueryOrder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = OrderStatement<M, CN>[];

/**
 * A single order statement of the shape [path, direction].
 */
export type OrderStatement<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = [
  property: M extends Models<any, any> ? SchemaPaths<M, CN> : Path,
  direction: 'ASC' | 'DESC'
];

// ====== Pagination Types ======
export type ValueCursor = [value: QueryValue, entityId: EntityId];
