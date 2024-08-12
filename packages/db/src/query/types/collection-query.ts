import { ExtractOperators, ExtractValueInputs } from '../../data-types/type.js';
import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import {
  ExtractTypeFromRecord,
  ModelPaths,
  Models,
  Path,
  RelationAttributes,
  RelationPaths,
  RelationshipCollectionName,
  SchemaPaths,
} from '../../schema/types';
import { EntityId } from '../../triple-store-utils.js';
import {
  Coalesce,
  isAnyOrUndefined,
  IsUnknown,
  Not,
} from '../../utility-types.js';

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
  Selection extends QuerySelection<M, CN> = QuerySelection<M, CN>,
  Inclusions extends QueryInclusions<M, CN> = QueryInclusions<M, CN>
> = {
  where?: QueryWhere<M, CN>;
  select?: Selection;
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
  | string[]
  | Date[];

// === Generics Helpers ===
type BaseCollectionQuery = CollectionQuery<any, any, any, any>;

/**
 * A collection query with default selection and inclusion.
 */
export type CollectionQueryDefault<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = CollectionQuery<M, CN, QuerySelection<M, CN>, {}>;

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
  Q extends CollectionQuery<infer M, infer CN, infer S, any> ? S : never;

/**
 * Extracts the inclusion of a collection query.
 */
export type CollectionQueryInclusion<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<infer M, infer CN, infer S, infer I> ? I : never;

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
 * A query selection, which is an array of values to select.
 */
export type QuerySelection<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = ReadonlyArray<QuerySelectionValue<M, CN>>;

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

// ====== Inclusion Types ======
/**
 * A map of inclusions, keyed by alias.
 */
export type QueryInclusions<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  [alias: string]: QueryInclusion<M, CN>;
};

/**
 * A possible inclusion value in a query.
 */
export type QueryInclusion<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> =
  | RefShorthand
  | RelationSubquery<M, SchemaQueries<M>, QueryResultCardinality>
  | RefSubquery<M, CN>;

/**
 * A shorthand for including a reference.
 */
// Should document 'true', but accept null to support existing (stored) queries
type RefShorthand = true | null;

// ========= Ref Subquery Types =========
/**
 * A referential subquery, extending a subquery defined in the schema.
 */
export type RefSubquery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>

  // RefName extends RelationAttributes<ModelFromModels<M, CN>>,
  // Q extends KeyedModelQueries<M, CN>[RefName] = KeyedModelQueries<
  //   M,
  //   CN
  // >[RefName]
> = ModelRefSubQueries<M, CN>;

/**
 * An extension of a referential subquery, specifying additional query parameters.
 */
export type RefQueryExtension<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN>
> = Pick<Q, 'select' | 'include' | 'limit' | 'where' | 'order'>;

/**
 * The base query for a referential subquery extension.
 */
export type RefQueryExtensionBase<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN>
> = Q;

/**
 * A reference to a subquery type defined in the schema.
 */
export type Ref<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  RefName extends RelationAttributes<ModelFromModels<M, CN>>
> = NonNullable<ModelFromModels<M, CN>>['properties'][RefName];

/**
 * The query type of a referential subquery.
 */
export type RefQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  RefName extends RelationAttributes<ModelFromModels<M, CN>>
> = Ref<M, CN, RefName>['query'];

/**
 * The collection name of a referential subquery.
 */
export type RefCollectionName<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  RefName extends RelationAttributes<ModelFromModels<M, CN>>
> = RefQuery<M, CN, RefName>['collectionName'];

// ========= Relational Subquery Types =========
/**
 * A subquery defining a relationship, specifying the subquery and cardinality of the result.
 */
export type RelationSubquery<
  M extends Models<any, any> | undefined,
  Q extends SchemaQueries<M>,
  Cardinality extends QueryResultCardinality
> = {
  subquery: Q;
  cardinality: Cardinality;
};

// === Query Helpers ===
/**
 * All possible queries for a schema, keyed by collection name.
 */
export type KeyedSchemaQueries<M extends Models<any, any> | undefined> = {
  [CN in keyof M]: CN extends CollectionNameFromModels<M>
    ? CollectionQuery<M, CN>
    : never;
};

/**
 * Union of all possible queries for a schema.
 */
export type SchemaQueries<M extends Models<any, any> | undefined> =
  M extends Models<any, any>
    ? KeyedSchemaQueries<M>[keyof M]
    : CollectionQuery<M, any>;

/**
 * All related queries for a model, keyed by relation name.
 */
export type KeyedModelQueries<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  [K in RelationAttributes<ModelFromModels<M, CN>>]: ToQueryWithDefaults<
    M,
    NonNullable<ModelFromModels<M, CN>>['properties'][K]['query']
  >;
};

/**
 * All related queries for a model.
 */
export type ModelQueries<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = KeyedModelQueries<M, CN>[RelationAttributes<ModelFromModels<M, CN>>];

/**
 * All ref subqueries for a model.
 */
export type ModelRefSubQueries<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  [K in keyof KeyedModelQueries<M, CN>]: {
    _rel: K;
  } & RefQueryExtension<M, CN, KeyedModelQueries<M, CN>[K]>;
}[keyof KeyedModelQueries<M, CN>];

/**
 * Converts an array to a query selection value.
 */
export type ParseSelect<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelection<M, CN>
> = unknown extends Selection ? QuerySelection<M, CN> : Selection;

/**
 * Converts an object to a query inclusion.
 */
export type ParseInclusions<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Inclusions extends QueryInclusions<M, CN>
> = unknown extends Inclusions ? {} : Inclusions;

/**
 * Converts a query object to a query type.
 */
export type ToQuery<
  M extends Models<any, any> | undefined,
  Q extends Record<string, any>
> = CollectionQuery<
  M,
  Q['collectionName'],
  ParseSelect<M, Q['collectionName'], Q['select']>,
  ParseInclusions<M, Q['collectionName'], Q['include']>
>;

/**
 * Converts a query object to a query type with default values.
 */
export type ToQueryWithDefaults<
  M extends Models<any, any> | undefined,
  Q extends Record<string, any>
> = CollectionQuery<M, Q['collectionName']>;

/**
 * Merges a query with an inclusion extension
 */
export type MergeQueryInclusion<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Q extends CollectionQuery<M, CN, any, any>,
  Inc extends Pick<CollectionQuery<M, CN, any, any>, 'select' | 'include'>
> = CollectionQuery<
  M,
  CN,
  // @ts-expect-error
  ParseSelect<
    M,
    CN,
    // @ts-expect-error
    Coalesce<
      Coalesce<
        // TODO: This is a hack to help differentiate between no selection and select([]) on a query
        Inc['select'] extends [] | undefined ? unknown : Inc['select'],
        Q['select']
      >,
      QuerySelection<M, CN>
    >
  >,
  ParseInclusions<M, CN, Coalesce<Inc['include'], Q['include']>>
>;
