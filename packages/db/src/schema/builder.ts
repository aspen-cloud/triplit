import type { CollectionNameFromModels } from '../db.js';
import { StringType } from '../data-types/string.js';
import { NumberType } from '../data-types/number.js';
import { BooleanType } from '../data-types/boolean.js';
import { DateType } from '../data-types/date.js';
import { RecordType } from '../data-types/record.js';
import { SetType } from '../data-types/set.js';
import { QueryType, SubQuery } from '../data-types/query.js';
import type { SchemaConfig } from './types/models.js';
import { DataType, Optional } from '../data-types/base.js';

// NOTE: when adding new return types they should be exported in the index.ts file
// https://github.com/microsoft/TypeScript/issues/42873
// https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
export class Schema {
  static Id = () =>
    StringType({ nullable: false, default: this.Default.uuid() });
  static String = StringType;
  static Number = NumberType;
  static Boolean = BooleanType;
  static Date = DateType;

  static Record = RecordType;

  static Set = SetType;

  static Query = QueryType;

  static RelationMany = <
    C extends CollectionNameFromModels<any>,
    Q extends Omit<SubQuery<any, C>, 'collectionName'>
  >(
    collectionName: C,
    query: Q
  ) => QueryType({ collectionName, ...query }, 'many');

  static RelationOne = <
    C extends CollectionNameFromModels<any>,
    Q extends Omit<SubQuery<any, C>, 'collectionName'>
  >(
    collectionName: C,
    query: Q
  ) => QueryType({ collectionName, ...query, limit: 1 }, 'one');

  static RelationById = <C extends CollectionNameFromModels<any>>(
    collectionName: C,
    entityId: string
  ) => QueryType({ collectionName, where: [['id', '=', entityId]] }, 'one');

  static Schema<T extends SchemaConfig>(
    ...args: Parameters<typeof this.Record<T>>
  ) {
    return this.Record(...args);
  }

  static get Default() {
    return {
      uuid: (length?: string) => ({
        func: 'uuid',
        args: length ? [length] : null,
      }),
      now: () => ({ func: 'now', args: null }),
    };
  }

  static Optional<T extends DataType>(type: T): Optional<T> {
    type.context.optional = true;
    return type as Optional<T>;
  }
}
