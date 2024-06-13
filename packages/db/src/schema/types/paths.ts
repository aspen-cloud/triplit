import { QueryType } from '../../data-types/query.js';
import { RecordType } from '../../data-types/record.js';
import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import { CollectionQuery } from '../../query.js';
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
  M extends Models<any, any>,
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
        : R['properties'][K] extends QueryType<any, any>
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
 * Expand a query type into a union of all possible paths
 */
export type QueryPaths<
  Q extends QueryType<any, any>,
  M extends Models<any, any>,
  TDepth extends any[] = []
> = Q extends QueryType<infer CQ, any>
  ? CQ extends CollectionQuery<any, any>
    ? SchemaPaths<M, CQ['collectionName'], TDepth>
    : never
  : never;

/**
 * Expand a schema into a union of all possible paths
 */
export type SchemaPaths<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>,
  TDepth extends any[] = []
> = RecordPaths<M[CN]['schema'], M, TDepth>;

/**
 * Expand a Model into a union of all possible paths, non inclusive of relationships
 */
export type ModelPaths<
  M extends Models<any, any>,
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
