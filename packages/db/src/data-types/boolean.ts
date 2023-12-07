import { calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { UserTypeOptions } from './serialization.js';
import { TypeWithOptions, ValueInterface } from './value.js';
import { InvalidTypeOptionsError, DBSerializationError } from '../errors.js';

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
    convertInputToDBValue(val: any) {
      if (!this.validateInput(val))
        throw new DBSerializationError('boolean', val);
      return val;
    },
    convertDBValueToJS(val: boolean) {
      return val;
    },
    // @ts-ignore
    convertJSONToJS(val: any) {
      if (options.nullable && val === null) return null;
      if (typeof val !== 'boolean')
        throw new Error('Invalid JSON value for boolean');
      return val;
    },
    convertJSToJSON(val: boolean) {
      return val;
    },
    default() {
      return calcDefaultValue(options) as boolean | undefined;
    },
    validateInput(val: any) {
      return (options.nullable && val === null) || typeof val === 'boolean';
    },
    validateTripleValue(val: any) {
      return typeof val === 'boolean' || (!!options.nullable && val === null);
    },
    fromString(val: string) {
      return val === 'true';
    },
  };
}
