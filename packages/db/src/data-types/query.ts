import { CollectionQuery } from '../collection-query';
import { Model } from '../schema';
import { TypeInterface } from './type';

type SubQuery<M extends Model<any>> = Pick<
  CollectionQuery<M>,
  'collectionName' | 'where'
>;

export type QueryType<Query extends SubQuery<any>> = TypeInterface<
  'query',
  Query,
  Query,
  readonly []
> & {
  query: Query;
};

export function QueryType<Q extends SubQuery<any>>(query: Q): QueryType<Q> {
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
      return JSON.parse(val);
    },
    fromString(str: string) {
      return JSON.parse(str);
    },
  };
}
