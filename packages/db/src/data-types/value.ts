import { TNumber, TString, TBoolean } from '@sinclair/typebox';
import { Operator } from './base.js';
import { UserTypeOptions, ValueTypeKeys } from './serialization.js';
import { TypeInterface } from './type.js';

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
  // Our current rule is that values can go into collections, need this for working with collections
  fromString(val: string): JSType;
};
