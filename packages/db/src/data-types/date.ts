import { FormatRegistry, Type } from '@sinclair/typebox';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { UserTypeOptions, ValueAttributeDefinition } from './serialization';
import {
  Nullable,
  TimestampType,
  calcDefaultValue,
  userTypeOptionsAreValid,
} from './base';
import { TypeWithOptions, ValueInterface } from './value';
import { Value } from '@sinclair/typebox/value';
import { InvalidTypeOptionsError } from '../errors';

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

export type DateType<TypeOptions extends UserTypeOptions> = ValueInterface<
  'date',
  TypeWithOptions<Date, TypeOptions>,
  TypeWithOptions<string, TypeOptions>,
  [TypeWithOptions<string, TypeOptions>, TimestampType],
  DateOperators
>;
export function DateType<TypeOptions extends UserTypeOptions>(
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
    serialize(val: TypeWithOptions<Date, TypeOptions>) {
      return (val ? val.toISOString() : null) as TypeWithOptions<
        string,
        TypeOptions
      >;
    },
    deserialize(val: TypeWithOptions<string, TypeOptions>) {
      return (val ? new Date(val) : null) as TypeWithOptions<Date, TypeOptions>;
    },
    default() {
      return calcDefaultValue(options);
    },
    deserializeCRDT(val) {
      return this.deserialize(val[0]);
    },
    validate(val: any) {
      const type = options.nullable ? Nullable(DateSchemaType) : DateSchemaType;
      return Value.Check(type, val);
    },
    fromString(val: string) {
      return new Date(val);
    },
  };
}
