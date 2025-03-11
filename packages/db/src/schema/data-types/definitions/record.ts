import { DataType } from '../types/index.js';
import {
  BaseTypeOptions,
  OptionsInput,
  TypeInterface,
} from '../types/type-definitions.js';

export type RecordProps<Key extends string, DT extends TypeInterface> = {
  [K in Key]: DT;
};

// Safe to use in function / runtime definitions
// Use in type defintions may cause circular type errors (ie type RecordType is in the definition of DataType)
export type DataTypeRecordProps<Properties = Record<string, DataType>> = {
  [K in keyof Properties]: Properties[K] extends DataType
    ? Properties[K]
    : never;
};

export type RecordTypeOptions = Omit<BaseTypeOptions, 'default'>;
export type RecordType<
  Properties extends RecordProps<any, any> = RecordProps<any, any>,
  Options extends RecordTypeOptions = RecordTypeOptions,
> = TypeInterface<'record', Options> & {
  properties: Properties;
};
export function RecordType<
  Properties extends DataTypeRecordProps<Properties>,
  Options extends RecordTypeOptions = {},
>(properties: Properties): RecordType<Properties, Options>;
export function RecordType<
  Properties extends DataTypeRecordProps<Properties>,
  Options extends OptionsInput<RecordTypeOptions>,
>(properties: Properties, options: Options): RecordType<Properties, Options>;
export function RecordType(properties: any, options?: any): any {
  return {
    type: 'record',
    config: {
      nullable: options?.nullable,
    },
    properties,
  } satisfies RecordType;
}
