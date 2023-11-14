import { FormatRegistry, Type } from '@sinclair/typebox';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { UserTypeOptions } from './serialization.js';
import { Nullable, calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { TypeWithOptions, ValueInterface } from './value.js';
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
      if (!this.validateInput(val)) throw new DBSerializationError('date', val);
      return (val ? val.toISOString() : null) as TypeWithOptions<
        string,
        TypeOptions
      >;
    },
    convertDBValueToJS(val) {
      return (val ? new Date(val) : null) as TypeWithOptions<Date, TypeOptions>;
    },
    convertJSONToJS(val) {
      if (typeof val !== 'string')
        throw new Error('Invalid JSON value for date');
      return new Date(val);
    },
    convertJSToJSON(val) {
      // @ts-expect-error
      return val.toISOString();
    },
    default() {
      return calcDefaultValue(options) as string | undefined;
    },
    validateInput(val: any) {
      return (options.nullable && val === null) || val instanceof Date;
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
