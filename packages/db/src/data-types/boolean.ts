import { Type } from '@sinclair/typebox';
import { Nullable, calcDefaultValue, userTypeOptionsAreValid } from './base';
import { UserTypeOptions } from './serialization';
import { TypeWithOptions, ValueInterface } from './value';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError, SerializingError } from '../errors';

const BOOLEAN_OPERATORS = ['=', '!='] as const;
type BooleanOperators = typeof BOOLEAN_OPERATORS;

export type BooleanType<TypeOptions extends UserTypeOptions = {}> =
  ValueInterface<
    'boolean',
    TypeWithOptions<boolean, TypeOptions>,
    TypeWithOptions<boolean, TypeOptions>,
    BooleanOperators
  >;
export function BooleanType<TypeOptions extends UserTypeOptions = {}>(
  options: TypeOptions = {} as TypeOptions
): BooleanType<TypeOptions> {
  if (!userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }
  return {
    type: 'boolean',
    options,
    supportedOperations: BOOLEAN_OPERATORS,

    toJSON() {
      return { type: this.type, options: this.options };
    },
    convertInputToJson(val: any) {
      const valid =
        (options.nullable && val === null) || typeof val === 'boolean';
      if (!valid) {
        throw new SerializingError('boolean', val);
      }
      return val;
    },
    convertJsonValueToJS(val: boolean) {
      return val;
    },
    default() {
      return calcDefaultValue(options) as boolean | undefined;
    },
    validateInput(val: any) {
      const type = options.nullable ? Nullable(Type.Boolean()) : Type.Boolean();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return val === 'true';
    },
  };
}
