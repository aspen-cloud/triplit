import { TObject } from '@sinclair/typebox';
import { InvalidSchemaPathError } from './errors';
import type { CollectionRules } from './db';
import { Timestamp } from './timestamp';
import type { Attribute, EAV, TripleRow } from './triple-store';
import { objectToTuples } from './utils';
import { constructEntity } from './query';
import { appendCollectionToId, StoreSchema } from './db-helpers';
import {
  typeFromJSON,
  DataType,
  TimestampType,
  ValueType,
} from './data-types/base';
import {
  CollectionDefinition,
  CollectionsDefinition,
  RecordAttributeDefinition,
  SchemaDefinition,
} from './data-types/serialization';
import { StringType } from './data-types/string';
import { NumberType } from './data-types/number';
import { BooleanType } from './data-types/boolean';
import { DateType } from './data-types/date';
import { RecordType } from './data-types/record';
import { SetType } from './data-types/set';
import {
  ExtractJSType,
  ExtractSerializedType,
  ExtractTimestampedType,
} from './data-types/type';
import { QueryType } from './data-types/query';

// We infer TObject as a return type of some funcitons and this causes issues with consuming packages
// Using solution 3.1 described in this comment as a fix: https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
export type { TObject };

// Could also use a namespace or module, but this worked best with our type generation
export class Schema {
  static String = StringType;
  static Number = NumberType;
  static Boolean = BooleanType;
  static Date = DateType;

  static Record = RecordType;

  static Set = SetType;

  static Query = QueryType;

  static Schema<T extends SchemaConfig>(config: T) {
    return Schema.Record(config);
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
}

type SchemaConfig = Record<string, DataType>;

// export type Model<T extends SchemaConfig = Record<string, DataType>> = T;
export type Model<T extends { [k: string]: DataType }> = RecordType<T>;

export type Collection<T extends SchemaConfig = SchemaConfig> = {
  attributes: Model<T>;
  rules?: CollectionRules<Model<T>>;
};

export type Models<
  CollectionName extends string,
  T extends SchemaConfig
> = Record<CollectionName, Collection<T>>;

// This will generally be what we store in the DB for a path
export function getSchemaFromPath(
  model: Model<any>,
  path: Attribute
): DataType {
  if (path.length === 0) throw new InvalidSchemaPathError([]);
  let scope = model.properties[path[0]];
  if (!scope) throw new InvalidSchemaPathError(path as string[]);
  for (let i = 1; i < path.length; i++) {
    if (!scope) throw new InvalidSchemaPathError(path as string[]);
    if (scope.type === 'query') {
      return scope;
    }
    if (scope.type === 'set') {
      // scope = scope.of; // TODO: MAYBE validate here, we're validating a key, returning boolean
      scope = BooleanType(); // TODO: this is wrong? or right?
    } else if (scope.type === 'record') {
      const part = path[i];
      scope = scope.properties[part];
    } else {
      throw new InvalidSchemaPathError(path as string[]);
    }
  }
  return scope;
}

export interface SetProxy<T> {
  add: (value: T) => void;
  remove: (value: T) => void;
  has: (value: T) => boolean;
}

type ProxyType<DT> = DT extends DataType
  ? DT extends SetType<infer Of>
    ? SetProxy<ExtractJSType<Of>>
    : ExtractJSType<DT>
  : never;

// Pull out the proxy type from a model by checking the x-serialized-type
export type ProxyTypeFromModel<T extends Model<any> | undefined> =
  T extends Model<any> ? ProxyType<T> : any;

// Used for entity reducer
export type TimestampedTypeFromModel<M extends Model<any>> =
  ExtractTimestampedType<M>;

// Check if a type is unknown or undefined
type IsUnknownOrUndefined<T> = unknown extends T
  ? true
  : undefined extends T
  ? true
  : false;

type BooleanNot<T extends boolean> = T extends true ? false : true;

type DataTypeHasNoDefault<T extends DataType> = T extends DataType
  ? T extends ValueType<infer TypeOptions>
    ? IsUnknownOrUndefined<TypeOptions['default']>
    : false // sets and records always have defaults (might want to refactor based on return type of default())
  : never;

type DataTypeHasDefault<T extends DataType> = BooleanNot<
  DataTypeHasNoDefault<T>
>;

// Exposed to client
export type InsertTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof M as DataTypeHasNoDefault<M[k]> extends true
          ? k
          : never]: ExtractJSType<M[k]>;
      } & {
        [k in keyof M as DataTypeHasDefault<M[k]> extends true
          ? k
          : never]?: ExtractJSType<M[k]>;
      }
    : any;

export type JSONTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof M]: M[k] extends DataType ? ExtractJSType<M[k]> : never;
      }
    : any;

export type SerializedTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof M]: ExtractSerializedType<M[k]>;
      }
    : any;

export type TimestampedObject = Timestamped<object>;

