import { StringType } from '../definitions/string.js';
import { DateType } from '../definitions/date.js';
import { RecordProps, RecordType } from '../definitions/record.js';
import { NumberType } from '../definitions/number.js';
import { BooleanType } from '../definitions/boolean.js';
import { SetType } from '../definitions/set.js';
import {
  ALL_TYPES,
  DEFAULTABLE_TYPE_KEYS,
  PRIMITIVE_TYPE_KEYS,
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

type HasDefault<T extends DataType> = T extends { config?: { default?: any } }
  ? T
  : never;
export type DefaultableType = HasDefault<DataType>;

/**
 * All data types
 */
export type DataType =
  | PrimitiveType
  | SetType<PrimitiveType, any>
  | JsonType
  | RecordType<RecordProps<any, any>>;

export type PrimitiveTypeKeys = (typeof PRIMITIVE_TYPE_KEYS)[number];
export type DefaultableTypeKeys = (typeof DEFAULTABLE_TYPE_KEYS)[number];
export type DataTypeKeys = (typeof ALL_TYPES)[number];
