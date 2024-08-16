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

const BOOLEAN_OPERATORS = ['=', '!=', 'exists'] as const;
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
    supportedOperations: BOOLEAN_OPERATORS,
    context: {},
    options,
    toJSON() {
      return { type: this.type, options: this.options };
    },
    convertInputToDBValue(val: any) {
      const invalidReason = this.validateInput(val);
      if (invalidReason)
        throw new DBSerializationError('boolean', val, invalidReason);
      return val;
    },
    convertDBValueToJS(val: boolean) {
      return val;
    },
    // @ts-ignore
    convertJSONToJS(val: any) {
      if (options.nullable && val === null) return null;
      if (typeof val !== 'boolean')
        throw new JSONValueParseError('boolean', val);
      return val;
    },
    convertJSToJSON(val: boolean) {
      return val;
    },
    defaultInput() {
      return calcDefaultValue(options) as boolean | undefined;
    },
    validateInput(val: any) {
      if (typeof val === 'boolean' || (!!options.nullable && val === null))
        return;
      return valueMismatchMessage('boolean', options, val);
    },
    validateTripleValue(val: any) {
      return typeof val === 'boolean' || (!!options.nullable && val === null);
    },
    fromString(val: string) {
      return val === 'true';
    },
  };
}
