import { calcDefaultValue, userTypeOptionsAreValid } from '../configuration.js';
import { UserTypeOptions } from '../types/index.js';
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

const STRING_OPERATORS = [
  '<',
  '>',
  '<=',
  '>=',
  '=',
  '!=',
  'like',
  'nlike',
  'in',
  'nin',
  'isDefined',
] as const;
type StringOperators = typeof STRING_OPERATORS;

export type StringType<TypeOptions extends StringTypeOptions<any> = {}> =
  TypeOptions extends StringTypeOptions<infer E>
    ? ValueInterface<
        'string',
        TypeWithOptions<E, TypeOptions>,
        TypeWithOptions<E, TypeOptions>,
        StringOperators,
        TypeOptions
      >
    : never;

export type StringTypeOptions<E extends string> = UserTypeOptions & {
  enum?: ReadonlyArray<E>;
};

export function StringType<
  TypeOptions extends StringTypeOptions<any> = UserTypeOptions,
>(options: TypeOptions = {} as TypeOptions): StringType<TypeOptions> {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }
  // @ts-expect-error
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
      if (options.enum && !options.enum.includes(val))
        return enumMismatchMessage(options.enum, val);
      return;
    },
    validateTripleValue(val) {
      return (
        (typeof val === 'string' &&
          (!options.enum || options.enum.includes(val))) ||
        (!!options.nullable && val === null)
      );
    },
    fromString(val: string) {
      return val;
    },
  };
}

function enumMismatchMessage(enums: readonly string[], val: any) {
  return `Expected a value in the enum [${enums.join(
    ', '
  )}], but got ${val} instead.`;
}
