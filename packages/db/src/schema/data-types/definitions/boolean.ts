import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

type BooleanTypeOptions = BaseTypeOptions;
export type BooleanType<
  Options extends BooleanTypeOptions = BooleanTypeOptions,
> = TypeInterface<'boolean', Options>;
export function BooleanType<Options extends {}>(): BooleanType<Options>;
export function BooleanType<Options extends OptionsInput<BooleanTypeOptions>>(
  options?: Options
): BooleanType<Options>;
export function BooleanType(options?: any): any {
  // TODO: validate Options
  return {
    type: 'boolean',
    config: {
      nullable: options?.nullable,
      default: options?.default,
    },
  } satisfies BooleanType;
}
