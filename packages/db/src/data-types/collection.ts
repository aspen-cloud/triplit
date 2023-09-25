import { Operator, ValueType } from './base';
import { TypeInterface } from './type';

export type CollectionInterface<
  TypeId extends string = string,
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
