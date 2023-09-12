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
import type { Attribute, EAV, StoreSchema } from './triple-store';
import { TuplePrefix } from './utility-types';
import { objectToTuples, triplesToObject } from './utils';
import { fullFormats } from 'ajv-formats/dist/formats';

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

type ValueSerializedSchemaType = 'string' | 'number' | 'boolean' | 'date';
type SetSerializedSchemaType = 'set_string' | 'set_number';
type SerializedSchemaType =
  | ValueSerializedSchemaType
  | SetSerializedSchemaType
  | 'record';

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
  type: SerializedSchemaType;
  options: UserTypeOptions;
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
  const { type, options } = schemaItem;
  if (type === 'string') return Schema.String(options);
  if (type === 'boolean') return Schema.Boolean(options);
  if (type === 'number') return Schema.Number(options);
  if (type === 'date') return Schema.Date(options);
  if (type === 'set_string') return Schema.Set(Schema.String());
  if (type === 'set_number') return Schema.Set(Schema.Number());
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
        options: {
          nullable: pathSchema['x-nullable'],
          ...(pathSchema['x-default-value'] !== undefined && {
            default: pathSchema['x-default-value'],
          }),
        },
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
