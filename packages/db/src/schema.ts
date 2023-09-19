import {
  FormatRegistry,
  Static,
  TBoolean,
  TDate,
  TNumber,
  TObject,
  TRecord,
  TSchema,
  TString,
  TTuple,
  Type,
  TypeGuard,
} from '@sinclair/typebox';
import { Value, ValuePointer } from '@sinclair/typebox/value';
import {
  InvalidTypeOptionsError,
  InvalidSchemaPathError,
  InvalidSchemaType,
  InvalidSetTypeError,
  InvalidTypeError,
  SchemaPathDoesNotExistError,
} from './errors';
import type { CollectionRules } from './db';
import { timestampCompare } from './timestamp';
import type { Attribute, EAV, StoreSchema, TripleRow } from './triple-store';
import { TuplePrefix } from './utility-types';
import { objectToTuples, triplesToObject } from './utils';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import { nanoid } from 'nanoid';
import { entityToResultReducer } from './query';
import { appendCollectionToId } from './db-helpers';

// We infer TObject as a return type of some funcitons and this causes issues with consuming packages
// Using solution 3.1 described in this comment as a fix: https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
export type { TObject };

export const Timestamp = Type.Readonly(
  Type.Tuple([Type.Number(), Type.String()])
);
type TimestampType = Static<typeof Timestamp>;

// Register
type RegisterBaseType = TNumber | TBoolean | TString | TDate;

type RegisterTypeFromBaseType<T extends RegisterBaseType> = TTuple<
  [T, typeof Timestamp]
> & {
  'x-crdt-type': 'Register';
  'x-serialized-type': T['type'];
};

const Nullable = <T extends RegisterBaseType>(type: T) =>
  Type.Union([type, Type.Null()]);

const DefaultFunctionSchema = Type.Object({
  func: Type.String(),
  args: Type.Optional(Type.Union([Type.Array(Type.Any()), Type.Null()])),
});

export type DefaultFunctionType = Static<typeof DefaultFunctionSchema>;

const UserTypeOptionsSchema = Type.Object({
  nullable: Type.Optional(Type.Boolean()),
  default: Type.Optional(
    Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      DefaultFunctionSchema,
    ])
  ),
});

export type UserTypeOptions = Static<typeof UserTypeOptionsSchema>;

function userTypeOptionsAreValid(options: UserTypeOptions) {
  return Value.Check(UserTypeOptionsSchema, options);
}

export function Register<T extends RegisterBaseType>(
  type: T,
  options?: UserTypeOptions,
  typeOverride?: string
) {
  if (options && !userTypeOptionsAreValid(options)) {
    throw new InvalidTypeOptionsError(options);
  }
  const { nullable, default: defaultValue } = options || {};
  return Type.Tuple([nullable ? Nullable(type) : type, Timestamp], {
    'x-serialized-type': typeOverride || type.type,
    'x-crdt-type': 'Register',
    'x-nullable': !!nullable,
    ...(defaultValue !== undefined && { 'x-default-value': defaultValue }),
  }) as RegisterTypeFromBaseType<T>;
}

type ValidSetDataTypes = TNumber | TString;
type SetTypeFromValidTypes<T extends ValidSetDataTypes> = TRecord<
  T,
  ReturnType<typeof Register<TBoolean>>
> & {
  'x-crdt-type': 'Set';
  'x-serialized-type': T extends TNumber
    ? 'set_number'
    : T extends TString
    ? 'set_string'
    : never;
};

FormatRegistry.Set(
  'date-time',
  // @ts-ignore
  fullFormats['date-time'].validate
);

// Could also use a namespace or module, but this worked best with our type generation
export class Schema {
  static String = (options?: UserTypeOptions) =>
    Register(Type.String(), options);
  static Number = (options?: UserTypeOptions) =>
    Register(Type.Number(), options);
  static Boolean = (options?: UserTypeOptions) =>
    Register(Type.Boolean(options), options);
  static Date = (options?: UserTypeOptions) =>
    Register(
      Type.String({ format: 'date-time', default: null }),
      options,
      'date'
    );

