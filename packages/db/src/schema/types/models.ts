import { DataType, Optional } from '../../data-types/base.js';
import { QueryType } from '../../data-types/query.js';
import { RecordProps, RecordType } from '../../data-types/record.js';
import { ExtractDBType, ExtractJSType } from '../../data-types/type.js';
import {
  CollectionNameFromModels,
  CollectionRules,
  ModelFromModels,
} from '../../db.js';
import { Coalesce, Intersection } from '../../utility-types.js';
import { Schema } from '../builder.js';
import { ExtractBasePaths, ModelPaths, ShiftPath } from './paths.js';
import {
  IsPropertyInsertOptional,
  IsPropertyInsertRequired,
  IsPropertyOptional,
  IsPropertyRequired,
} from './properties.js';
import {
  CollectionQuery,
  CollectionQueryInclusion,
  CollectionQuerySelection,
  MergeQueryInclusion,
  ParseSelect,
  SchemaQueries,
  QueryInclusion,
  QueryInclusions,
  QueryResult,
  QueryResultCardinality,
  QuerySelectionValue,
  QueryWhere,
  RefSubquery,
  RelationSubquery,
  ToQuery,
} from '../../query/types';

export type SchemaConfig = { id: ReturnType<typeof Schema.Id> } & RecordProps<
  any,
  any
>;

/**
 * An individual model schema
 */
export type Model<T extends SchemaConfig> = RecordType<T>;

/**
 * A definition of a collection
 */
export type Collection<T extends SchemaConfig = SchemaConfig> = {
  schema: Model<T>;
  // TODO: possible to not use <any, any> here?
  /**
   * @deprecated use `permissions` instead
   */
  rules?: CollectionRules<any, any>;
  permissions?: RolePermissions<any, any>;
};

export type RolePermissions<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Record<string, CollectionPermissions<M, CN>>;

export type CollectionPermissions<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  read?: CollectionPermission<M, CN>;
  insert?: CollectionPermission<M, CN>;
  update?: CollectionPermission<M, CN>;
  postUpdate?: CollectionPermission<M, CN>;
  delete?: CollectionPermission<M, CN>;
};

export type PermissionOperations = keyof CollectionPermissions<any, any>;
export type PermissionWriteOperations = Exclude<PermissionOperations, 'read'>;

type CollectionPermission<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  filter?: QueryWhere<M, CN>;
  // attributes?: Array<QuerySelectionValue<M, CN>>;
  // attributesExclude?: Array<QuerySelectionValue<M, CN>>;
};

// TODO: we could maybe try to make this more type safe, should be valid JSON
/**
 * An object that will be matched against a JWT payload to determine if a user has a role
 * A value prefixed with '$' indicates a wildcard that will be replaced with the value from the JWT payload
 */
export type PermissionMatcher = Record<string, any>;
/**
 * Requisite information related to a role
 */
export type Role = {
  match: PermissionMatcher;
};
/**
 * Collection of roles for a database
 */
export type Roles = Record<string, Role>;

export type StoreSchema<M extends Models<any, any> | undefined> =
  M extends Models<any, any>
    ? {
        version: number;
        collections: M;
        roles?: Roles;
      }
    : M extends undefined
    ? undefined
    : never;

/**
 * The set of collections that define a schema
 */
export type Models<CollectionName extends string, T extends SchemaConfig> = {
  [K in CollectionName]: Collection<T>;
};

/**
 * A subset of a model with properties that are available for selection
 */
export type SelectModelFromModel<M extends Model<any> | undefined> =
  M extends Model<infer Config>
    ? Config extends SchemaConfig
      ? Model<//@ts-expect-error
        {
          [k in keyof Config as Config[k] extends QueryType<any, any, any>
            ? never
            : k]: Config[k];
        }>
      : never
    : any;

/**
 * The type of an insert operation for a model
 */
export type InsertTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof SelectModelFromModel<M>['properties'] as IsPropertyInsertRequired<
          M['properties'][k]
        > extends true
          ? k
          : never]: ExtractJSType<M['properties'][k]>;
      } & {
        [k in keyof SelectModelFromModel<M>['properties'] as IsPropertyInsertOptional<
          M['properties'][k]
        > extends true
          ? k
          : never]?: ExtractJSType<M['properties'][k]>;
      }
    : any;

