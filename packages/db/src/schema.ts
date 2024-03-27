import { TObject } from '@sinclair/typebox';
import { InvalidSchemaPathError } from './errors.js';
import type {
  CollectionNameFromModels,
  CollectionRules,
  ModelFromModels,
} from './db.js';
import { Timestamp } from './timestamp.js';
import type { Attribute, EAV, TripleRow } from './triple-store-utils.js';
import { dbDocumentToTuples, objectToTuples } from './utils.js';
import { Entity, EntityPointer, constructEntity } from './query.js';
import { appendCollectionToId, StoreSchema } from './db-helpers.js';
import {
  typeFromJSON,
  DataType,
  TimestampType,
  ValueType,
  Optional,
} from './data-types/base.js';
import {
  CollectionDefinition,
  CollectionsDefinition,
  SchemaDefinition,
  UserTypeOptions,
} from './data-types/serialization.js';
import { StringType } from './data-types/string.js';
import { NumberType } from './data-types/number.js';
import { BooleanType } from './data-types/boolean.js';
import { DateType } from './data-types/date.js';
import { RecordType } from './data-types/record.js';
import { SetType } from './data-types/set.js';
import {
  ExtractJSType,
  ExtractDBType,
  ExtractTimestampedType,
} from './data-types/type.js';
import { QueryType, SubQuery } from './data-types/query.js';
import { Value as TBValue, ValuePointer } from '@sinclair/typebox/value';
import { DBTransaction } from './db-transaction.js';
import DB from './db.js';

// We infer TObject as a return type of some funcitons and this causes issues with consuming packages
// Using solution 3.1 described in this comment as a fix: https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
export type { TObject };

// Could also use a namespace or module, but this worked best with our type generation
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

type SchemaConfig = { id: ReturnType<typeof Schema.Id> } & Record<
  string,
  DataType | Optional<DataType>
>;

export type Model<T extends SchemaConfig> = RecordType<T>;

export type Collection<T extends SchemaConfig = SchemaConfig> = {
  schema: Model<T>;
  rules?: CollectionRules<Model<T>>;
};

export type Models<
  CollectionName extends string,
  T extends SchemaConfig
> = Record<CollectionName, Collection<T>>;

// This will generally be what we store in the DB for a path
// Maybe refactor this to throw InvalidSchemaPathError more efficiently
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
  if (!scope) throw new InvalidSchemaPathError(path as string[]);
  return scope;
}

export type UpdateTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? // If properties are required by the schema, they are required in the update type
      {
        [k in keyof Omit<
          SelectModelFromModel<M>['properties'],
          'id'
        > as IsPropertyRequired<
          SelectModelFromModel<M>['properties'][k]
        > extends true
          ? k
          : never]: ExtractJSType<M['properties'][k]>;
      } & {
        // If properties are optional by the schema, they are optional in the update type
        [k in keyof Omit<
          SelectModelFromModel<M>['properties'],
          'id'
        > as IsPropertyOptional<
          SelectModelFromModel<M>['properties'][k]
        > extends true
          ? k
          : never]?: ExtractJSType<M['properties'][k]>;
      } & { readonly id: string } // The id should be readonly
    : any;

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

export type IsPropertyOptional<T extends DataType> = T extends DataType
  ? T extends Optional<T>
    ? true
    : false
  : never;

type IsPropertyRequired<T extends DataType> = BooleanNot<IsPropertyOptional<T>>;

type InsertOptional<T extends DataType> = T extends DataType
  ? // If the type has a default or is optional, it can be omitted
    DataTypeHasNoDefault<T> extends true
    ? IsPropertyRequired<T> extends true
      ? false
      : true
    : true
  : never;

type InsertRequired<T extends DataType> = BooleanNot<InsertOptional<T>>;

export type InsertTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof SelectModelFromModel<M>['properties'] as InsertRequired<
          M['properties'][k]
        > extends true
          ? k
          : never]: ExtractJSType<M['properties'][k]>;
      } & {
        [k in keyof SelectModelFromModel<M>['properties'] as InsertOptional<
          M['properties'][k]
        > extends true
          ? k
          : never]?: ExtractJSType<M['properties'][k]>;
      }
    : any;

// A subset of the model is available in select
export type SelectModelFromModel<M extends Model<any> | undefined> =
  M extends Model<infer Config>
    ? Config extends SchemaConfig
      ? Model<//@ts-expect-error
        {
          [k in keyof Config as Config[k] extends QueryType<any, any>
            ? never
            : k]: Config[k];
        }>
      : never
    : any;