  // const StringEnum = TypeSystem.Type<
  //   string,
  //   { values: string[]; type: 'string' }
  // >('StringEnum', (options, value) => {
  //   return typeof value === 'string' && options.values.includes(value);
  // });

  // // TODO: Add support for enums
  // const Enum = (values: string[]) =>
  //   Register(Type.Union(values.map((value) => Type.Literal(value))));

  static Record(schema: SchemaConfig): RecordType {
    return Type.Object(schema, {
      'x-serialized-type': 'record',
    });
  }

  static Set<T extends ValidSetDataTypes>(
    type: ReturnType<typeof Register<T>>
  ): SetTypeFromValidTypes<T> {
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
      }) as SetTypeFromValidTypes<T>;
    if (TypeGuard.TNumber(keyType))
      return Type.Record(keyType, Register(Type.Boolean()), {
        ...setOptions,
        'x-serialized-type': 'set_number',
      }) as SetTypeFromValidTypes<T>;

    throw new InvalidSetTypeError((keyType as typeof keyType).type);
  }

  static Schema<Config extends SchemaConfig>(config: Config) {
    return Type.Object(config);
  }

  static get Default() {
    return {
      uuid: (length?: string) => ({ func: 'uuid', args: [length] }),
      now: () => ({ func: 'now', args: null }),
    };
  }
}

// Cant use ReturnType because of issues with cyclic reference
export type RecordType = TObject<SchemaConfig>;

