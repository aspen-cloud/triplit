import { TypeInterface } from './type.js';
import { UserTypeOptions, CollectionTypeKeys } from '../types/index.js';
import { Operator } from '../../query/types/index.js';
import { ValueInterface } from './value.js';

/**
 * An interface to define data types that contain a collection of items.
 *
 * Example: sets, lists, maps, etc
 */
export type CollectionInterface<
  TypeId extends CollectionTypeKeys = CollectionTypeKeys,
  JSType = any,
  JsonType = any,
  _SchemaType = any,
  Operators extends readonly Operator[] = readonly Operator[],
> = TypeInterface<TypeId, JSType, JsonType, Operators> & {
  readonly items: ValueInterface;
  readonly options: UserTypeOptions;
};
