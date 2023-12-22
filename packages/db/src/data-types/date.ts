import { FormatRegistry, Type } from '@sinclair/typebox';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { UserTypeOptions } from './serialization.js';
import { Nullable, calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import {
  TypeWithOptions,
  ValueInterface,
  valueMismatchMessage,
} from './value.js';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError, DBSerializationError } from '../errors.js';

FormatRegistry.Set(
  'date-time',
  // @ts-ignore
  fullFormats['date-time'].validate
);

const DATE_OPERATORS = ['=', '!=', '<', '>', '<=', '>='] as const;
type DateOperators = typeof DATE_OPERATORS;

const DateSchemaType = Type.String({
  format: 'date-time',
  default: null,
});

export type DateType<TypeOptions extends UserTypeOptions = {}> = ValueInterface<
  'date',
  TypeWithOptions<Date, TypeOptions>,
  TypeWithOptions<string, TypeOptions>,
  DateOperators
>;
export function DateType<TypeOptions extends UserTypeOptions = {}>(
  options: TypeOptions = {} as TypeOptions
): DateType<TypeOptions> {
  if (!userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }

  return {
    type: 'date',
    options,
    supportedOperations: DATE_OPERATORS,

    toJSON() {
      return { type: this.type, options: this.options };
    },
    convertInputToDBValue(val: TypeWithOptions<Date, TypeOptions>) {
      const invalidReason = this.validateInput(val);
      if (invalidReason)
        throw new DBSerializationError('date', val, invalidReason);
      return (val ? new Date(val).toISOString() : null) as TypeWithOptions<
        string,
        TypeOptions
      >;
    },
    convertDBValueToJS(val) {
      return (val ? new Date(val) : null) as TypeWithOptions<Date, TypeOptions>;
    },
    // @ts-ignore
    convertJSONToJS(val) {
      if (options.nullable && val === null) return null;
      if (typeof val !== 'string')
        throw new Error('Invalid JSON value for date');
      return new Date(val);
    },
    convertJSToJSON(val) {
      if (val === null) return val;
      return val.toISOString();
    },
    defaultInput() {
      const dateString = calcDefaultValue(options) as string | undefined;
      if (dateString == null) return dateString;
      return new Date(dateString);
    },
    validateInput(val: any) {
      if (
        val instanceof Date ||
        !Number.isNaN(Date.parse(val)) ||
        (options.nullable && val === null)
      )
        return;
      return valueMismatchMessage('date', options, val);
    },
    validateTripleValue(val: any) {
      const type = options.nullable ? Nullable(DateSchemaType) : DateSchemaType;
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return new Date(val);
    },
  };
}
