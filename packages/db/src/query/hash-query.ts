import { hashObject } from '../utils/hash.js';
import { CollectionQuery } from '../types.js';

// Should update this as we add more query properties
const COLLECTION_QUERY_PROPS = [
  'after',
  'collectionName',
  'select',
  // 'entityId',
  'include',
  'limit',
  'order',
  'vars',
  'where',
] as const satisfies (keyof CollectionQuery)[];

/**
 * Hashes a query object to a unique string, ignoring non-query properties. Thus the hash is of the query the server will see.
 */
export function hashQuery<Q extends CollectionQuery>(params: Q) {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([key]) =>
      (COLLECTION_QUERY_PROPS as string[]).includes(key)
    )
  );
  const hash = hashObject(queryParams).toString(); // Hash(queryParams).toString();
  return hash;
}
