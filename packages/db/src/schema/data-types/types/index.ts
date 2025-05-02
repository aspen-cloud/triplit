import { StringType } from '../definitions/string.js';
import { DateType } from '../definitions/date.js';
import { RecordProps, RecordType } from '../definitions/record.js';
import { NumberType } from '../definitions/number.js';
import { BooleanType } from '../definitions/boolean.js';
import { SetType } from '../definitions/set.js';
import {
  ALL_TYPES,
  PRIMITIVE_TYPE_KEYS,
  RECORD_TYPE_KEYS,
  VALUE_TYPE_KEYS,
} from '../constants.js';
import { JsonType } from '../definitions/json.js';

export * from './operations.js';
export * from './type-codec.js';
export * from './type-definitions.js';

/**
 * All primitive types supported by the schema
 */
export type PrimitiveType =
  | StringType<any>
  | NumberType<any>
  | BooleanType<any>
  | DateType<any>;

/**
 * All values supported by the schema, notably these may take defaults
 */
export type ValueType = PrimitiveType | SetType<PrimitiveType, any> | JsonType; // TODO: find proper home, possibly refactor types

/**
 * All data types
 */
export type DataType = ValueType | RecordType<RecordProps<any, any>, any>;

export type PrimitiveTypeKeys = (typeof PRIMITIVE_TYPE_KEYS)[number];
export type ValueTypeKeys = (typeof VALUE_TYPE_KEYS)[number];
export type RecordTypeKeys = (typeof RECORD_TYPE_KEYS)[number];
export type AllTypes = (typeof ALL_TYPES)[number];
