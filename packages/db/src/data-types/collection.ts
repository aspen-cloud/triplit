import { Operator, ValueType } from './base';
import { CollectionTypeKeys } from './serialization';
import { TypeInterface } from './type';

export type CollectionInterface<
  TypeId extends CollectionTypeKeys = CollectionTypeKeys,
  JSType = any,
  JsonType = any,
  _SchemaType = any,
  Operators extends readonly Operator[] = readonly Operator[]
> = TypeInterface<TypeId, JSType, JsonType, Operators> & {
  readonly items: ValueType<any>;
};
