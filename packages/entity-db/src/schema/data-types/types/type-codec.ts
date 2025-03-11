import { StringKey } from '../../../types.js';
import {
  IsPropertyReadOptional,
  IsPropertyReadRequired,
  IsPropertyWriteOptional,
  IsPropertyWriteRequired,
} from '../../types/properties.js';
import { BooleanType } from '../definitions/boolean.js';
import { DateType } from '../definitions/date.js';
import { NumberType } from '../definitions/number.js';
import { RecordType } from '../definitions/record.js';
import { SetType } from '../definitions/set.js';
import { StringType } from '../definitions/string.js';
import { DataType } from './index.js';

/**
 * Database encoded value for a given data type.
 */
export type Encoded<T extends DataType> = T extends DataType
  ? T extends BooleanType
    ? boolean
    : T extends DateType
      ? string
      : T extends NumberType
        ? number
        : T extends RecordType
          ? EncodedRecord<T>
          : T extends SetType<any>
            ? Record<string, boolean>
            : T extends StringType
              ? StringWithOptions<T>
              : // TODO: use never here?
                any
  : any;

type EncodedRecord<T extends RecordType> = T extends RecordType
  ? {
      [K in StringKey<T['properties']> as IsPropertyReadRequired<
        T['properties'][K]
      > extends true
        ? K
        : never]: Encoded<T['properties'][K]>;
    } & {
      [K in StringKey<T['properties']> as IsPropertyReadOptional<
        T['properties'][K]
      > extends true
        ? K
        : never]?: Encoded<T['properties'][K]> | null | undefined;
    }
  : any;

/**
 * JS decoded value for a given data type.
 */
export type Decoded<T extends DataType> = T extends DataType
  ? T extends BooleanType
    ? boolean
    : T extends DateType
      ? Date
      : T extends NumberType
        ? number
        : T extends RecordType
          ? DecodedRecord<T>
          : T extends SetType<infer Items>
            ? Set<Decoded<Items>>
            : T extends StringType
              ? StringWithOptions<T>
              : // TODO: use never here?
                any
  : any;

type DecodedRecord<T extends RecordType> = T extends RecordType
  ? {
      [K in StringKey<T['properties']> as IsPropertyReadRequired<
        T['properties'][K]
      > extends true
        ? K
        : never]: Decoded<T['properties'][K]>;
    } & {
      [K in StringKey<T['properties']> as IsPropertyReadOptional<
        T['properties'][K]
      > extends true
        ? K
        : never]?: Decoded<T['properties'][K]> | null | undefined;
    }
  : any;

/**
 * JS decoded value for inserts
 */
export type WriteDecoded<T extends DataType> = T extends DataType
  ? T extends BooleanType
    ? boolean
    : T extends DateType
      ? Date | number | string
      : T extends NumberType
        ? number
        : T extends RecordType
          ? WriteDecodedRecord<T>
          : T extends SetType<infer Items>
            ? Set<WriteDecoded<Items>> | WriteDecoded<Items>[]
            : T extends StringType
              ? StringWithOptions<T>
              : // TODO: use never here?
                any
  : any;

type WriteDecodedRecord<T extends RecordType> = T extends RecordType
  ? {
      [K in StringKey<T['properties']> as IsPropertyWriteRequired<
        T['properties'][K]
      > extends true
        ? K
        : never]: WriteDecoded<T['properties'][K]>;
    } & {
      [K in StringKey<T['properties']> as IsPropertyWriteOptional<
        T['properties'][K]
      > extends true
        ? K
        : never]?: WriteDecoded<T['properties'][K]> | null | undefined;
    }
  : any;

/**
 * String type with value options applied
 */
type StringWithOptions<T extends StringType> =
  T extends StringType<infer Options>
    ? Options['enum'] extends ReadonlyArray<infer E>
      ? E
      : string
    : never;
