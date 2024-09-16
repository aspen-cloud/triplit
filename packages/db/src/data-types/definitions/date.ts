import { UserTypeOptions } from '../types/index.js';
import { calcDefaultValue, userTypeOptionsAreValid } from '../configuration.js';
import {
  TypeWithOptions,
  ValueInterface,
  valueMismatchMessage,
} from './value.js';
import {
  InvalidTypeOptionsError,
  DBSerializationError,
  JSONValueParseError,
} from '../../errors.js';
import { isDateTime } from '../../utils/date.js';

const DATE_OPERATORS = ['=', '!=', '<', '>', '<=', '>=', 'isDefined'] as const;
type DateOperators = typeof DATE_OPERATORS;

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
    supportedOperations: DATE_OPERATORS,
    context: {},
    options,
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
      if (typeof val !== 'string') throw new JSONValueParseError('date', val);
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
      const isValidDate = val instanceof Date && !Number.isNaN(val.getTime());
      const isValidDateString =
        typeof val === 'string' && !Number.isNaN(Date.parse(val));
      const isNullAndValid = options.nullable && val === null;
      if (isValidDate || isValidDateString || isNullAndValid) return;
      return valueMismatchMessage('date', options, val);
    },
    validateTripleValue(val: any) {
      if (options.nullable && val === null) return true;
      if (typeof val !== 'string') return false;
      return isDateTime(val);
    },
    fromString(val: string) {
      return new Date(val);
    },
  };
}
