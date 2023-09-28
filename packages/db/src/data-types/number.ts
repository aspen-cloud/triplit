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
import { InvalidTypeOptionsError } from '../errors';

const NUMBER_OPERATORS = ['=', '!=', '<', '>', '<=', '>='] as const;
type NumberOperators = typeof NUMBER_OPERATORS;

export type NumberType<TypeOptions extends UserTypeOptions> = ValueInterface<
  'number',
  TypeWithOptions<number, TypeOptions>,
  TypeWithOptions<number, TypeOptions>,
  [TypeWithOptions<number, TypeOptions>, TimestampType],
  NumberOperators
>;
export function NumberType<TypeOptions extends UserTypeOptions>(
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
    serialize(val) {
      const valid =
        (options.nullable && val === null) || typeof val === 'number';
      if (!valid) {
        throw new Error('Invalid value for date: ' + val); //TODO: triplit error
      }
      return val;
    },
    deserialize(val) {
      return val;
    },
    deserializeCRDT(val) {
      return this.deserialize(val[0]);
    },
    default() {
      return calcDefaultValue(options);
    },
    validate(val: any) {
      const type = options.nullable ? Nullable(Type.Number()) : Type.Number();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return parseFloat(val);
    },
  };
}
