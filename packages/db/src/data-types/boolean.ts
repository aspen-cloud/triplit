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

const BOOLEAN_OPERATORS = ['=', '!='] as const;
type BooleanOperators = typeof BOOLEAN_OPERATORS;

export type BooleanType<TypeOptions extends UserTypeOptions> = ValueInterface<
  'boolean',
  TypeWithOptions<boolean, TypeOptions>,
  TypeWithOptions<boolean, TypeOptions>,
  [TypeWithOptions<boolean, TypeOptions>, TimestampType],
  BooleanOperators
>;
export function BooleanType<TypeOptions extends UserTypeOptions>(
  options?: TypeOptions
): BooleanType<TypeOptions> {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }
  return {
    type: 'boolean',
    options,
    supportedOperations: BOOLEAN_OPERATORS,

    toJSON(): ValueAttributeDefinition {
      const json: ValueAttributeDefinition = { type: this.type };
      if (options) {
        json['options'] = options;
      }
      return json;
    },
    serialize(val) {
      const valid =
        (options?.nullable && val === null) || typeof val === 'boolean';
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
      const type = options?.nullable
        ? Nullable(Type.Boolean())
        : Type.Boolean();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return val === 'true';
    },
  };
}
