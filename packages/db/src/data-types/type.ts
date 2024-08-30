import { QueryValue } from '../query/types/index.js';
import { Models } from '../schema/types/index.js';
import { Timestamp } from '../timestamp.js';
import { Operator } from './base.js';
import { AttributeDefinition } from './serialization.js';

export type ExtractJSType<T> = T extends TypeInterface<
  infer _TypeId,
  infer JSType
>
  ? JSType
  : never;

export type ExtractDBType<T> = T extends TypeInterface<
  infer _TypeId,
  infer _JSType,
  infer DBType
>
  ? DBType
  : never;

export type ExtractTimestampedType<T extends TypeInterface> =
  T extends TypeInterface<infer _TypeId, infer _JSType, infer DBType, any>
    ? DBType extends Record<string, infer Value>
      ? Record<string, ExtractJSType<Value>>
      : [DBType, Timestamp]
    : never;

export type ExtractOperators<T extends TypeInterface> = T extends TypeInterface<
  infer _TypeId,
  infer _JSType,
  infer _JsonType,
  infer Operators
>
  ? Operators[number]
  : never;

// TODO: improve type inference based on operator
export type ExtractValueInputs<T extends TypeInterface> = QueryValue;
// T extends TypeInterface<
//   infer _TypeId,
//   infer JSType,
//   infer _JsonType,
//   infer _Operators
// >
//   ? JSType extends QueryValue // This is to protect against JSType being 'unknown'
//     ? JSType
//     : QueryValue
//   : never;

/**
 * This represents a definition of a type that can be used in a collection
 * It can be used to completely define the shape, validation, and serialization of a type
 * Note: it still needs some better restructuring
 */
export type TypeInterface<
  TypeId extends string = string, // possibly specify known value types
  JSType = any,
  DBType = any, // string, number, boolean, array, object
  Operators extends readonly Operator[] = readonly Operator[]
> = {
  readonly type: TypeId;
  readonly supportedOperations: Operators;
  // Context stores additional runtime information about the type
  readonly context: Record<string, any>;
  // How the this definition should be serialized
  // it needs to contain enough information to be able to reconstruct the type
  toJSON(): AttributeDefinition; // TOOD: handle proper typing with nulls too

  // How to convert the input (e.g. from db.insert(..)) to the internal value
  convertInputToDBValue(val: JSType): DBType;

  convertDBValueToJS(val: DBType, schema?: Models): JSType;

  convertJSONToJS(val: any, schema?: Models): JSType;

  convertJSToJSON(val: JSType, schema?: Models): any;

  // Should return a possible user input value
  defaultInput(): JSType | undefined;

  // User input validation
  validateInput(val: any): string | undefined;

  // Triple store validation
  validateTripleValue(val: any): boolean;
};
