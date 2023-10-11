import { TNumber, TString, TBoolean } from '@sinclair/typebox';
import { Operator, TimestampType } from './base';
import { UserTypeOptions, ValueTypeKeys } from './serialization';
import { TypeInterface } from './type';

export type ValueSchemaType = TString | TNumber | TBoolean;

export type SerializedValueOverrides = 'date';

export type TypeWithOptions<
  T,
  TypeOptions extends UserTypeOptions
> = TypeOptions['nullable'] extends true ? T | null : T;

export type ValueInterface<
  TypeId extends ValueTypeKeys = ValueTypeKeys, // possibly specify known value types
  JSType = any,
  JsonType = any, // string, number, boolean, array, object
  Operators extends readonly Operator[] = readonly Operator[]
> = TypeInterface<TypeId, JSType, JsonType, Operators> & {
  readonly options: UserTypeOptions;

  // TODO: this is for sets...set keys will come from strings...might be a better place to put this
  fromString(val: string): JSType;
};
