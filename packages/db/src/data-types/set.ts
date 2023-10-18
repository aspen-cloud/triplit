import {
  InvalidSchemaOptionsError,
  InvalidSetTypeError,
  NotImplementedError,
} from '../errors';
import { TimestampType, ValueType } from './base';
import { CollectionInterface } from './collection';
import {
  CollectionAttributeDefinition,
  VALUE_TYPE_KEYS,
  ValueAttributeDefinition,
} from './serialization';
import { ExtractJSType } from './type';

const SET_OPERATORS = ['=', '!='] as const;
type SetOperators = typeof SET_OPERATORS;

export type SetType<Items extends ValueType<any>> = CollectionInterface<
  'set',
  Set<ExtractJSType<Items>>,
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
    toJSON(): CollectionAttributeDefinition {
      return {
        type: this.type,
        items: this.items.toJSON() as ValueAttributeDefinition,
      };
    },
    convertInputToJson(val: Set<any>) {
      return [...val.values()].reduce((acc, key) => {
        return { ...acc, [key as string]: true };
      }, {});
    },
    // @ts-ignore TODO fix during testing
    default() {
      return new Set(); // TODO: should return record
    },
    convertJsonValueToJS(val) {
      return new Set(
        Object.entries(val)
          .filter(([_k, v]) => !!v)
          .map(([k, _v]) => this.items.fromString(k) as ExtractJSType<Items>)
      );
    },
    validateInput(_val: any) {
      throw new NotImplementedError('Set validation');
    },
  };
}