export type RegisterType = ReturnType<
  typeof Register<TNumber | TBoolean | TString | TDate>
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
    // Handle sets
    if (TypeGuard.TRecord(scope)) {
      for (const [pattern, valueSchema] of Object.entries(
        scope.patternProperties
      )) {
        // NOTE: im pretty sure the only regex pattern is one that matches all strings
        if (new RegExp(pattern).test(part as string)) {
          return valueSchema as M;
        }
      }
    }
    // Handle records and registers
    else if (TypeGuard.TObject(scope)) {
      if (!scope.properties[part]) {
        throw new SchemaPathDoesNotExistError(path as string[]);
      }
      scope = scope.properties[part] as M;
    } else {
      // TODO: this error could be more specific, in this case the schema object has an unexpected shape so we cant read it
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

// type Reference = `ref:${string}`;

type ValueSerializedSchemaType = 'string' | 'number' | 'boolean' | 'date';
type SetSerializedSchemaType = 'set_string' | 'set_number';
type TerminalSerializedSchemaType =
  | ValueSerializedSchemaType
  | SetSerializedSchemaType;
type SerializedSchemaType = TerminalSerializedSchemaType | 'record';

export interface SetProxy<T> {
  add: (value: T) => void;
  remove: (value: T) => void;
  has: (value: T) => boolean;
}

type ProxyType<
  T extends TSchema & {
    'x-serialized-type': SerializedSchemaType;
  }
> = T['x-serialized-type'] extends 'set_string'
  ? SetProxy<string>
  : T['x-serialized-type'] extends 'set_number'
  ? SetProxy<number>
  : Static<T> extends [infer U, TimestampType]
  ? U
  : never;

export type ProxySchema<T extends ReturnType<typeof Schema.Schema>> = {
  [k in keyof T['properties']]: k extends string
    ? ProxyType<
        // @ts-ignore
        T['properties'][k]
      >
    : never;
};

// Pull out the proxy type from a model by checking the x-serialized-type
export type ProxyTypeFromModel<T extends Model<any> | undefined> =
  T extends Model<any> ? ProxySchema<T> : any;

export type TypeFromModel<T extends TSchema> = Static<T>;

export type JSONTypeFromModel<T extends Model<any> | undefined> =
  T extends Model<any> ? UnTimestampedObject<Static<T>> : any;

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
  if (typeof obj !== 'object') {
    throw new Error(`Can't untimestamp a non-object: ${obj}`);
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

export type AttributeDefinition =
  | {
      type: TerminalSerializedSchemaType;
      options?: UserTypeOptions;
    }
  | { type: 'record'; properties: Record<string, AttributeDefinition> };

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
  if (type === 'string') return Schema.String(schemaItem.options);
  if (type === 'boolean') return Schema.Boolean(schemaItem.options);
  if (type === 'number') return Schema.Number(schemaItem.options);
  if (type === 'date') return Schema.Date(schemaItem.options);
  if (type === 'set_string') return Schema.Set(Schema.String());
  if (type === 'set_number') return Schema.Set(Schema.Number());
  if (type === 'record') {
    const recordSchema: any = Object.fromEntries(
      Object.entries(schemaItem.properties).map(([path, attrDef]) => [
        path,
        attributeDefinitionToSchema(attrDef),
      ])
    );
    return Schema.Record(recordSchema);
  }
  throw new InvalidSchemaType(type);
}

export function tuplesToSchema(triples: TripleRow[]) {
  // const schemaData = timestampedObjectToPlainObject(
  //   triples.reduce(entityToResultReducer, {})
  // );
  const schemaEntity = triples.reduce(entityToResultReducer, {});
  // console.log('schema entity', JSON.stringify(schemaEntity, null, 2));
  const schemaData = timestampedObjectToPlainObject(schemaEntity);
  // console.log('schema data', JSON.stringify(schemaData, null, 2));
  const version = schemaData.version || 0;
  const collections = schemaData.collections || {};
  // console.log('schema data', JSON.stringify(schemaData, null, 2));
  return { version, collections: collectionsDefinitionToSchema(collections) };
}

// TODO: probably want to handle rules
export function schemaToJSON(
  schema: StoreSchema<Models<any, any>>
): SchemaDefinition {
  const collections: CollectionsDefinition = {};
  for (const [collectionName, model] of Object.entries(schema.collections)) {
    const collection: CollectionDefinition = {
      attributes: attributesSchemaToJSON(model.attributes),
      rules: {},
    };
    collections[collectionName] = collection;
  }
  return { version: schema.version, collections };
}

function attributesSchemaToJSON(schema: TObject<any>) {
  const attributes: Record<string, AttributeDefinition> = {};
  for (const path of Object.keys(schema.properties)) {
    const pathSchema = getSchemaFromPath(schema, [path]);
    // recursively expand record types
    if (pathSchema['x-serialized-type'] === 'record') {
      attributes[path] = {
        type: pathSchema['x-serialized-type'],
        properties: attributesSchemaToJSON(pathSchema),
      };
    }
    // handle other leaf types
    else {
      attributes[path] = {
        type: pathSchema['x-serialized-type'],
        options: {
          nullable: pathSchema['x-nullable'] ?? false,
          ...(pathSchema['x-default-value'] !== undefined && {
            default: pathSchema['x-default-value'],
          }),
        },
      };
    }
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
  collection: Collection<Record<string, any>> // would be nice to refactor so we can pull out x-custom-fields
) {
  return Object.entries(collection?.attributes?.properties).reduce(
    (prev, [attribute, definition]) => {
      let attributeDefault = definition['x-default-value'] as
        | UserTypeOptions['default']
        | undefined;
      if (attributeDefault === undefined) {
        // no default object
        return prev;
      }
      if (typeof attributeDefault !== 'object' || attributeDefault === null)
        prev[attribute] = attributeDefault;
      else {
        const { args, func } = attributeDefault;
        if (func === 'uuid')
          prev[attribute] =
            args && typeof args[0] === 'number' ? nanoid(args[0]) : nanoid();
        else if (func === 'now') prev[attribute] = new Date().toISOString();
      }
      return prev;
    },
    {} as Record<string, any>
  );
}
