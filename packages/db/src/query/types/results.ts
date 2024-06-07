import { CollectionNameFromModels, ModelFromModels } from '../../db.js';
import {
  CollectionQuery,
  QueryResultCardinality,
  QuerySelectionValue,
  RelationSubquery,
} from '../../query.js';
import {
  Model,
  Models,
  QuerySelectionFitleredTypeFromModel,
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
 * An entity fetched form the database, based on the paramters of CollectionQuery
 */
export type FetchResultEntityFromParts<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  Selection extends QuerySelectionValue<M, CN> = QuerySelectionValue<M, CN>,
  Inclusion extends Record<string, RelationSubquery<M, any>> = {}
> = M extends Models<any, any>
  ? ModelFromModels<M, CN> extends Model<any>
    ? QuerySelectionFitleredTypeFromModel<M, CN, Selection, Inclusion>
    : any
  : any;
