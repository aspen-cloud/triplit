import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

type NumberTypeOptions = BaseTypeOptions;
export type NumberType<Options extends NumberTypeOptions = NumberTypeOptions> =
  TypeInterface<'number', Options>;
export function NumberType<Options extends {}>(): NumberType<Options>;
export function NumberType<Options extends OptionsInput<NumberTypeOptions>>(
  options?: Options
): NumberType<Options>;
export function NumberType(options?: any): any {
  // TODO: validate options
  return {
    type: 'number',
    config: {
      nullable: options?.nullable,
      default: options?.default,
    },
  } satisfies NumberType;
}
