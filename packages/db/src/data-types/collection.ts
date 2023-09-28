import { Operator, ValueType } from './base';
import { CollectionTypeKeys } from './serialization';
import { TypeInterface } from './type';

export type CollectionInterface<
  TypeId extends CollectionTypeKeys = CollectionTypeKeys,
  DeserializedType = any,
  SerializedType = any,
  SchemaType = any,
  Operators extends readonly Operator[] = readonly Operator[]
> = TypeInterface<
  TypeId,
  DeserializedType,
  SerializedType,
  SchemaType,
  Operators
> & {
  readonly of: ValueType<any>;
};
