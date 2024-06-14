import { CollectionNameFromModels } from '../../db.js';
import { CollectionQuery, QuerySelectionValue } from '../../query.js';
import { Models } from '../../schema/types';

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