/**
 * The type of an update operation for a model
 */
export type UpdateTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? // If properties are required by the schema, they are required in the update type
      {
        [k in keyof Omit<
          SelectModelFromModel<M>['properties'],
          'id'
        > as IsPropertyRequired<
          SelectModelFromModel<M>['properties'][k]
        > extends true
          ? k
          : never]: ExtractJSType<M['properties'][k]>;
      } & {
        // If properties are optional by the schema, they are optional in the update type
        [k in keyof Omit<
          SelectModelFromModel<M>['properties'],
          'id'
        > as IsPropertyOptional<
          SelectModelFromModel<M>['properties'][k]
        > extends true
          ? k
          : never]?: ExtractJSType<M['properties'][k]>;
      } & { readonly id: string } // The id should be readonly
    : any;

/**
 * The full type of a model as seen by a client
 */
export type JSTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof M['properties']]: M['properties'][k] extends DataType
          ? ExtractJSType<M['properties'][k]>
          : never;
      }
    : any;

/**
 * The full type of a model as seen by the database
 */
export type DBTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof M['properties']]: ExtractDBType<M['properties'][k]>;
      }
    : any;

/**
 * A JS type from a model filtered by a union of paths
 */
export type PathFilteredTypeFromModel<
  Record extends RecordType<any>,
  Paths extends string
> = {
  [K in keyof Record['properties'] & ExtractBasePaths<Paths>]: K extends Paths
    ? // If the exact path matches, include it as is.
      IsPropertyOptional<Record['properties'][K]> extends true
      ? ExtractJSType<Record['properties'][K]> | undefined
      : ExtractJSType<Record['properties'][K]>
    : PathFilteredTypeFromModel<Record['properties'][K], ShiftPath<Paths>>; // Otherwise, recurse into sub-properties
};

/**
 * A JS type from a model filtered by a QuerySelection type
 */
export type QuerySelectionFilteredTypeFromModel<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>,
  Selection extends ReadonlyArray<QuerySelectionValue<M, CN>>,
  Inclusion extends QueryInclusions<M, CN>
> =
  // Path selections
  PathFilteredTypeFromModel<
    ModelFromModels<M, CN>,
    Intersection<ModelPaths<M, CN>, Selection[number]>
  > & {
    // Subquery selections
    [I in keyof Inclusion]: I extends string
      ? ExtractRelationSubqueryType<M, CN, I, Inclusion[I]>
      : never;
  };

/**
 * Extract the type from a RelationSubquery
 */
type ExtractRelationSubqueryType<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>,
  Alias extends string,
  Inclusion extends QueryInclusion<M, CN>
> = Inclusion extends RelationSubquery<any, any, any>
  ? QueryResult<ToQuery<M, Inclusion['subquery']>, Inclusion['cardinality']>
  : Inclusion extends RefSubquery<any, any>
  ? QueryResult<
      MergeQueryInclusion<
        M,
        NonNullable<
          ModelFromModels<M, CN>
        >['properties'][Inclusion['_rel']]['query']['collectionName'],
        ModelFromModels<M, CN>['properties'][Inclusion['_rel']]['query'],
        Inclusion
      >,
      ModelFromModels<M, CN>['properties'][Inclusion['_rel']]['cardinality']
    >
  : Inclusion extends true
  ? QueryResult<
      ToQuery<M, ModelFromModels<M, CN>['properties'][Alias]['query']>,
      ModelFromModels<M, CN>['properties'][Alias]['cardinality']
    >
  : Inclusion extends null
  ? QueryResult<
      ToQuery<M, ModelFromModels<M, CN>['properties'][Alias]['query']>,
      ModelFromModels<M, CN>['properties'][Alias]['cardinality']
    >
  : never;

/**
 * A type matching the properties of a model that are relations
 */
// TODO: use <M, CN> pattern
// TODO: move to paths.ts?
// TODO: possibly make recursive / add depth
export type RelationAttributes<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [K in keyof M['properties']]: M['properties'][K] extends QueryType<
          any,
          any,
          any
        >
          ? K
          : never;
      }[keyof M['properties']]
    : never;
