import { CollectionNameFromModels } from '../../db.js';
import {
  QueryInclusions,
  QueryResultCardinality,
  QuerySelection,
  SchemaQueries,
} from './collection-query.js';
import {
  Models,
  QuerySelectionFilteredTypeFromModel,
} from '../../schema/types/index.js';

/**
 * Transforms a complex nested type to a readable type
 */
export type Unalias<T> =
  T extends Map<infer K, infer V>
    ? Map<K, Unalias<V>>
    : T extends Set<infer V>
      ? Set<Unalias<V>>
      : T extends Date
        ? T
        : T extends Array<infer U>
          ? Array<Unalias<U>>
          : T extends Object
            ? { [K in keyof T]: Unalias<T[K]> }
            : T;

/**
 * The expected result of a query given its cardinality
 */
export type QueryResult<
  M extends Models,
  Q extends SchemaQueries<M>,
  C extends QueryResultCardinality,
> = C extends 'one' ? FetchResultEntity<M, Q> | null : FetchResult<M, Q>;

/**
 * An array containing the results of a database fetch
 */
export type FetchResult<
  M extends Models,
  Q extends SchemaQueries<M>,
> = FetchResultEntity<M, Q>[];

/**
 * An entity fetched from the database, based on a CollectionQuery
 */
// NOTE: Optimally we wouldnt need to provide Models and could get it from collection query, however that breaks our typechecking (not statically, only at runtime)
// That may indicate a bug with our typechecking library, but for now we'll provide the schema as a parameter
export type FetchResultEntity<
  M extends Models,
  Q extends SchemaQueries<M>,
> = FetchResultEntityFromParts<
  M,
  Q['collectionName'],
  NonNullable<Q['select']>[number],
  NonNullable<Q['include']>
>;

// TODO: we can expose this to users, but it breaks our typechecking if used in internal typing
// export type FetchResultEntity<Q extends CollectionQuery<any, any, any, any>> =
// Q extends CollectionQuery<infer M, infer CN, infer S, infer I>
//   ? FetchResultEntityFromParts<M, CN, S, I>
//   : never;

/**
 * Alias for FetchResultEntity
 */
export type ReturnTypeFromQuery<
  M extends Models,
  Q extends SchemaQueries<M>,
> = FetchResultEntity<M, Q>;

/**
 * An entity fetched form the database, based on the paramters of CollectionQuery
 */
export type FetchResultEntityFromParts<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelection<M, CN> = QuerySelection<M, CN>,
  Inclusion extends QueryInclusions<M, CN> = {},
> = QuerySelectionFilteredTypeFromModel<M, CN, Selection, Inclusion>;

/**
 * The result of a transaction
 * @prop `txId` The transaction ID assigned to the transaction, if completed
 * @prop `output` The output of the transaction callback, if completed
 */
export type TransactionResult<Output> = {
  txId: string | undefined;
  output: Output | undefined;
  isCanceled: boolean;
};
