import { CollectionQuery } from '../collection-query';
import { Query } from '../query';
import { DataType } from './base';
import {
  ExtractDeserializedType,
  ExtractSerializedType,
  ExtractTimestampedType,
  TypeInterface,
} from './type';

type SubQuery<M extends Record<string, DataType>> = Pick<
  CollectionQuery<M>,
  'collectionName' | 'where'
>;

export type QueryType<Query extends SubQuery<any>> = TypeInterface<
  'query',
  Query,
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
      return { type: this.type, query };
    },
    serialize(val: any) {
      return JSON.stringify(val);
    },
    deserialize(val: any) {
      return JSON.parse(val);
    },
    // TODO: determine proper value and type here
    // Type should go extract the deserialized type of each of its keys
    default() {
      return undefined;
    },
    validate(_val: any) {
      return true; // TODO
    },
    deserializeCRDT(val) {
      return this.deserialize(val[0]);
    },
    fromString(str: string) {
      return JSON.parse(str);
    },
  };
}