type JSTypeFromModel<M extends Model<any> | undefined> = M extends Model<any>
  ? {
      [k in keyof M['properties']]: M['properties'][k] extends DataType
        ? ExtractJSType<M['properties'][k]>
        : never;
    }
  : any;

export type DBTypeFromModel<M extends Model<any> | undefined> =
  M extends Model<any>
    ? {
        [k in keyof M['properties']]: ExtractDBType<M['properties'][k]>;
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

export function convertEntityToJS<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
>(
  entity: TimestampedTypeFromModel<ModelFromModels<M, CN>>,
  schema?: M,
  collectionName?: CN
) {
  // remove timestamps
  const untimestampedEntity = timestampedObjectToPlainObject(entity);
  // Clean internal fields from entities
  delete untimestampedEntity._collection;

  // @ts-expect-error - weird types here
  const collectionSchema = schema?.[collectionName]?.schema;

  // convert values based on schema
  return collectionSchema
    ? collectionSchema.convertDBValueToJS(untimestampedEntity, schema)
    : untimestampedEntity;
}

// USE THIS METHOD TO CONVERT USER INPUT DOC TO DB DATA
// One small thing we overlooked here is that we dont account for defaults when serializing a client record for db insert
// and we expect records to be fully hydrated at serialization time
// TODO: determine how we might be able to leverage defaults inside of records
// S.Record({ a: S.String({ default: 'a' }) })
export function clientInputToDbModel<M extends Model<any> | undefined>(
  input: JSTypeFromModel<M>,
  model: M
) {
  if (!model) return input as DBTypeFromModel<M>;
  return model.convertInputToDBValue(input) as DBTypeFromModel<M>;
}

// TODO: perform a pass on this to see how we can improve its types
export function timestampedObjectToPlainObject<O extends TimestampedObject>(
  obj: O,
  maintainKeys?: boolean
): UnTimestampedObject<O> {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (isTimestampedVal(obj)) {
    // @ts-expect-error
    return timestampedObjectToPlainObject(obj[0]);
  }
  if (obj instanceof Array) {
    // @ts-expect-error
    return obj
      .map((v) => timestampedObjectToPlainObject(v))
      .filter((v) => !!maintainKeys || v !== undefined);
  }
  if (obj instanceof Map) {
    // @ts-expect-error
    return new Map(
      Array.from(obj.entries()).map(([key, val]) => {
        return [key, timestampedObjectToPlainObject(val)];
      })
    );
  }
  const entries = Object.entries(obj)
    .map(([key, val]) => {
      return [key, timestampedObjectToPlainObject(val)];
    })
    .filter(([_key, val]) => !!maintainKeys || val !== undefined);
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
          schema: typeFromJSON(collectionDef.schema) as Model<any>,
        },
      ];
    })
  );
}

export function schemaToTriples(schema: StoreSchema<Models<any, any>>): EAV[] {
  const schemaData = schemaToJSON(schema);
  const tuples = dbDocumentToTuples(schemaData);
  const id = appendCollectionToId('_metadata', '_schema');

  // Not sure if this is the best place to do it, but a schema is treated as an entity so needs extra entity triples
  const collectionTuple = [id, ['_collection'], '_metadata'] as EAV;
  const idTuple = [id, ['_metadata', 'id'], '_schema'] as EAV;

  return [
    collectionTuple,
    idTuple,
    ...tuples.map((tuple) => {
      return [id, ['_metadata', ...tuple[0]], tuple[1]] as EAV;
    }),
  ];
}

export function triplesToSchema(triples: TripleRow[]) {
  const schemaEntity = constructEntity(
    triples,
    appendCollectionToId('_metadata', '_schema')
  );
  if (!schemaEntity) return undefined;
  return timestampedSchemaToSchema(schemaEntity.data);
}

export function timestampedSchemaToSchema(
  schema: Record<string, any>
): StoreSchema<Models<any, any>> | undefined {
  const schemaData = timestampedObjectToPlainObject(schema);
  const version = (schemaData.version as number) || 0;
  const collections = (schemaData.collections as CollectionsDefinition) || {};
  return JSONToSchema({
    version,
    collections,
  });
}

export function JSONToSchema(
  schemaJSON: SchemaDefinition | undefined
): StoreSchema<Models<any, any>> | undefined {
  if (!schemaJSON) return undefined;
  const collections = collectionsDefinitionToSchema(schemaJSON.collections);
  return { version: schemaJSON.version, collections };
}

