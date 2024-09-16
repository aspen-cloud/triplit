import { QueryType } from '../../data-types/definitions/query.js';
import { RecordType } from '../../data-types/definitions/record.js';
import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import { CollectionQuery } from '../../query/types/index.js';
import { PrefixedUnion } from '../../utility-types.js';
import { Models, SelectModelFromModel } from './models.js';

/**
 * A path in a schema
 */
export type Path = string;

/**
 * The maximum depth of relationships to expand in path search
 */
export type MAX_RELATIONSHIP_DEPTH = 3;

/**
 * Expand a record type into a union of all possible paths, including relationships and nested records
 */
export type RecordPaths<
  R extends RecordType<any>,
  M extends Models,
  TDepth extends any[] = []
> = R extends RecordType<any>
  ? {
      [K in keyof R['properties']]: R['properties'][K] extends RecordType<any>
        ? // Record root
          | `${Path & K}`
            // Record children
            | PrefixedUnion<
                RecordPaths<
                  // @ts-expect-error
                  R['properties'][K],
                  M,
                  TDepth
                >,
                `${Path & K}.`
              >
        : R['properties'][K] extends QueryType<any, any, any>
        ? // Basically start back at top of schema but add prefix
          PrefixedUnion<
            // Track max depth as relationships are expanded
            TDepth['length'] extends MAX_RELATIONSHIP_DEPTH
              ? any
              : QueryPaths<
                  // @ts-expect-error
                  R['properties'][K],
                  M,
                  [...TDepth, any]
                >,
            `${Path & K}.`
          >
        : // Base case for values
          `${Path & K}`;
    }[keyof R['properties']]
  : never;

/**
 * Expand a record type into a union of all paths that have relationships at every level
 */
// Note: this what we should edit to support relationships inside records (expand records to find relationships)
export type RelationPaths<
  R extends RecordType<any>,
  M extends Models,
  TDepth extends any[] = []
> = R extends RecordType<any>
  ? {
      [K in keyof R['properties']]: R['properties'][K] extends QueryType<
        any,
        any,
        any
      >
        ? // Basically start back at top of schema but add prefix
          | `${Path & K}` // Take current path, union with expanded paths
            | PrefixedUnion<
                PrefixedUnion<
                  // Track max depth as relationships are expanded
                  TDepth['length'] extends MAX_RELATIONSHIP_DEPTH
                    ? any
                    : RelationPaths<
                        ModelFromModels<
                          M,
                          R['properties'][K]['query']['collectionName']
                        >,
                        M,
                        [...TDepth, any]
                      >,
                  '.'
                >,
                Path & K
              >
        : never;
    }[keyof R['properties']]
  : never;

/**
 * Expand a query type into a union of all possible paths
 */
export type QueryPaths<
  QType extends QueryType<any, any, any>,
  M extends Models,
  TDepth extends any[] = []
> = QType extends QueryType<any, infer Q, any>
  ? SchemaPaths<M, Q['collectionName'], TDepth>
  : never;

/**
 * Expand a schema into a union of all possible paths
 */
export type SchemaPaths<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  TDepth extends any[] = []
> = RecordPaths<M[CN]['schema'], M, TDepth>;

/**
 * Expand a Model into a union of all possible paths, non inclusive of relationships
 */
export type ModelPaths<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = RecordPaths<
  // Use SelectModelFromModel to remove relationships
  SelectModelFromModel<ModelFromModels<M, CN>>,
  M
>;

/**
 * Get the base key of a path or union of paths
 */
export type ExtractBasePaths<P extends string> =
  P extends `${infer Key}.${string}` ? Key : P;

/**
 * Shift a path to the next level by removing the first key
 */
export type ShiftPath<P extends string> = P extends `${string}.${infer Rest}`
  ? Rest
  : never;

/**
 * Get the collection name of a relationship at a path
 */
export type RelationshipCollectionName<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  P extends RelationPaths<ModelFromModels<M, CN>, M>
> = ExtractTypeFromRecord<ModelFromModels<M, CN>, M, P> extends QueryType<
  any,
  any,
  any
>
  ? ExtractTypeFromRecord<
      ModelFromModels<M, CN>,
      M,
      P
    >['query']['collectionName']
  : never;

/**
 * Gets the Triplit data type at a path for a record type
 */
export type ExtractTypeFromRecord<
  R extends RecordType<any>,
  M extends Models,
  P extends Path // should be a dot notation path
> = P extends `${infer K}.${infer Rest}` // if path is nested
  ? K extends keyof R['properties'] // if key is a valid key
    ? R['properties'][K] extends RecordType<any> // if value at key is a record type
      ? ExtractTypeFromRecord<
          // @ts-expect-error
          R['properties'][K],
          M,
          Rest
        > // recurse
      : R['properties'][K] extends QueryType<any, any, any> // if value at key is a query type
      ? ExtractTypeFromSchema<
          M,
          R['properties'][K]['query']['collectionName'],
          Rest
        >
      : never // if value at key cannot be recursed
    : never // if key is not a valid key
  : P extends keyof R['properties'] // if path is not nested
  ? R['properties'][P] // return value at path
  : never; // if path is not valid

/**
 * Gets the Triplit data type at a path for a schema
 */
export type ExtractTypeFromSchema<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  P extends Path
> = ExtractTypeFromRecord<ModelFromModels<M, CN>, M, P>;
