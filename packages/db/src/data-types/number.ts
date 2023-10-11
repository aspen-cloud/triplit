import { Type } from '@sinclair/typebox';
import {
  Nullable,
  TimestampType,
  calcDefaultValue,
  userTypeOptionsAreValid,
} from './base';
import { UserTypeOptions, ValueAttributeDefinition } from './serialization';
import { TypeWithOptions, ValueInterface } from './value';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError, SerializingError } from '../errors';

const NUMBER_OPERATORS = ['=', '!=', '<', '>', '<=', '>='] as const;
type NumberOperators = typeof NUMBER_OPERATORS;

export type NumberType<TypeOptions extends UserTypeOptions = {}> =
  ValueInterface<
    'number',
    TypeWithOptions<number, TypeOptions>,
    TypeWithOptions<number, TypeOptions>,
    [TypeWithOptions<number, TypeOptions>, TimestampType],
    NumberOperators
  >;
export function NumberType<TypeOptions extends UserTypeOptions = {}>(
  options: TypeOptions = {} as TypeOptions
): NumberType<TypeOptions> {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }

  return {
    type: 'number',
    options,
    supportedOperations: NUMBER_OPERATORS,

    toJSON(): ValueAttributeDefinition {
      return { type: this.type, options: this.options };
    },
    convertInputToJson(val) {
      const valid =
        (options.nullable && val === null) || typeof val === 'number';
      if (!valid) {
        throw new SerializingError('number', val);
      }
      return val;
    },
    convertJsonValueToJS(val) {
      return val;
    },
    default() {
      return calcDefaultValue(options);
    },
    validateInput(val: any) {
      const type = options.nullable ? Nullable(Type.Number()) : Type.Number();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return parseFloat(val);
    },
  };
}