export function schemaToJSON(
  schema: StoreSchema<Models<any, any>>
): SchemaDefinition;
export function schemaToJSON(schema: undefined): undefined;
export function schemaToJSON(
  schema: StoreSchema<Models<any, any> | undefined>
): SchemaDefinition | undefined;
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
    // @ts-expect-error need to refactor SchemaConfig type + id constant I think
    schema: collection.schema.toJSON() as Model<any>,
    ...rulesObj,
  };
}

export function getDefaultValuesForCollection(
  collection: Collection<SchemaConfig>
) {
  return collection.schema.defaultInput();
}

// Poor man's hash function for schema
// Using this in place of a version check on schemas for syncing
// Schema versions are harder to manage with console updates
// Using this hash as a way to check if schemas mismatch since its easy to send as a url param
export function hashSchemaJSON(collections: CollectionsDefinition | undefined) {
  if (!collections) return undefined;
  // TODO: dont use this method if avoidable...trying to deprecate
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

type ChangeToAttribute =
  | {
      type: 'update';
      changes: {
        items?: { type: string };
        type?: string;
        options?: any;
        optional?: boolean;
      };
    }
  | {
      type: 'insert';
      metadata: {
        type: string;
        options: any;
        optional: boolean;
      };
    }
  | {
      type: 'delete';
      metadata: {
        type: string;
        options: any;
        optional: boolean;
      };
    };

type AttributeDiff = {
  attribute: string[];
} & ChangeToAttribute;

type CollectionAttributeDiff = {
  collection: string;
} & AttributeDiff;
// type AttributeDiff = AttributeChange;

export function diffCollections(
  modelA: Model<any> | undefined,
  modelB: Model<any> | undefined,
  attributePathPrefix: string[] = []
): AttributeDiff[] {
  if (modelA === undefined && modelB === undefined) return [];
  const propertiesA = modelA?.properties ?? {};
  const propertiesB = modelB?.properties ?? {};
  const allProperties = new Set([
    ...Object.keys(propertiesA),
    ...Object.keys(propertiesB),
  ]);

  const diff: AttributeDiff[] = [];

  for (const prop of allProperties) {
    if (!(prop in propertiesA)) {
      // Added in modelB
      const path = [...attributePathPrefix, prop];
      diff.push({
        type: 'insert',
        attribute: path,
        metadata: {
          type: propertiesB[prop].type,
          options: propertiesB[prop].options,
          optional: modelB?.optional?.includes(prop) ?? false,
        },
      });
      continue;
    }
    if (!(prop in propertiesB)) {
      // Deleted in modelB
      const path = [...attributePathPrefix, prop];
      diff.push({
        type: 'delete',
        attribute: path,
        metadata: {
          type: propertiesA[prop].type,
          options: propertiesA[prop].options,
          optional: modelA?.optional?.includes(prop) ?? false,
        },
      });
      continue;
    }
    if (prop in propertiesA && prop in propertiesB) {
      if (
        TBValue.Equal(propertiesA[prop].toJSON(), propertiesB[prop].toJSON()) &&
        (modelA?.optional?.includes(prop) ?? false) ===
          (modelB?.optional?.includes(prop) ?? false)
      )
        continue;
      const path = [...attributePathPrefix, prop];

      if (
        propertiesA[prop].type === 'record' &&
        propertiesB[prop].type === 'record'
      ) {
        // console.log('diffing record', propertiesA[prop], propertiesB[prop]);
        diff.push(
          ...diffCollections(propertiesA[prop], propertiesB[prop], path)
        );
        continue;
      }
      const attrDiff: AttributeDiff = {
        type: 'update',
        attribute: path,
        // TODO: show matt this
        changes: { options: {} },
      };

      // Check if type has changed
      if (propertiesA[prop].type !== propertiesB[prop].type) {
        attrDiff.changes.type = propertiesB[prop].type;
      }

      // Check if Set item type has changed
      if (propertiesA[prop].type === 'set') {
        // console.log(propertiesA[prop], propertiesB[prop]);
        if (propertiesA[prop].items.type !== propertiesB[prop].items.type) {
          attrDiff.changes.items = {
            type: propertiesB[prop].items.type,
          };
        }
      }

      // Check if optionality has changed
      const isOptionalInA = modelA?.optional?.includes(prop) ?? false;
      const isOptionalInB = modelB?.optional?.includes(prop) ?? false;
      if (isOptionalInA !== isOptionalInB) {
        attrDiff.changes.optional = isOptionalInB;
      }

      // Check if type options has changed
      attrDiff.changes.options = diffAttributeOptions(
        propertiesA[prop].options ?? {},
        propertiesB[prop].options ?? {}
      );
      diff.push(attrDiff);
      continue;
    }
  }
  return diff;
}

function diffAttributeOptions(attr1: UserTypeOptions, attr2: UserTypeOptions) {
  const diff: Partial<UserTypeOptions> = {};
  if (attr1.nullable !== attr2.nullable) {
    // TODO: determine how strict we want to be here about false vs. undefined
    diff.nullable = !!attr2.nullable;
  }
  if (attr1.default !== attr2.default) {
    diff.default = attr2.default;
  }
  return diff;
}

export function diffSchemas(
  schemaA: StoreSchema<Models<any, any>>,
  schemaB: StoreSchema<Models<any, any>>
): CollectionAttributeDiff[] {
  const allCollections = new Set([
    ...Object.keys(schemaA.collections),
    ...Object.keys(schemaB.collections),
  ]);
  const diff: CollectionAttributeDiff[] = [];
  for (const collection of allCollections) {
    const collectionA = schemaA.collections[collection];
    const collectionB = schemaB.collections[collection];
    diff.push(
      ...diffCollections(collectionA?.schema, collectionB?.schema).map(
        (change) =>
          ({
            collection,
            ...change,
          } as CollectionAttributeDiff)
      )
    );
  }
  return diff;
}

type ALLOWABLE_DATA_CONSTRAINTS =
  | 'never'
  | 'collection_is_empty'
  | 'attribute_is_empty' // undefined
  | 'attribute_has_no_undefined'
  | 'attribute_has_no_null';

type BackwardsIncompatibleEdits = {
  issue: string;
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS;
  context: CollectionAttributeDiff;
};

export function getBackwardsIncompatibleEdits(
  schemaDiff: CollectionAttributeDiff[]
) {
  return schemaDiff.reduce((acc, curr) => {
    const maybeDangerousEdit = DANGEROUS_EDITS.find((check) =>
      check.matchesDiff(curr)
    );
    if (maybeDangerousEdit) {
      acc.push({
        issue: maybeDangerousEdit.description,
        allowedIf: maybeDangerousEdit.allowedIf,
        context: curr,
      });
    }
    return acc;
  }, [] as BackwardsIncompatibleEdits[]);
}

const DANGEROUS_EDITS = [
  {
    description: 'removed an optional attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      return diff.type === 'delete' && diff.metadata.optional === true;
    },
    allowedIf: 'attribute_is_empty',
  },
  {
    description: 'removed a non-optional attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      return diff.type === 'delete';
    },
    allowedIf: 'collection_is_empty',
  },
  {
    description: 'changed a attribute from optional to required',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.optional === false;
      }
      return false;
    },
    allowedIf: 'attribute_has_no_undefined',
  },
  {
    description: 'changed the type of an attribute',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.type !== undefined;
      }
      return false;
    },
    allowedIf: 'attribute_is_empty',
  },
  {
    description: "changed the type of a set's items",
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.items !== undefined;
      }
      return false;
    },
    allowedIf: 'attribute_is_empty',
  },
  {
    description: 'added an attribute where optional is not set',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (
        diff.type === 'insert' &&
        diff.metadata.optional === false &&
        diff.metadata.type !== 'query'
      )
        return true;
      return false;
    },
    allowedIf: 'collection_is_empty',
  },
  {
    description: 'changed an attribute from nullable to non-nullable',
    matchesDiff: (diff: CollectionAttributeDiff) => {
      if (diff.type === 'update') {
        return diff.changes.options?.nullable === false;
      }
      return false;
    },
    allowedIf: 'attribute_has_no_null',
  },
] satisfies {
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS;
  description: string;
  matchesDiff: (diff: CollectionAttributeDiff) => boolean;
}[];

