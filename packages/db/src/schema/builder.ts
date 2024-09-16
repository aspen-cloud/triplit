import type { CollectionNameFromModels } from '../db.js';
import { StringType } from '../data-types/definitions/string.js';
import { NumberType } from '../data-types/definitions/number.js';
import { BooleanType } from '../data-types/definitions/boolean.js';
import { DateType } from '../data-types/definitions/date.js';
import { RecordType } from '../data-types/definitions/record.js';
import { SetType } from '../data-types/definitions/set.js';
import { QueryType, SubQuery } from '../data-types/definitions/query.js';
import type { Models, SchemaConfig } from './types/models.js';
import { Optional } from '../data-types/types/index.js';
import { TypeInterface } from '../data-types/definitions/type.js';

// NOTE: when adding new return types they should be exported in the index.ts file
// https://github.com/microsoft/TypeScript/issues/42873
// https://github.com/microsoft/TypeScript/pull/58176#issuecomment-2052698294
export class Schema {
  /**
   * The Id data type is string that generates a UUID when the `id` field is omitted from an inserted entity.
   */
  static Id = () =>
    StringType({ nullable: false, default: this.Default.uuid() });
  /**
   * The String data type is equivalent to a JavaScript `string`. {@link https://triplit.dev/schemas/types#string Read more in the docs.}
   *
   * @param options - the options object for the field
   * @param options.nullable - whether the value can be set to `null`
   * @param options.default - the default value for the field. It can be a string literal or the helper function {@link Schema.Default.uuid} to generate a random UUID.
   */
  static String = StringType;

  /**
   * The Number data type is equivalent to a JavaScript `number`. {@link https://triplit.dev/schemas/types#number Read more in the docs.}
   *
   * @param options - the options object for the field
   * @param options.nullable - whether the value can be set to `null`
   * @param options.default - the default value for the field. It can be a number literal.
   */
  static Number = NumberType;

  /**
   * The Boolean data type can be `true` or `false`. {@link https://triplit.dev/schemas/types#boolean Read more in the docs.}
   *
   * @param options - the options object for the field
   * @param options.nullable - whether the value can be set to `null`
   * @param options.default - the default value for the field. It can be a boolean literal.
   */
  static Boolean = BooleanType;

  /**
   * The Date data type is equivalent to a JavaScript `Date`. {@link https://triplit.dev/schemas/types#date Read more in the docs.}
   *
   * @param options - the options object for the field
   * @param options.nullable - whether the value can be set to `null`
   * @param options.default - the default value for the field. It can be `null` or the helper function {@link Schema.Default.now} to generate a current timestamp.
   */
  static Date = DateType;

  /**
   * The Record data type is a nested schema that can be used to model complex data structures. {@link https://triplit.dev/schemas/types#record Read more in the docs.}
   *
   * @param properties - the fields of the record
   */
  static Record = RecordType;

  /**
   * The Set data type is an unordered collection of unique, non-null values. It must be typed as either a {@link Schema.String | String}, {@link Schema.Number | Number}, {@link Schema.Boolean | Boolean} or {@link Schema.Date | Date}. {@link https://triplit.dev/schemas/types#set Read more in the docs.}
   * @param items - the data type of the items in the set
   * @param options - the options object for the field
   * @param options.nullable - whether the field can be set to `null`
   * @param options.default - the default value for the field. For Sets, `null` is the only supported default.
   */
  static Set = SetType;

  static Query = QueryType;

  /**
   * A RelationMany models a one-to-many relationship between two collections. The attribute, when included in a query, is of the shape `Map<string, Entity>`. {@link https://triplit.dev/schemas/relations#relationmany Read more in the docs.}
   *
   * @param collectionName - the name of the related collection
   * @param query - the query to filter the related collection
   */
  static RelationMany = <
    C extends CollectionNameFromModels,
    Q extends SubQuery<Models, C>
  >(
    collectionName: C,
    query: Omit<Q, 'collectionName'>
  ) => QueryType<C, Q, 'many'>({ collectionName, ...query } as Q, 'many');

  /**
   * A RelationOne models a one-to-one relationship between two collections. The attribute, when included in a query, will return the first `Entity` that matches to the `query` or `null` if none were found. {@link https://triplit.dev/schemas/relations#relationone Read more in the docs.}
   *
   * @param collectionName - the name of the related collection
   * @param query - the query to filter the related collection
   */
  static RelationOne = <
    C extends CollectionNameFromModels,
    Q extends SubQuery<Models, C>
  >(
    collectionName: C,
    query: Omit<Q, 'collectionName'>
  ) =>
    QueryType<C, Q, 'one'>({ collectionName, ...query, limit: 1 } as Q, 'one');

  /**
   * A RelationById models a one-to-one relationship between two collections. The attribute, when included in a query, will return the entity with the provided id or `null` if none were found. {@link https://triplit.dev/schemas/relations#relationbyid Read more in the docs.}
   *
   * @param collectionName - the name of the related collection
   * @param query - the query to filter the related collection
   */
  static RelationById = <C extends CollectionNameFromModels>(
    collectionName: C,
    entityId: string
  ) => QueryType({ collectionName, where: [['id', '=', entityId]] }, 'one');

  /**
   * A schema is a collection of fields that define the structure of an entity.
   *
   * @param properties - the fields of the schema
   */
  static Schema<T extends SchemaConfig>(
    ...args: Parameters<typeof this.Record<T>>
  ) {
    return this.Record(...args);
  }

  static get Default() {
    return {
      /**
       * A helper function to add a randomly generated UUID as the default value for a field.
       *
       * @param length - (optional) the length of the UUID
       */
      uuid: (length?: string) => ({
        func: 'uuid',
        args: length ? [length] : null,
      }),
      /**
       * A helper function to add the current timestamp as the default value for a field.
       */
      now: () => ({ func: 'now', args: null }),
    };
  }

  /**
   * Specifies that a field is optional in the schema. When a field is optional, it can be omitted from an entity when inserting it into the database. When omitted, the field will be set to `undefined`.
   *
   * @param type - the data type of the field
   */
  static Optional<T extends TypeInterface>(type: T): Optional<T> {
    type.context.optional = true;
    return type as Optional<T>;
  }
}
