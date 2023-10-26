import { Timestamp } from '../timestamp.js';
import { Operator } from './base.js';
import { AttributeDefinition } from './serialization.js';

export type ExtractJSType<T> = T extends TypeInterface<
  infer _TypeId,
  infer DeserializedType
>
  ? DeserializedType
  : never;

export type ExtractSerializedType<T> = T extends TypeInterface<
  infer _TypeId,
  infer _DeserializedType,
  infer SerializedType
>
  ? SerializedType
  : never;

export type ExtractTimestampedType<T extends TypeInterface> =
  T extends TypeInterface<infer _TypeId, infer _JSType, infer JsonType, any>
    ? JsonType extends Record<string, infer Value>
      ? Record<string, ExtractJSType<Value>>
      : [JsonType, Timestamp]
    : never;

export type ExtractOperators<T extends TypeInterface> = T extends TypeInterface<
  infer _TypeId,
  infer _JSType,
  infer _JsonType,
  infer Operators
>
  ? Operators[number]
  : never;

/**
 * This represents a definition of a type that can be used in a collection
 * It can be used to completely define the shape, validation, and serialization of a type
 * Note: it still needs some better restructuring
 */
export type TypeInterface<
  TypeId extends string = string, // possibly specify known value types
  JSType = any,
  JsonType = any, // string, number, boolean, array, object
  Operators extends readonly Operator[] = readonly Operator[]
> = {
  readonly type: TypeId;
  readonly supportedOperations: Operators;
  // How the this definition should be serialized
  // it needs to contain enough information to be able to reconstruct the type
  toJSON(): AttributeDefinition; // TOOD: handle proper typing with nulls too

  // How to convert the input (e.g. from db.insert(..)) to the internal value
  convertInputToJson(val: JSType): JsonType;

  convertJsonValueToJS(val: JsonType): JSType;

  default(): JsonType | undefined;

  // User input validation
  validateInput(val: any): boolean;

  // Triple store validation
  validateTripleValue(val: any): boolean;
};
