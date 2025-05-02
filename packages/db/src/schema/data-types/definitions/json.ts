import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

type JsonTypeOptions = BaseTypeOptions;

export type JsonType<Options extends JsonTypeOptions = JsonTypeOptions> =
  TypeInterface<'json', Options>;
export function JsonType<Options extends {}>(): JsonType<Options>;
export function JsonType<Options extends OptionsInput<JsonTypeOptions>>(
  options?: Options
): JsonType<Options>;
export function JsonType(options?: any): any {
  // TODO: validate options
  return {
    type: 'json',
    config: {
      nullable: options?.nullable,
      default: options?.default,
    },
  } satisfies JsonType;
}
