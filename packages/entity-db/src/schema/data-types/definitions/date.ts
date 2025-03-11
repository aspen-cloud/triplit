import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

type DateTypeOptions = BaseTypeOptions;
export type DateType<Options extends DateTypeOptions = DateTypeOptions> =
  TypeInterface<'date', Options>;
export function DateType<Options extends {}>(): DateType<Options>;
export function DateType<Options extends OptionsInput<DateTypeOptions>>(
  options?: Options
): DateType<Options>;
export function DateType(options?: any): any {
  // TODO: validate options
  return {
    type: 'date',
    config: {
      nullable: options?.nullable,
      default: options?.default,
    },
  } satisfies DateType;
}
