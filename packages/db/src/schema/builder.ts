import { StringType } from './data-types/definitions/string.js';
import { NumberType } from './data-types/definitions/number.js';
import { BooleanType } from './data-types/definitions/boolean.js';
import { DateType } from './data-types/definitions/date.js';
import {
  DataTypeRecordProps,
  RecordType,
} from './data-types/definitions/record.js';
import { SetType } from './data-types/definitions/set.js';
import type { CollectionNameFromModels, Models } from './types/models.js';
import { DataType, OptionalType, TypeInterface } from './types/index.js';
import { CollectionQuery } from '../query.js';

// Ensures that id is on root schema record
type SchemaProps<Properties = Record<string, DataType>> =
  DataTypeRecordProps<Properties> & {
    id: ReturnType<typeof Schema.Id>;
  };

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

  // /**
  //  * A RelationMany models a one-to-many relationship between two collections. The attribute, when included in a query, is of the shape `Map<string, Entity>`. {@link https://triplit.dev/schemas/relations#relationmany Read more in the docs.}
  //  *
  //  * @param collectionName - the name of the related collection
  //  * @param query - the query to filter the related collection
  //  */
  // TODO: limit query to just 'where', 'order', 'limit', 'after', ...and other fields
  static RelationMany = <
    M extends Models<M> = Models,
    C extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
    Q extends Pick<CollectionQuery<M, C>, 'where' | 'order' | 'limit'> = Pick<
      CollectionQuery<M, C>,
      'where' | 'order' | 'limit'
    >,
  >(
    collectionName: C,
    query: Q
  ) => ({
    query: {
      collectionName,
      ...query,
    },
    cardinality: 'many' as const,
  });

  // /**
  //  * A RelationOne models a one-to-one relationship between two collections. The attribute, when included in a query, will return the first `Entity` that matches to the `query` or `null` if none were found. {@link https://triplit.dev/schemas/relations#relationone Read more in the docs.}
  //  *
  //  * @param collectionName - the name of the related collection
  //  * @param query - the query to filter the related collection
  //  */
  static RelationOne = <
    M extends Models<M> = Models,
    C extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
    Q extends Pick<CollectionQuery<M, C>, 'where' | 'order' | 'limit'> = Pick<
      CollectionQuery<M, C>,
      'where' | 'order' | 'limit'
    >,
  >(
    collectionName: C,
    query: Q
  ) => ({
    query: {
      collectionName,
      ...query,
    },
    cardinality: 'one' as const,
  });

  /**
   * A RelationById models a one-to-one relationship between two collections. The attribute, when included in a query, will return the entity with the provided id or `null` if none were found. {@link https://triplit.dev/schemas/relations#relationbyid Read more in the docs.}
   *
   * @param collectionName - the name of the related collection
   * @param query - the query to filter the related collection
   */
  static RelationById = <C extends CollectionNameFromModels<Models>>(
    collectionName: C,
    entityId: string
  ) => ({
    query: {
      collectionName,
      where: [['id', '=', entityId]] as any,
    },
    cardinality: 'one' as const,
  });

  /**
   * A schema is a collection of fields that define the structure of an entity.
   *
   * @param properties - the fields of the schema
   */
  static Schema<Properties extends SchemaProps<Properties> = SchemaProps>(
    properties: Properties
  ) {
    return RecordType(properties);
  }

  static get Default() {
    return {
      Set: {
        empty: () => ({
          func: 'Set.empty',
          args: null,
        }),
      },
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
  static Optional<T extends TypeInterface>(type: T): OptionalType<T> {
    // @ts-expect-error
    return {
      ...type,
      config: type.config
        ? { ...type.config, optional: true }
        : { optional: true },
    };
  }

  static Collections<M extends Models<M> = Models>(collections: M): M {
    return collections;
  }
}
