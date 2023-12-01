import { FetchResult } from '../collection-query.js';
import { CollectionNameFromModels } from '../db.js';
import { CollectionQuery } from '../query.js';
import { Models } from '../schema.js';
import { TypeInterface } from './type.js';

export type SubQuery<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
> = Pick<CollectionQuery<M, CN>, 'collectionName' | 'where'>;

export type QueryType<Query extends SubQuery<any, any>> = TypeInterface<
  'query',
  FetchResult<Query>,
  any, //TODO: is this even applicable? ... might need to break it out into its own concepts we slowly add to
  readonly []
> & {
  query: Query;
};

export function QueryType<Q extends SubQuery<any, any>>(
  query: Q
): QueryType<Q> {
  return {
    type: 'query' as const,
    supportedOperations: [] as const, // 'hasKey', etc
    query,
    toJSON() {
      // TODO verify this works with non-memory storage providers
      return { type: this.type, query };
    },
    convertInputToDBValue(val: any) {
      return JSON.stringify(val);
    },
    convertDBValueToJS(val) {
      return val as FetchResult<Q>;
    },
    convertJSONToJS(val) {
      return val;
    },
    convertJSToJSON(val) {
      return val;
    },
    // TODO: determine proper value and type here
    // Type should go extract the deserialized type of each of its keys
    default() {
      return undefined;
    },
    validateInput(_val: any) {
      return true; // TODO
    },
    validateTripleValue(_val: any) {
      return true; // TODO
    },
  };
}
