import { Operator } from './base';
import { AttributeDefinition } from './serialization';

export type ExtractDeserializedType<T> = T extends TypeInterface<
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
  T extends TypeInterface<
    infer _TypeId,
    infer _DeserializedType,
    infer _SerializedType,
    infer TimestampedType
  >
    ? TimestampedType
    : never;

export type TypeInterface<
  TypeId extends string = string, // possibly specify known value types
  DeserializedType = any,
  SerializedType = any, // string, number, boolean, array, object
  TimestampedType = any,
  Operators extends readonly Operator[] = readonly Operator[]
> = {
  readonly type: TypeId;
  readonly supportedOperations: Operators;

  toJSON(): AttributeDefinition; // TOOD: handle proper typing with nulls too

  serialize(val: DeserializedType): SerializedType;

  deserialize(val: SerializedType): DeserializedType;

  deserializeCRDT(val: TimestampedType): DeserializedType;

  default(): any;

  validate(val: any): boolean;
};
