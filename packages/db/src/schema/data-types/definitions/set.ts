import { PrimitiveType } from '../types/index.js';
import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

type SetTypeOptions = BaseTypeOptions;
export type SetType<
  Items extends PrimitiveType = PrimitiveType,
  Options extends SetTypeOptions = SetTypeOptions,
> = TypeInterface<'set', Options> & {
  items: Items;
};
export function SetType<Items extends PrimitiveType, Options extends {}>(
  items: Items
): SetType<Items, Options>;
export function SetType<
  Items extends PrimitiveType,
  Options extends OptionsInput<SetTypeOptions>,
>(items: Items, options?: Options): SetType<Items, Options>;
export function SetType(items: any, options?: any): any {
  // TODO: validate options
  return {
    type: 'set',
    items,
    config: {
      nullable: options?.nullable,
      default: options?.default,
    },
  } satisfies SetType;
}