async function isEditSafeWithExistingData(
  tx: DBTransaction<any>,
  attributeDiff: CollectionAttributeDiff,
  allowedIf: ALLOWABLE_DATA_CONSTRAINTS
) {
  return await DATA_CONSTRAINT_CHECKS[allowedIf](
    tx,
    attributeDiff.collection,
    attributeDiff.attribute
  );
}

export type PossibleDataViolations = {
  violatesExistingData: boolean;
  cure: string;
} & BackwardsIncompatibleEdits;

export async function getSchemaDiffIssues(
  db: DB<any>,
  schemaDiff: CollectionAttributeDiff[]
) {
  const backwardsIncompatibleEdits = getBackwardsIncompatibleEdits(schemaDiff);
  const results = await db.transact(async (tx) => {
    return Promise.all(
      backwardsIncompatibleEdits.map(async (edit) => {
        const violatesExistingData = !(await isEditSafeWithExistingData(
          tx,
          edit.context,
          edit.allowedIf
        ));
        const dataCure = DATA_CHANGE_CURES[edit.allowedIf](
          edit.context.collection,
          edit.context.attribute
        );
        const attributeCure = ATTRIBUTE_CHANGE_CURES[edit.issue](
          edit.context.collection,
          edit.context.attribute
        );
        return {
          ...edit,
          violatesExistingData,
          cure: attributeCure ? attributeCure + ' or ' + dataCure : dataCure,
        };
      })
    );
  });
  return results.output as PossibleDataViolations[];
}

