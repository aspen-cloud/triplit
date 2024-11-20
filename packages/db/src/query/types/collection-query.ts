import { QueryType } from '../../data-types/definitions/query.js';
import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import {
  ModelPaths,
  Models,
  RelationAttributes,
  RelationPaths,
  RelationshipCollectionName,
  SchemaPaths,
} from '../../schema/types/index.js';
import { EntityId } from '../../triple-store-utils.js';
import { Coalesce } from '../../utility-types.js';

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
  M extends Models = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  Selection extends QuerySelection<M, CN> = QuerySelection<M, CN>,
  Inclusions extends QueryInclusions<M, CN> = QueryInclusions<M, CN>,
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
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = CollectionQuery<M, CN, QuerySelection<M, CN>, {}>;

/**
 * Extracts the schema type from a collection query.
 */
export type CollectionQueryModels<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<infer M, infer CN, infer S, infer I> ? M : never;

/**
 * Extracts the collection name from a collection query.
 */
export type CollectionQueryCollectionName<Q extends BaseCollectionQuery> =
  Q extends CollectionQuery<infer M, infer CN>
    ? CN extends CollectionNameFromModels<M>
      ? CN
      : never
    : never;

/**
 * Extracts the selection of a collection query.
 */
export type CollectionQuerySelection<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN>,
> = Q extends CollectionQuery<M, CN, infer S> ? S : never;

/**
 * Extracts the inclusion of a collection query.
 */
export type CollectionQueryInclusion<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN>,
> = Q extends CollectionQuery<M, CN, infer S, infer I> ? I : never;

// === Query Types ===
// ====== Selection Types ======
/**
 * Possible set of values to select in a query
 */
export type QuerySelectionValue<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = ModelPaths<M, CN>;

/**
 * A query selection, which is an array of values to select.
 */
export type QuerySelection<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = QuerySelectionValue<M, CN>;

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
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = WhereFilter<M, CN>[];

/**
 * A single filter, which may have various structures.
 */
// I've done this with ExistsFilter, but adding a 'type' property to each type for narrowing would be helpful. Should still support old props for backwards compatibility.
export type WhereFilter<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> =
  | FilterStatement<M, CN>
  | FilterGroup<M, CN>
  | SubQueryFilter<M>
  | RelationshipExistsFilter<M, CN>
  | boolean;

/**
 * A single filter statement of the shape [path, operator, value].
 */
export type FilterStatement<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  K extends SchemaPaths<M, CN> = SchemaPaths<M, CN>,
> = [
  K,
  Operator, // ExtractOperators<ExtractTypeFromRecord<ModelFromModels<M, CN>, M, K>>,
  QueryValue, // ExtractValueInputs<ExtractTypeFromRecord<ModelFromModels<M, CN>, M, K>>
];

/**
 * A set of filters specified to be combined with AND or OR.
 */
export type FilterGroup<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = AndFilterGroup<M, CN> | OrFilterGroup<M, CN>;

/**
 * A group of filters combined with AND.
 */
export type AndFilterGroup<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = {
  mod: 'and';
  filters: QueryWhere<M, CN>;
};

/**
 * A group of filters combined with OR.
 */
export type OrFilterGroup<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = {
  mod: 'or';
  filters: QueryWhere<M, CN>;
};

/**
 * An exists filter that will check if a subquery returns any results.
 */
export type SubQueryFilter<
  M extends Models = Models,
  // This is the collection name of the subquery, not the parent query
  SubqueryCN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = {
  exists: CollectionQuery<M, SubqueryCN>;
};

/**
 * An exists filter that will check if a relationship in the schema returns any results.
 */
export type RelationshipExistsFilter<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  P extends RelationPaths<ModelFromModels<M, CN>, M> = RelationPaths<
    ModelFromModels<M, CN>,
    M
  >,
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
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = OrderStatement<M, CN>[];

/**
 * A single order statement of the shape [path, direction].
 */
export type OrderStatement<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = [property: SchemaPaths<M, CN>, direction: 'ASC' | 'DESC'];

// ====== Pagination Types ======
export type ValueCursor = [value: QueryValue, entityId: EntityId];

// ====== Inclusion Types ======
/**
 * A map of inclusions, keyed by alias.
 */
export type QueryInclusions<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = {
  [alias: string]: QueryInclusion<M, CN>;
};

/**
 * A possible inclusion value in a query.
 */
