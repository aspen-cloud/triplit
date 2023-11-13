import { Type } from '@sinclair/typebox';
import { Nullable, calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { UserTypeOptions, ValueAttributeDefinition } from './serialization.js';
import { TypeWithOptions, ValueInterface } from './value.js';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError, DBSerializationError } from '../errors.js';

const NUMBER_OPERATORS = ['=', '!=', '<', '>', '<=', '>='] as const;
type NumberOperators = typeof NUMBER_OPERATORS;

export type NumberType<TypeOptions extends UserTypeOptions = {}> =
  ValueInterface<
    'number',
    TypeWithOptions<number, TypeOptions>,
    TypeWithOptions<number, TypeOptions>,
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
    convertInputToDBValue(val) {
      if (!this.validateInput(val))
        throw new DBSerializationError('number', val);
      return val;
    },
    convertDBValueToJS(val) {
      return val;
    },
    default() {
      return calcDefaultValue(options) as number | undefined;
    },
    validateInput(val: any) {
      return (options.nullable && val === null) || typeof val === 'number';
    },
    validateTripleValue(val: any) {
      const type = options.nullable ? Nullable(Type.Number()) : Type.Number();
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return parseFloat(val);
    },
  };
}
