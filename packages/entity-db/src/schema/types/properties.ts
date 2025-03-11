import { Not } from '../../utils/types.js';
import {
  Nullable,
  Optional,
  TypeInterface,
} from '../data-types/types/type-definitions.js';

/**
 * Returns true if the property is optional, otherwise false.
 */
export type IsPropertyReadOptional<T extends TypeInterface> =
  T extends TypeInterface<infer _TypeId, infer Config>
    ? Config extends Optional
      ? true
      : Config extends Nullable
        ? true
        : false
    : false;

/**
 * Returns true if the property is required, otherwise false.
 */
export type IsPropertyReadRequired<T extends TypeInterface> = Not<
  IsPropertyReadOptional<T>
>;

export type IsPropertyWriteOptional<T extends TypeInterface> =
  T extends TypeInterface<infer _TypeId, infer Config>
    ? Config extends Optional
      ? true
      : Config extends Nullable
        ? true
        : Config extends { default: any }
          ? true
          : false
    : false;

export type IsPropertyWriteRequired<T extends TypeInterface> = Not<
  IsPropertyWriteOptional<T>
>;
