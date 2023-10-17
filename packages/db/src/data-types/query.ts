import { CollectionQuery } from '../collection-query';
import { CollectionNameFromModels } from '../db';
import { Models } from '../schema';
import { TypeInterface } from './type';

export type SubQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Pick<CollectionQuery<M, CN>, 'collectionName' | 'where'>;

export type QueryType<Query extends SubQuery<any, any>> = TypeInterface<
  'query',
  Query,
  string, //TODO: is this even applicable? ... might need to break it out into its own concepts we slowly add to
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
    convertInputToJson(val: any) {
      return JSON.stringify(val);
    },
    // TODO: determine proper value and type here
    // Type should go extract the deserialized type of each of its keys
    default() {
      return undefined;
    },
    validateInput(_val: any) {
      return true; // TODO
    },
    convertJsonValueToJS(val) {
      return JSON.parse(val) as Q;
    },
  };
}
