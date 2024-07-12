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

export type StringType<TypeOptions extends StringTypeOptions = {}> =
  ValueInterface<
    'string',
    TypeWithOptions<string, TypeOptions>,
    TypeWithOptions<string, TypeOptions>,
    StringOperators
  >;

type StringTypeOptions = UserTypeOptions & {
  enums?: string[];
};

export function StringType<TypeOptions extends StringTypeOptions = {}>(
  options: TypeOptions = {} as TypeOptions
): StringType<TypeOptions> {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }

  return {
    type: 'string',
    supportedOperations: STRING_OPERATORS,
    context: {},
    options,
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
    // @ts-expect-error
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
      if (!!options.nullable && val === null) return;
      if (typeof val !== 'string')
        return valueMismatchMessage('string', options, val);
      if (options.enums && !options.enums.includes(val))
        return enumMismatchMessage(options.enums, val);
      return;
    },
    validateTripleValue(val) {
      return (
        (typeof val === 'string' &&
          (!options.enums || options.enums.includes(val))) ||
        (!!options.nullable && val === null)
      );
    },
    fromString(val: string) {
      return val;
    },
  };
}

function enumMismatchMessage(enums: string[], val: any) {
  return `Expected a value in the enum [${enums.join(
    ', '
  )}], but got ${val} instead.`;
}
