import { Type } from '@sinclair/typebox';
import {
  Nullable,
  TimestampType,
  calcDefaultValue,
  userTypeOptionsAreValid,
} from './base';
import {
  AttributeDefinition,
  UserTypeOptions,
  ValueAttributeDefinition,
} from './serialization';
import { TypeWithOptions, ValueInterface } from './value';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError } from '../errors';

const STRING_OPERATORS = ['=', '!=', 'like', 'nlike'] as const;
type StringOperators = typeof STRING_OPERATORS;

export type StringType<TypeOptions extends UserTypeOptions> = ValueInterface<
  'string',
  TypeWithOptions<string, TypeOptions>,
  TypeWithOptions<string, TypeOptions>,
  [TypeWithOptions<string, TypeOptions>, TimestampType], // TODO: use register?
  StringOperators
>;

export function StringType<TypeOptions extends UserTypeOptions>(
  options?: TypeOptions
): StringType<TypeOptions> {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }

  return {
    type: 'string',
    options,
    supportedOperations: STRING_OPERATORS,

    toJSON(): ValueAttributeDefinition {
      const json: AttributeDefinition = { type: this.type };
      if (options) {
        json['options'] = options;
      }
      return json;
    },
    serialize(val) {
      const valid =
        (options?.nullable && val === null) || typeof val === 'string';
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
    validate(val) {
      const type = options?.nullable ? Nullable(Type.String()) : Type.String();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return val;
    },
  };
}