const DATA_CONSTRAINT_CHECKS: Record<
  ALLOWABLE_DATA_CONSTRAINTS,
  (
    tx: DBTransaction<any>,
    collection: string,
    attribute: string[]
  ) => Promise<boolean>
> = {
  never: async () => false,
  collection_is_empty: detectCollectionIsEmpty,
  attribute_is_empty: detectAttributeIsEmpty,
  attribute_has_no_undefined: detectAttributeHasNoUndefined,
  attribute_has_no_null: detectAttributeHasNoNull,
};

const DATA_CHANGE_CURES: Record<
  ALLOWABLE_DATA_CONSTRAINTS,
  (collection: string, attribute: string[]) => string
> = {
  never: () => 'This edit is never allowed',
  collection_is_empty: (collection) =>
    `delete all entities in '${collection}' to allow this edit`,
  attribute_is_empty: (collection, attribute) =>
    `set all values of '${attribute.join(
      '.'
    )}' to undefined to allow this edit`,
  attribute_has_no_undefined: (collection, attribute) =>
    `ensure all values of '${attribute.join(
      '.'
    )}' are not undefined to allow this edit`,
  attribute_has_no_null: (collection, attribute) =>
    `ensure all values of '${attribute.join(
      '.'
    )}' are not null to allow this edit`,
};

type DangerousEdits = (typeof DANGEROUS_EDITS)[number]['description'];

const ATTRIBUTE_CHANGE_CURES: Record<
  DangerousEdits,
  (collection: string, attribute: string[]) => string | null
> = {
  'removed an optional attribute': (_collection, _attribute) => null,
  'removed a non-optional attribute': (_collection, attribute) =>
    `make '${attribute.join('.')}' optional`,
  'changed a attribute from optional to required': () => null,
  'changed the type of an attribute': (_collection, attribute) =>
    `leave '${attribute.join(
      '.'
    )}' unchanged and create a different, optional, attribute with the new type`,
  "changed the type of a set's items": (_collection, attribute) =>
    `leave '${attribute.join(
      '.'
    )}' unchanged and create a different, optional, attribute with the new type`,
  'added an attribute where optional is not set': (_collection, attribute) =>
    `make '${attribute.join('.')}' optional`,
  'changed an attribute from nullable to non-nullable': () => null,
};

async function detectAttributeHasNoUndefined(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .build(),
    { skipRules: true }
  );
  return !Array.from(allEntities.values()).some(
    (entity) =>
      ValuePointer.Get(entity, '/' + attribute.join('/')) === undefined
  );
}

async function detectAttributeIsEmpty(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .build(),
    { skipRules: true }
  );
  return Array.from(allEntities.values()).every((entity) => {
    return ValuePointer.Get(entity, '/' + attribute.join('/')) === undefined;
  });
}

async function detectAttributeHasNoNull(
  tx: DBTransaction<any>,
  collectionName: string,
  attribute: string[]
) {
  const allEntities = await tx.fetch(
    tx.db
      .query(collectionName)
      .select([attribute.join('.')])
      .where(attribute.join('.'), '=', null)
      .limit(1)
      .build(),
    { skipRules: true }
  );
  return allEntities.size === 0;
}

async function detectCollectionIsEmpty(
  tx: DBTransaction<any>,
  collectionName: string
) {
  const allEntities = await tx.fetch(
    tx.db.query(collectionName).select([]).limit(1).build(),
    { skipRules: true }
  );
  return allEntities.size === 0;
}
