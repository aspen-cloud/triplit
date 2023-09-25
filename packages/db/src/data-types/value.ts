import { TNumber, TString, TBoolean } from '@sinclair/typebox';
import { Operator, TimestampType } from './base';
import { UserTypeOptions } from './serialization';
import { TypeInterface } from './type';

export type ValueSchemaType = TString | TNumber | TBoolean;

export type SerializedValueOverrides = 'date';

export type TypeWithOptions<
  T,
  TypeOptions extends UserTypeOptions
> = TypeOptions['nullable'] extends true ? T | null : T;

export type ValueInterface<
  TypeId extends string = string, // possibly specify known value types
  DeserializedType = any,
  SerializedType = any, // string, number, boolean, array, object
  TimestampedType = [value: DeserializedType, timestamp: TimestampType],
  Operators extends readonly Operator[] = readonly Operator[]
> = TypeInterface<
  TypeId,
  DeserializedType,
  SerializedType,
  TimestampedType,
  Operators
> & {
  readonly options?: UserTypeOptions;

  // TODO: this is for sets...set keys will come from strings...might be a better place to put this
  fromString(val: string): DeserializedType;
};
