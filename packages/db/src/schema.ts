import {
  Static,
  TBoolean,
  TNumber,
  TObject,
  TSchema,
  TString,
  TUnsafe,
  Type,
  TypeGuard,
} from '@sinclair/typebox';
import { Value, ValuePointer } from '@sinclair/typebox/value';
import {
  InvalidSchemaPathError,
  InvalidSchemaType,
  InvalidSetTypeError,
  InvalidTypeError,
  SchemaPathDoesNotExistError,
} from './errors';
import type { CollectionRules } from './db';
import { timestampCompare } from './timestamp';
import type { Attribute, EAV, StoreSchema } from './triple-store';
import { TuplePrefix } from './utility-types';
import { objectToTuples, triplesToObject } from './utils';

// We infer TObject as a return type of some funcitons and this causes issues with consuming packages
// Using solution 3.1 described in this comment as a fix: https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
export type { TObject };

export const Timestamp = Type.Readonly(
  Type.Tuple([Type.Number(), Type.String()])
);
export type TimestampType = Static<typeof Timestamp>;

export function Register<
  T extends TNumber | TBoolean | TString | TUnsafe<string>
>(type: T) {
  return Type.Tuple([type, Timestamp], {
    'x-serialized-type': type.type,
    'x-crdt-type': 'Register',
  });
}

export module Schema {
  export const string = () => Register(Type.String());
  export const number = () => Register(Type.Number());
  export const Boolean = () => Register(Type.Boolean());

  // const StringEnum = TypeSystem.Type<
  //   string,
  //   { values: string[]; type: 'string' }
  // >('StringEnum', (options, value) => {
  //   return typeof value === 'string' && options.values.includes(value);
  // });

  // // TODO: Add support for enums
  // const Enum = (values: string[]) =>
  //   Register(Type.Union(values.map((value) => Type.Literal(value))));

  export function Record(schema: SchemaConfig): RecordType {
    return Type.Object(schema, {
      'x-serialized-type': 'record',
    });
  }
  type ValidSetDataTypes = TNumber | TString;
  export function Set<T extends ValidSetDataTypes>(
    type: ReturnType<typeof Register<T>>
  ) {
    if (!type.items?.length)
      throw new InvalidTypeError(
        "Could not infer the type of this set. Make sure you're passing a valid register type."
      );
    const keyType = type.items[0];
    const setOptions = {
      'x-crdt-type': 'Set',
    };

    if (TypeGuard.TString(keyType))
      return Type.Record(keyType, Register(Type.Boolean()), {
        ...setOptions,
        'x-serialized-type': 'set_string',
      });
    if (TypeGuard.TNumber(keyType))
      return Type.Record(keyType, Register(Type.Boolean()), {
        ...setOptions,
        'x-serialized-type': 'set_number',
      });

    throw new InvalidSetTypeError((keyType as typeof keyType).type);
  }

  export function Schema<Config extends SchemaConfig>(config: Config) {
    return Type.Object(config);
  }
}

// Cant use ReturnType because of issues with cyclic reference
export type RecordType = TObject<SchemaConfig>;

export type RegisterType = ReturnType<
  typeof Register<TNumber | TBoolean | TString>
>;
export type SetType = ReturnType<typeof Schema.Set>;

type DataType = RegisterType | SetType | RecordType;

// type SchemaConfig = Record<string, SchemaConfig | RegisterType<any>>;
export type SchemaConfig = Record<keyof any, DataType>;

export type Model<T extends SchemaConfig> = ReturnType<typeof Schema.Schema<T>>;

export type Collection<T extends SchemaConfig> = {
  attributes: Model<T>;
  rules?: CollectionRules<Model<T>>;
};

export type Models<
  CollectionName extends string,
  T extends SchemaConfig
> = Record<CollectionName, Collection<T>>;

export function getSchemaFromPath<M extends TSchema>(
  model: M,
  path: Attribute
) {
  let scope = model;
  for (let i = 0; i < path.length; i++) {
    const part = path[i];
    // Currently only Sets use Type.Record
    if (TypeGuard.TRecord(scope)) {
      for (const [pattern, valueSchema] of Object.entries(
        scope.patternProperties
      )) {
        // NOTE: im pretty sure the only regex pattern is one that matches all strings
        if (new RegExp(pattern).test(part as string)) {
          return valueSchema as M;
        }
      }
    } else if (TypeGuard.TObject(scope)) {
      if (!scope.properties[part]) {
        throw new SchemaPathDoesNotExistError(path as string[]);
      }
      scope = scope.properties[part] as M;
    } else {
      throw new InvalidSchemaPathError(path as string[]);
    }
  }
  return scope;
}

