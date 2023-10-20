import { Type } from '@sinclair/typebox';
import { Nullable, calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { UserTypeOptions } from './serialization.js';
import { TypeWithOptions, ValueInterface } from './value.js';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError, SerializingError } from '../errors.js';

const STRING_OPERATORS = ['=', '!=', 'like', 'nlike'] as const;
type StringOperators = typeof STRING_OPERATORS;

export type StringType<TypeOptions extends UserTypeOptions = {}> =
  ValueInterface<
    'string',
    TypeWithOptions<string, TypeOptions>,
    TypeWithOptions<string, TypeOptions>,
    StringOperators
  >;

export function StringType<TypeOptions extends UserTypeOptions = {}>(
  options: TypeOptions = {} as TypeOptions
): StringType<TypeOptions> {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }

  return {
    type: 'string',
    options,
    supportedOperations: STRING_OPERATORS,
    toJSON() {
      return { type: this.type, options: this.options };
    },
    convertInputToJson(val) {
      const valid =
        (options.nullable && val === null) || typeof val === 'string';
      if (!valid) {
        throw new SerializingError('string', val);
      }
      return val;
    },
    convertJsonValueToJS(val) {
      return val;
    },
    default() {
      return calcDefaultValue(options) as string | undefined;
    },
    // THIS IS DB LEVEL VALIDATION!
    validateInput(val) {
      const type = options.nullable ? Nullable(Type.String()) : Type.String();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return val;
    },
  };
}
