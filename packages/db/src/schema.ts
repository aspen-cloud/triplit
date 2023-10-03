import { TObject } from '@sinclair/typebox';
import { ValuePointer } from '@sinclair/typebox/value';
import { InvalidSchemaPathError } from './errors';
import type { CollectionRules } from './db';
import { timestampCompare } from './timestamp';
import type { Attribute, EAV, TripleRow } from './triple-store';
import { objectToTuples } from './utils';
import { entityToResultReducer } from './query';
import { appendCollectionToId, StoreSchema } from './db-helpers';
import {
  typeFromJSON,
  DataType,
  TimestampType,
  ValueType,
} from './data-types/base';
import {
  AttributeDefinition,
  CollectionDefinition,
  CollectionsDefinition,
  SchemaDefinition,
} from './data-types/serialization';
import { StringType } from './data-types/string';
import { NumberType } from './data-types/number';
import { BooleanType } from './data-types/boolean';
import { DateType } from './data-types/date';
import { RecordType } from './data-types/record';
import { SetType } from './data-types/set';
import {
  ExtractDeserializedType,
  ExtractSerializedType,
  ExtractTimestampedType,
} from './data-types/type';

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

  static Schema<T extends SchemaConfig>(config: T) {
    return config;
  }

  static get Default() {
    return {
      uuid: (length?: string) => ({ func: 'uuid', args: [length] }),
      now: () => ({ func: 'now', args: null }),
    };
  }
}

type SchemaConfig = Record<string, DataType>;

export type Model<T extends SchemaConfig = Record<string, DataType>> = T;

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
  model: Record<string, DataType>,
  path: Attribute
): DataType {
  if (path.length === 0) throw new Error('Path must have at least one part'); // TODO: triplit error
  let scope = model[path[0]];
  if (!scope) throw new InvalidSchemaPathError(path as string[]); // TODO: Triplit error
  for (let i = 1; i < path.length; i++) {
    if (!scope) throw new InvalidSchemaPathError(path as string[]); // TODO: Triplit error
    if (scope.type === 'set') {
      // scope = scope.of; // TODO: MAYBE validate here, we're validating a key, returning boolean
      scope = BooleanType(); // TODO: this is wrong? or right?
    } else if (scope.type === 'record') {
      const part = path[i];
      scope = scope.properties[part];
    } else {
      throw new InvalidSchemaPathError(path as string[]); // TODO: Triplit error
    }
  }
  return scope;
}

// export function initialize<M extends Model>(model: M) {
//   return Object.fromEntries(
//     Object.entries(model).map(([key, value]) => [
//       key,
//       Value.Create(value.toTypebox()),
//     ])
//   );
// }

export function updateEntityAtPath(
  entity: any,
  path: Attribute,
  value: any,
  timestamp: TimestampType
) {
  const pointer = '/' + path.join('/');
  const currentValue = ValuePointer.Get(entity, pointer);
  if (currentValue && timestampCompare(timestamp, currentValue[1]) < 0) {
    return;
  }
  ValuePointer.Set(entity, pointer, [value, timestamp]);
}

// type Reference = `ref:${string}`;

export interface SetProxy<T> {
  add: (value: T) => void;
  remove: (value: T) => void;
  has: (value: T) => boolean;
}

type ProxyType<DT> = DT extends DataType
  ? DT extends SetType<infer Of>
    ? SetProxy<ExtractDeserializedType<Of>>
    : ExtractDeserializedType<DT>
  : never;

export type ProxySchema<T extends ReturnType<typeof Schema.Schema>> = {
  [k in keyof T]: k extends string ? ProxyType<T[k]> : never;
};

// Pull out the proxy type from a model by checking the x-serialized-type
export type ProxyTypeFromModel<T extends Model | undefined> = T extends Model
  ? ProxySchema<T>
  : any;