export type QueryInclusion<
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
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
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,

  // RefName extends RelationAttributes<M, CN>,
  // Q extends KeyedModelQueries<M, CN>[RefName] = KeyedModelQueries<
  //   M,
  //   CN
  // >[RefName]
> = ModelRefSubQueries<M, CN>;

/**
 * An extension of a referential subquery, specifying additional query parameters.
 */
export type RefQueryExtension<
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN> = ModelQueries<M, CN>,
> = Pick<Q, 'select' | 'include' | 'limit' | 'where' | 'order'>;

/**
 * The base query for a referential subquery extension.
 */
export type RefQueryExtensionBase<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends ModelQueries<M, CN>,
> = Q;

/**
 * A reference to a subquery type defined in the schema.
 */
export type Ref<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  RefName extends RelationAttributes<M, CN>,
> =
  ModelFromModels<M, CN>['properties'][RefName] extends QueryType<any, any, any>
    ? ModelFromModels<M, CN>['properties'][RefName]
    : never;

/**
 * The query type of a referential subquery.
 */
export type RefQuery<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  RefName extends RelationAttributes<M, CN>,
> = Ref<M, CN, RefName>['query'];

/**
 * The collection name of a referential subquery.
 */
export type RefCollectionName<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  RefName extends RelationAttributes<M, CN>,
> = RefQuery<M, CN, RefName>['collectionName'];

// ========= Relational Subquery Types =========
/**
 * A subquery defining a relationship, specifying the subquery and cardinality of the result.
 */
export type RelationSubquery<
  M extends Models,
  Q extends SchemaQueries<M>,
  Cardinality extends QueryResultCardinality,
> = {
  subquery: Q;
  cardinality: Cardinality;
};

// === Query Helpers ===
/**
 * All possible queries for a schema, keyed by collection name.
 */
export type KeyedSchemaQueries<M extends Models> = {
  [CN in CollectionNameFromModels<M>]: CollectionQuery<M, CN>;
};

/**
 * Union of all possible queries for a schema.
 */
export type SchemaQueries<M extends Models> =
  KeyedSchemaQueries<M>[CollectionNameFromModels<M>];

/**
 * All related queries for a model, keyed by relation name.
 */
export type KeyedModelQueries<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = {
  [K in RelationAttributes<M, CN>]: ToQueryWithDefaults<M, RefQuery<M, CN, K>>;
};

/**
 * All related queries for a model.
 */
export type ModelQueries<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = KeyedModelQueries<M, CN>[RelationAttributes<M, CN>];

/**
 * All ref subqueries for a model.
 */
export type ModelRefSubQueries<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = {
  [K in keyof KeyedModelQueries<M, CN>]: {
    _rel: K;
  } & RefQueryExtension<M, CN, KeyedModelQueries<M, CN>[K]>;
}[keyof KeyedModelQueries<M, CN>];

/**
 * Converts an array to a query selection value.
 */
export type ParseSelect<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Selection extends CollectionQuery<M, CN>['select'],
> =
  // Untyped query literals will have unknonw select
  unknown extends Selection
    ? QuerySelection<M, CN>
    : // Intersect with the schema paths to ensure the selection is valid
      NonNullable<Selection>[number] & QuerySelection<M, CN>;

/**
 * Converts an object to a query inclusion.
 */
export type ParseInclusions<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Inclusions extends QueryInclusions<M, CN>,
> = unknown extends Inclusions ? {} : Inclusions;

/**
 * Converts a query object to a query type.
 */
export type ToQuery<
  M extends Models,
  Q extends Record<string, any>,
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
  M extends Models,
  Q extends Record<string, any>,
> = CollectionQuery<M, Q['collectionName']>;

/**
 * Merges a query with an inclusion extension
 */
export type MergeQueryInclusion<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Q extends CollectionQuery<M, CN>,
  Inc extends Pick<CollectionQuery<M, CN>, 'select' | 'include'>,
> = CollectionQuery<
  M,
  CN,
  // If the inclusion has an override, use that, otherwise use base query select
  unknown extends Inc['select']
    ? ParseSelect<M, CN, Q['select']>
    : NonNullable<Inc['select']>[number],
  ParseInclusions<M, CN, NonNullable<Coalesce<Inc['include'], Q['include']>>>
>;

export type Operator =
  | '='
  | '<'
  | '>'
  | '<='
  | '>='
  | '!='
  | 'like'
  | 'nlike'
  | 'in'
  | 'nin'
  | 'has'
  | '!has'
  | 'isDefined';