export function initialize<M extends Model<any>>(model: M) {
  return Value.Create(model);
}

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

export type TypeFromModel<T extends TSchema> = Static<T>;

export type JSONTypeFromModel<T extends Model<any> | undefined> =
  T extends Model<any> ? UnTimestampedObject<Static<T>> : any;

export type TimestampedObject = {
  [key: string | number]:
    | [value: any, timestamp: TimestampType]
    | TimestampedObject;
};

export type UnTimestampedObject<T extends TimestampedObject> = {
  [k in keyof T]: T[k] extends TimestampedObject
    ? UnTimestampedObject<T[k]>
    : T[k] extends [value: infer V, timestamp: TimestampType]
    ? V
    : never;
};

export function objectToTimestampedObject(
  obj: any,
  ts: TimestampType = [0, '']
): TimestampedObject {
  const entries = Object.entries(obj).map(([key, val]) => {
    if (typeof val === 'object' && val != null && !(val instanceof Array)) {
      return [key, objectToTimestampedObject(val)];
    }
    return [key, [val, ts]];
  });
  const result = Object.fromEntries(entries);
  return result;
}

export function timestampedObjectToPlainObject<O extends TimestampedObject>(
  obj: O
): UnTimestampedObject<O> {
  const entries = Object.entries(obj).map(([key, val]) => {
    if (typeof val === 'object' && val != null && !(val instanceof Array)) {
      return [key, timestampedObjectToPlainObject(val)];
    }
    return [key, val[0]];
  });
  //TODO: result statically typed as any
  const result = Object.fromEntries(entries);
  return result;
}

export interface AttributeDefinition {
  type: string;
}

export interface CollectionDefinition {
  attributes: {
    [path: string]: AttributeDefinition;
  };
  rules?: CollectionRules<any>;
}

export interface CollectionsDefinition {
  [collection: string]: CollectionDefinition;
}

export type SchemaDefinition = {
  version: number;
  collections: CollectionsDefinition;
};

function collectionsDefinitionToSchema(
  collections: CollectionsDefinition
): Models<any, any> {
  const result: Models<any, any> = {};
  for (const [collectionName, definition] of Object.entries(collections)) {
    const config: SchemaConfig = {};
    const attrs = Object.entries(definition.attributes);
    for (const [path, attrDef] of attrs) {
      config[path] = attributeDefinitionToSchema(attrDef);
    }
    result[collectionName] = {
      attributes: Schema.Schema(config),
      rules: definition.rules,
    };
  }

  return result;
}

function attributeDefinitionToSchema(schemaItem: AttributeDefinition) {
  const { type } = schemaItem;
  if (type === 'string') return Schema.string();
  if (type === 'boolean') return Schema.Boolean();
  if (type === 'number') return Schema.number();
  if (type === 'set_string') return Schema.Set(Schema.string());
  if (type === 'set_number') return Schema.Set(Schema.number());
  if (type === 'record') return Schema.Record({});
  throw new InvalidSchemaType(type);
}

export function tuplesToSchema(triples: TuplePrefix<EAV>[]) {
  const schemaData = triplesToObject<{
    _schema?: SchemaDefinition;
  }>(triples);
  const version = schemaData._schema?.version || 0;
  const collections = schemaData._schema?.collections || {};
  return { version, collections: collectionsDefinitionToSchema(collections) };
}

// TODO: probably want to handle rules
export function schemaToTriples(schema: StoreSchema<Models<any, any>>): EAV[] {
  const collections: CollectionsDefinition = {};
  for (const [collectionName, model] of Object.entries(schema.collections)) {
    const collection: CollectionDefinition = { attributes: {}, rules: {} };
    for (const path of Object.keys(model.attributes.properties)) {
      const pathSchema = getSchemaFromPath(model.attributes, [path]);
      collection.attributes[path] = {
        type: pathSchema['x-serialized-type'],
      };
    }
    collections[collectionName] = collection;
  }
  const schemaData: SchemaDefinition = { version: schema.version, collections };
  const tuples = objectToTuples(schemaData);
  return tuples.map((tuple) => {
    const value = tuple.pop();
    return ['_schema', tuple, value] as EAV;
  });
}
