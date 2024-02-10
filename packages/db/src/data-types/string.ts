import { calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { UserTypeOptions } from './serialization.js';
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

const STRING_OPERATORS = ['=', '!=', 'like', 'nlike', 'in', 'nin'] as const;
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
    convertInputToDBValue(val) {
      const invalidReason = this.validateInput(val);
      if (invalidReason)
        throw new DBSerializationError('string', val, invalidReason);
      return val;
    },
    convertDBValueToJS(val) {
      return val;
    },
    // @ts-ignore
    convertJSONToJS(val) {
      if (options.nullable && val === null) return null;
      if (typeof val !== 'string') throw new JSONValueParseError('string', val);
      return val;
    },
    convertJSToJSON(val) {
      return val;
    },
    defaultInput() {
      return calcDefaultValue(options) as string | undefined;
    },
    validateInput(val: any) {
      if (typeof val === 'string' || (!!options.nullable && val === null))
        return;
      return valueMismatchMessage('string', options, val);
    },
    validateTripleValue(val) {
      return typeof val === 'string' || (!!options.nullable && val === null);
    },
    fromString(val: string) {
      return val;
    },
  };
}
