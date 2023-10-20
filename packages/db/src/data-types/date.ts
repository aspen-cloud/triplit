import { FormatRegistry, Type } from '@sinclair/typebox';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { UserTypeOptions } from './serialization.js';
import { Nullable, calcDefaultValue, userTypeOptionsAreValid } from './base.js';
import { TypeWithOptions, ValueInterface } from './value.js';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError, SerializingError } from '../errors.js';

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
    convertInputToJson(val: TypeWithOptions<Date, TypeOptions>) {
      const valid = (options.nullable && val === null) || val instanceof Date;
      if (!valid) {
        throw new SerializingError('date', val);
      }
      return (val ? val.toISOString() : null) as TypeWithOptions<
        string,
        TypeOptions
      >;
    },
    default() {
      return calcDefaultValue(options) as string | undefined;
    },
    convertJsonValueToJS(val) {
      return (val ? new Date(val) : null) as TypeWithOptions<Date, TypeOptions>;
    },
    validateInput(val: any) {
      const type = options.nullable ? Nullable(DateSchemaType) : DateSchemaType;
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return new Date(val);
    },
  };
}