// Used for entity reducer
export type TimestampedTypeFromModel<M extends Model> = {
  [k in keyof M]: ExtractTimestampedType<M[k]>;
};

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
export type InsertTypeFromModel<M extends Model | undefined> = M extends Model
  ? {
      [k in keyof M as DataTypeHasNoDefault<M[k]> extends true
        ? k
        : never]: ExtractDeserializedType<M[k]>;
    } & {
      [k in keyof M as DataTypeHasDefault<M[k]> extends true
        ? k
        : never]?: ExtractDeserializedType<M[k]>;
    }
  : any;

export type JSONTypeFromModel<M extends Model | undefined> = M extends Model
  ? {
      [k in keyof M]: M[k] extends DataType
        ? ExtractDeserializedType<M[k]>
        : never;
    }
  : any;

export type SerializedTypeFromModel<M extends Model | undefined> =
  M extends Model
    ? {
        [k in keyof M]: ExtractSerializedType<M[k]>;
      }
    : any;

export type TimestampedObject =
  | {
      [key: string | number]:
        | [value: any, timestamp: TimestampType]
        | TimestampedObject;
    }
  | [value: any, timestamp: TimestampType][]
  | [value: any, timestamp: TimestampType];

export type UnTimestampedObject<T extends TimestampedObject> = {
  [k in keyof T]: T[k] extends TimestampedObject
    ? UnTimestampedObject<T[k]>
    : T[k] extends [value: infer V, timestamp: TimestampType]
    ? V
    : never;
};

export function serializeClientModel<M extends Model | undefined>(
  entity: JSONTypeFromModel<M>,
  model: M
) {
  const serialized: SerializedTypeFromModel<M> = {} as any;
  for (const [key, val] of Object.entries(entity)) {
    const schema = model?.[key];
    // Schemaless should already be in a serialized format
    // TODO: we can confirm this with typebox validation
    serialized[key] = schema ? schema.serialize(val) : val;
  }
  return serialized;
}

// TODO: make this work with the new typing system
// Keeping for now because it handles rules well
export function timestampedObjectToPlainObject<O extends TimestampedObject>(
  obj: O
): UnTimestampedObject<O> {
  if (typeof obj !== 'object') {
    // throw new Error(`Can't untimestamp a non-object: ${obj}`);
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
  const result: Models<any, any> = {};
  for (const [collectionName, definition] of Object.entries(collections)) {
    const config: SchemaConfig = {};
    const attrs = Object.entries(definition.attributes);
    for (const [path, attrDef] of attrs) {
      config[path] = typeFromJSON(attrDef);
    }
    result[collectionName] = {
      attributes: Schema.Schema(config),
      rules: definition.rules,
    };
  }

  return result;
}

export function tuplesToSchema(triples: TripleRow[]) {
  const schemaEntity = triples.reduce(entityToResultReducer, {});
  const schemaData = timestampedObjectToPlainObject(schemaEntity);
  const version = schemaData.version || 0;
  const collections = schemaData.collections || {};
  return { version, collections: collectionsDefinitionToSchema(collections) };
}

export function schemaToJSON(
  schema: StoreSchema<Models<any, any>>
): SchemaDefinition {
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
  const collectionDefinition: CollectionDefinition = {
    attributes: attributesSchemaToJSON(collection.attributes),
  };
  // TODO: we have a few cases where inserting undefined at a key breaks things...we should fix this at some common insertion point
  if (collection.rules) collectionDefinition.rules = collection.rules;
  return collectionDefinition;
}

export function attributesSchemaToJSON(schema: Model) {
  const attributes: Record<string, AttributeDefinition> = {};
  for (const path of Object.keys(schema)) {
    const type = getSchemaFromPath(schema, [path]);
    // const type = typeFromSchema(pathSchema);
    attributes[path] = type!.toJSON();
  }
  return attributes;
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

export function getDefaultValuesForCollection(
  collection: Collection<SchemaConfig>
) {
  return Object.entries(collection?.attributes).reduce(
    (prev, [attribute, definition]) => {
      const defaultValue = definition.default();
      if (defaultValue !== undefined) {
        prev[attribute] = defaultValue;
      }
      return prev;
    },
    {} as Record<string, any> // TODO: dont use any
  );
}
