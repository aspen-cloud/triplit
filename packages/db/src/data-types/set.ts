import {
  InvalidSchemaOptionsError,
  InvalidSetTypeError,
  NotImplementedError,
} from '../errors';
import { TimestampType, ValueType } from './base';
import { CollectionInterface } from './collection';
import { VALUE_TYPE_KEYS } from './serialization';
import { ExtractDeserializedType } from './type';

const SET_OPERATORS = ['=', '!='] as const;
type SetOperators = typeof SET_OPERATORS;

export type SetType<Items extends ValueType<any>> = CollectionInterface<
  'set',
  Set<ExtractDeserializedType<Items>>,
  Record<string, boolean>,
  Record<string, [boolean, TimestampType]>, // TODO: should be based on the type of the key
  SetOperators
>;

export function SetType<Items extends ValueType<any>>(
  items: Items
): SetType<Items> {
  if (!VALUE_TYPE_KEYS.includes(items.type))
    throw new InvalidSetTypeError(items.type);
  if (items.options?.nullable)
    throw new InvalidSchemaOptionsError('Set types cannot be nullable');
  return {
    type: 'set',
    items,
    supportedOperations: SET_OPERATORS,
    toJSON() {
      const json = { type: this.type, items: this.items.toJSON() };
      return json;
    },
    convertInputToJson(val: Set<any>) {
      return [...val.values()].reduce((acc, key) => {
        return { ...acc, [key as string]: true };
      }, {});
    },
    default() {
      return new Set();
    },
    convertJsonValueToJS(val) {
      return new Set(
        Object.entries(val)
          .filter(([_k, v]) => !!v)
          .map(([k, _v]) => this.items.fromString(k))
      ); // TODO: figure out proper set deserialzied type
    },
    validateInput(_val: any) {
      throw new NotImplementedError('Set validation');
    },
  };
}
