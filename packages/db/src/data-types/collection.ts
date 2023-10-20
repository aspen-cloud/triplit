import { Operator, ValueType } from './base.js';
import { CollectionTypeKeys } from './serialization.js';
import { TypeInterface } from './type.js';

export type CollectionInterface<
  TypeId extends CollectionTypeKeys = CollectionTypeKeys,
  JSType = any,
  JsonType = any,
  _SchemaType = any,
  Operators extends readonly Operator[] = readonly Operator[]
> = TypeInterface<TypeId, JSType, JsonType, Operators> & {
  readonly items: ValueType<any>;
};
