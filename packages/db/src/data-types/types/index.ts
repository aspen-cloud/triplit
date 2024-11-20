import { Static } from '@sinclair/typebox';
import { QueryValue } from '../../query/types/index.js';
import { Timestamp } from '../../timestamp.js';
import { TypeInterface } from '../definitions/type.js';
import { UserTypeOptionsSchema } from '../configuration.js';
import { StringType } from '../definitions/string.js';
import { DateType } from '../definitions/date.js';
import { RecordProps, RecordType } from '../definitions/record.js';
import { NumberType } from '../definitions/number.js';
import { BooleanType } from '../definitions/boolean.js';
import { SetType } from '../definitions/set.js';
import { QueryType } from '../definitions/query.js';
import {
  ALL_TYPES,
  COLLECTION_TYPE_KEYS,
  RECORD_TYPE_KEYS,
  VALUE_TYPE_KEYS,
} from '../constants.js';

// TODO: break up into smaller files

// TODO: try to use ValueInterface / TypeInterface instead
export type ValueType<TO extends UserTypeOptions> =
  | StringType<TO>
  | NumberType<TO>
  | BooleanType<TO>
  | DateType<TO>;
export type DataType =
  | ValueType<any>
  | SetType<ValueType<any>, any>
  | QueryType<any, any, any>
  | RecordType<RecordProps<any, any>>;

export type ExtractJSType<T> =
  T extends TypeInterface<infer _TypeId, infer JSType> ? JSType : never;

export type ExtractDBType<T> =
  T extends TypeInterface<infer _TypeId, infer _JSType, infer DBType>
    ? DBType
    : never;

export type ExtractOperators<T extends TypeInterface> =
  T extends TypeInterface<
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

export type Optional<T extends TypeInterface> = T & {
  context: { optional: true };
};

// Could be nice to get a generic to determine the expected value of default
// TODO: rename
export type UserTypeOptions = Static<typeof UserTypeOptionsSchema>;

export type ValueTypeKeys = (typeof VALUE_TYPE_KEYS)[number];
export type CollectionTypeKeys = (typeof COLLECTION_TYPE_KEYS)[number];
export type RecordTypeKeys = (typeof RECORD_TYPE_KEYS)[number];
export type AllTypes = (typeof ALL_TYPES)[number];
