import { FetchResult } from '../collection-query.js';
import { CollectionNameFromModels } from '../db.js';
import { CollectionQuery } from '../query.js';
import { Models } from '../schema.js';
import { TypeInterface } from './type.js';

export type SubQuery<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
> = Pick<CollectionQuery<M, CN>, 'collectionName' | 'where'>;

export type QueryResultCardinality = 'one' | 'many';

export type QueryType<Query extends SubQuery<any, any>> = TypeInterface<
  'query',
  FetchResult<Query>,
  any, //TODO: is this even applicable? ... might need to break it out into its own concepts we slowly add to
  readonly []
> & {
  query: Query;
  cardinality: QueryResultCardinality;
};

export function QueryType<Q extends SubQuery<any, any>>(
  query: Q,
  cardinality: QueryResultCardinality = 'many'
): QueryType<Q> {
  return {
    type: 'query' as const,
    cardinality,
    supportedOperations: [] as const, // 'hasKey', etc
    query,
    toJSON() {
      // TODO verify this works with non-memory storage providers
      return { type: this.type, query, cardinality };
    },
    convertInputToDBValue(val: any) {
      return JSON.stringify(val);
    },
    convertDBValueToJS(val) {
      return val as FetchResult<Q>;
    },
    convertJSONToJS(val) {
      throw new Error('Not implemented');
    },
    convertJSToJSON(val) {
      if (!val) return val;
      return Array.from(val.entries());
    },
    // TODO: determine proper value and type here
    // Type should go extract the deserialized type of each of its keys
    defaultInput() {
      return undefined;
    },
    validateInput(_val: any) {
      return undefined; // TODO
    },
    validateTripleValue(_val: any) {
      return true; // TODO
    },
  };
}
