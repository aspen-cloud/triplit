import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

export type StringTypeOptions<
  E extends ReadonlyArray<string> = ReadonlyArray<string>,
> = BaseTypeOptions & {
  enum?: readonly [...E];
};
export type StringType<Options extends StringTypeOptions = StringTypeOptions> =
  TypeInterface<'string', Options>;
export function StringType<Options extends {}>(): StringType<Options>;
export function StringType<Options extends OptionsInput<StringTypeOptions>>(
  options: Options &
    (Options['enum'] extends ReadonlyArray<string>
      ? {
          enum: readonly [...Options['enum']];
        }
      : {})
): StringType<Options>;
export function StringType(options?: any): any {
  return {
    type: 'string',
    config: {
      enum: options?.enum,
      nullable: options?.nullable,
      default: options?.default,
    },
  } satisfies StringType;
}
