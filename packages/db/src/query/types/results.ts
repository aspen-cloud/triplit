import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import {
  CollectionQuery,
  QueryInclusions,
  QueryResultCardinality,
  QuerySelection,
} from './collection-query.js';
import {
  Model,
  Models,
  QuerySelectionFilteredTypeFromModel,
} from '../../schema/types';

/**
 * Transforms a complex nested type to a readable type
 */
export type Unalias<T> = T extends Map<infer K, infer V>
  ? Map<K, Unalias<V>>
  : T extends Set<infer V>
  ? Set<Unalias<V>>
  : T extends Date
  ? T
  : T extends Object
  ? { [K in keyof T]: Unalias<T[K]> }
  : T;

/**
 * The expected result of a query given its cardinality
 */
export type QueryResult<
  Q extends CollectionQuery<any, any, any, any>,
  C extends QueryResultCardinality
> = C extends 'one' ? FetchResultEntity<Q> | null : FetchResult<Q>;

/**
 * A map containing the results of a database fetch
 */
export type FetchResult<Q extends CollectionQuery<any, any, any, any>> = Map<
  string,
  FetchResultEntity<Q>
>;

/**
 * An entity fetched from the database, based on a CollectionQuery
 */
export type FetchResultEntity<Q extends CollectionQuery<any, any, any, any>> =
  Q extends CollectionQuery<infer M, infer CN, infer S, infer I>
    ? FetchResultEntityFromParts<M, CN, S, I>
    : any;

/**
 * Alias for FetchResultEntity
 */
export type ReturnTypeFromQuery<Q extends CollectionQuery<any, any, any, any>> =
  FetchResultEntity<Q>;

/**
 * An entity fetched form the database, based on the paramters of CollectionQuery
 */
export type FetchResultEntityFromParts<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelection<M, CN> = QuerySelection<M, CN>,
  Inclusion extends QueryInclusions<M, CN> = {}
> = M extends Models<any, any>
  ? ModelFromModels<M, CN> extends Model<any>
    ? QuerySelectionFilteredTypeFromModel<M, CN, Selection, Inclusion>
    : any
  : any;

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
