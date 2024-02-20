import { calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { UserTypeOptions, ValueAttributeDefinition } from './serialization.js';
import {
  TypeWithOptions,
  ValueInterface,
  valueMismatchMessage,
} from './value.js';
import {
  InvalidTypeOptionsError,
  DBSerializationError,
  JSONValueParseError,
} from '../errors.js';

const NUMBER_OPERATORS = [
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'in',
  'nin',
] as const;
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
    supportedOperations: NUMBER_OPERATORS,
    context: {},
    options,
    toJSON(): ValueAttributeDefinition {
      return { type: this.type, options: this.options };
    },
    convertInputToDBValue(val) {
      const invalidReason = this.validateInput(val);
      if (invalidReason)
        throw new DBSerializationError('number', val, invalidReason);
      return val;
    },
    convertDBValueToJS(val) {
      return val;
    },
    // @ts-ignore
    convertJSONToJS(val) {
      if (options.nullable && val === null) return null;
      if (typeof val !== 'number') throw new JSONValueParseError('number', val);
      return val;
    },
    convertJSToJSON(val) {
      return val;
    },
    defaultInput() {
      return calcDefaultValue(options) as number | undefined;
    },
    validateInput(val: any) {
      if (typeof val === 'number' || (!!options.nullable && val === null))
        return;
      return valueMismatchMessage('number', options, val);
    },
    validateTripleValue(val: any) {
      return typeof val === 'number' || (!!options.nullable && val === null);
    },
    fromString(val: string) {
      return parseFloat(val);
    },
  };
}