export type Timestamped<T> = T extends { [key: string]: any }
  ? { [K in keyof T]: Timestamped<T[K]> }
  : [T, Timestamp];

export type UnTimestampedObject<T extends TimestampedObject> = {
  [k in keyof T]: T[k] extends TimestampedObject
    ? UnTimestampedObject<T[k]>
    : T[k] extends [value: infer V, timestamp: TimestampType]
    ? V
    : never;
};

export function convertEntityToJS<M extends Model<any>>(
  entity: TimestampedTypeFromModel<M>,
  schema?: M
) {
  const untimestampedEntity = timestampedObjectToPlainObject(entity);
  return schema
    ? schema.convertJsonValueToJS(untimestampedEntity)
    : untimestampedEntity;
}

export function serializeClientModel<M extends Model<any> | undefined>(
  entity: JSONTypeFromModel<M>,
  model: M
) {
  const serialized: SerializedTypeFromModel<M> = {} as any;
  for (const [key, val] of Object.entries(entity)) {
    const schema = model?.properties?.[key];
    // Schemaless should already be in a serialized format
    // TODO: we can confirm this with typebox validation
    serialized[key] = schema ? schema.convertInputToJson(val) : val;
  }
  return serialized;
}

// TODO: make this work with the new typing system
// Keeping for now because it handles rules well
export function timestampedObjectToPlainObject<O extends TimestampedObject>(
  obj: O
): UnTimestampedObject<O> {
  if (typeof obj !== 'object') {
    return obj;
  }
  if (isTimestampedVal(obj)) {
    return obj[0];
  }
  if (obj instanceof Array) {
    return obj.map((v) => timestampedObjectToPlainObject(v));
  }
  const entries = Object.entries(obj).map(([key, val]) => {
    return [key, timestampedObjectToPlainObject(val)];
  });
  //TODO: result statically typed as any
  const result = Object.fromEntries(entries);
  return result;
}

function isTimestampedVal(val: any) {
  return (
    val instanceof Array &&
    val.length === 2 &&
    val[1] instanceof Array &&
    val[1].length === 2
  );
}

export function collectionsDefinitionToSchema(
  collections: CollectionsDefinition
): Models<any, any> {
  return Object.fromEntries(
    Object.entries(collections).map(([collectionName, collectionDef]) => {
      return [
        collectionName,
        {
          ...collectionDef,
          attributes: typeFromJSON(collectionDef.attributes) as Model<any>,
        },
      ];
    })
  );
}

export function schemaToTriples(schema: StoreSchema<Models<any, any>>): EAV[] {
  const schemaData = schemaToJSON(schema);
  const tuples = objectToTuples(schemaData);
  return tuples.map((tuple) => {
    const value = tuple.pop();
    return [
      appendCollectionToId('_metadata', '_schema'),
      ['_metadata', ...tuple],
      value,
    ] as EAV;
  });
}

export function triplesToSchema(triples: TripleRow[]) {
  const schemaEntity = constructEntity(
    triples,
    appendCollectionToId('_metadata', '_schema')
  );
  const schemaData = timestampedObjectToPlainObject(schemaEntity);
  const version = schemaData.version || 0;
  const collections = schemaData.collections || {};
  return { version, collections: collectionsDefinitionToSchema(collections) };
}

export function schemaToJSON(
  schema: StoreSchema<Models<any, any> | undefined>
): SchemaDefinition | undefined {
  if (!schema) return undefined;
  const collections: CollectionsDefinition = {};
  for (const [collectionName, model] of Object.entries(schema.collections)) {
    const collection = collectionSchemaToJSON(model);
    collections[collectionName] = collection;
  }
  return { version: schema.version, collections };
}

function collectionSchemaToJSON(
  collection: Collection<any>
): CollectionDefinition {
  const rulesObj = collection.rules ? { rules: collection.rules } : {};
  return {
    attributes: collection.attributes.toJSON() as RecordAttributeDefinition,
    ...rulesObj,
  };
}

export function getDefaultValuesForCollection(
  collection: Collection<SchemaConfig>
) {
  return collection.attributes.default();
}

// Poor man's hash function for schema
// Using this in place of a version check on schemas for syncing
// Schema versions are harder to manage with console updates
// Using this hash as a way to check if schemas mismatch since its easy to send as a url param
export function hashSchema(collections: CollectionsDefinition | undefined) {
  if (!collections) return undefined;
  const tuples = objectToTuples(collections);
  const sortedTriplesStr = tuples
    .map((t) => JSON.stringify(t))
    .sort()
    .join('');
  return stringHash(sortedTriplesStr);
}

function stringHash(str: string, base = 31, mod = 1e9 + 9) {
  let hashValue = 0;
  for (let i = 0; i < str.length; i++) {
    hashValue = (hashValue * base + str.charCodeAt(i)) % mod;
  }
  return hashValue;
}
