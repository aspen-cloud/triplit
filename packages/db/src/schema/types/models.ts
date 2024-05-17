import { QueryResult } from '../../collection-query.js';
import { DataType, Optional } from '../../data-types/base.js';
import { QueryType } from '../../data-types/query.js';
import { RecordType } from '../../data-types/record.js';
import { ExtractDBType, ExtractJSType } from '../../data-types/type.js';
import {
  CollectionNameFromModels,
  CollectionRules,
  ModelFromModels,
} from '../../db.js';
import {
  CollectionQuery,
  QuerySelectionValue,
  RelationSubquery,
} from '../../query.js';
import { Intersection } from '../../utility-types.js';
import { Schema } from '../builder.js';
import { ExtractBasePaths, ModelPaths, ShiftPath } from './paths.js';
import {
  IsPropertyInsertOptional,
  IsPropertyInsertRequired,
  IsPropertyOptional,
  IsPropertyRequired,
} from './properties.js';

export type SchemaConfig = { id: ReturnType<typeof Schema.Id> } & Record<
  string,
  DataType | Optional<DataType>
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
  rules?: CollectionRules<any, any>;
};

/**
 * The set of collections that define a schema
 */
export type Models<
  CollectionName extends string,
  T extends SchemaConfig
> = Record<CollectionName, Collection<T>>;

/**
 * A subset of a model with properties that are available for selection
 */
export type SelectModelFromModel<M extends Model<any> | undefined> =
  M extends Model<infer Config>
    ? Config extends SchemaConfig
      ? Model<//@ts-expect-error
        {
          [k in keyof Config as Config[k] extends QueryType<any, any>
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
export type QuerySelectionFitleredTypeFromModel<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelectionValue<M, CN>,
  Inclusion extends Record<string, RelationSubquery<M, any>>
> =
  // Path selections
  PathFilteredTypeFromModel<
    ModelFromModels<M, CN>,
    Intersection<ModelPaths<M, CN>, Selection>
  > & {
    // Subquery selections
    [I in keyof Inclusion]: ExtractRelationSubqueryType<M, Inclusion[I]>;
  };

/**
 * Extract the type from a RelationSubquery
 */
type ExtractRelationSubqueryType<
  M extends Models<any, any>,
  Subquery extends RelationSubquery<M, any>
> = QueryResult<
  CollectionQuery<
    M,
    Subquery['subquery']['collectionName'],
    // TODO: probably want to properly type selection
    QuerySelectionValue<M, Subquery['subquery']['collectionName']>
  >,
  Subquery['cardinality']
>;
/**
 * A type matching the properties of a model that are relations
 */
export type RelationAttributes<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [K in keyof M['properties']]: M['properties'][K] extends QueryType<
          any,
          any
        >
          ? K
          : never;
      }[keyof M['properties']]
    : never;
