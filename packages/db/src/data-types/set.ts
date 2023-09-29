import { TimestampType, ValueType } from './base';
import { CollectionInterface } from './collection';
import { VALUE_TYPE_KEYS } from './serialization';
import { ExtractDeserializedType } from './type';

const SET_OPERATORS = ['=', '!='] as const;
type SetOperators = typeof SET_OPERATORS;

export function SetType<Items extends ValueType<any>>(
  items: Items
): CollectionInterface<
  'set',
  Set<ExtractDeserializedType<Items>>,
  Record<string, boolean>,
  Record<string, [boolean, TimestampType]>, // TODO: should be based on the type of the key
  SetOperators
> {
  if (!VALUE_TYPE_KEYS.includes(items.type))
    throw new Error('Invalid set type: ' + items.type); // TODO: triplit error
  if (items.options?.nullable) throw new Error('Set types cannot be nullable'); // TODO: triplit error
  return {
    type: 'set',
    items,
    supportedOperations: SET_OPERATORS,
    toJSON() {
      const json = { type: this.type, items: this.items.toJSON() };
      return json;
    },
    serialize(val) {
      return [...val.values()].reduce((acc, key) => {
        return { ...acc, [key as string]: true };
      }, {});
    },
    deserialize(val: any) {
      return val;
    },
    default() {
      return new Set();
    },
    deserializeCRDT(val) {
      return new Set(
        Object.entries(val)
          .filter(([_k, v]) => !!v[0])
          .map(([k, _v]) => this.items.fromString(k))
      ); // TODO: figure out proper set deserialzied type
    },
    validate(_val: any) {
      throw new Error('TODO: Set validation');
    },
  };
}
export type SetType<Of extends ValueType<any>> = ReturnType<typeof SetType<Of>>;
