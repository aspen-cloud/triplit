import { TimestampType, ValueType } from './base';
import { CollectionInterface } from './collection';
import { ValueSchemaTypes } from './serialization';
import { ExtractDeserializedType } from './type';

const SET_OPERATORS = ['=', '!='] as const;
type SetOperators = typeof SET_OPERATORS;

export function SetType<Of extends ValueType<any>>(
  of: Of
): CollectionInterface<
  'set',
  Set<ExtractDeserializedType<Of>>,
  Record<string, boolean>,
  Record<string, [boolean, TimestampType]>, // TODO: should be based on the type of the key
  SetOperators
> {
  if (!ValueSchemaTypes.includes(of.type))
    throw new Error('Invalid set type: ' + of.type); // TODO: triplit error
  if (of.options?.nullable) throw new Error('Set types cannot be nullable'); // TODO: triplit error
  return {
    type: 'set',
    of,
    supportedOperations: SET_OPERATORS,
    toJSON() {
      const json = { type: this.type, of: this.of.toJSON() };
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
      return Object.entries(val)
        .filter(([_k, v]) => !!v[0])
        .map(([k, _v]) => this.of.fromString(k)); // TODO: figure out proper set deserialzied type
    },
    validate(_val: any) {
      throw new Error('TODO: Set validation');
    },
  };
}
export type SetType<Of extends ValueType<any>> = ReturnType<typeof SetType<Of>>;
