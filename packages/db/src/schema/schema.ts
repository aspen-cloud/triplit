import { TObject } from '@sinclair/typebox';
import { InvalidSchemaPathError } from '../errors.js';
import type { CollectionNameFromModels } from '../db.js';
import type { Attribute, EAV, TripleRow } from '../triple-store-utils.js';
import {
  dbDocumentToTuples,
  objectToTuples,
  timestampedObjectToPlainObject,
} from '../utils.js';
import { constructEntity } from '../query.js';
import { appendCollectionToId } from '../db-helpers.js';
import { typeFromJSON, DataType, TimestampType } from '../data-types/base.js';
import {
  CollectionDefinition,
  CollectionsDefinition,
  SchemaDefinition,
} from '../data-types/serialization.js';
import { BooleanType } from '../data-types/boolean.js';
import {
  DBTypeFromModel,
  JSTypeFromModel,
  Model,
  Models,
  SchemaConfig,
  Collection,
  StoreSchema,
} from './types';

// We infer TObject as a return type of some funcitons and this causes issues with consuming packages
// Using solution 3.1 described in this comment as a fix: https://github.com/microsoft/TypeScript/issues/47663#issuecomment-1519138189
export type { TObject };

// This will generally be what we store in the DB for a path
// Maybe refactor this to throw InvalidSchemaPathError more efficiently
/**
 * @deprecated use getAttributeFromSchema instead
 */
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

export function createSchemaIterator<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
>(path: string[], schema: M, collectionName: CN) {
  let pathIndex = 0;
  let schemaTraverser = createSchemaTraverser(schema, collectionName);
  const schemaIterator = {
    next() {
      if (pathIndex >= path.length) {
        return { done: true, value: schemaTraverser.current };
      }
      const part = path[pathIndex];
      schemaTraverser = schemaTraverser.get(part);
      pathIndex++;
      return { done: false, value: schemaTraverser.current };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
  return schemaIterator;
}

type Traverser = {
  get(attribute: string): Traverser;
  current: DataType | undefined;
};

export function createSchemaTraverser<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
>(schema: M, collectionName: CN): Traverser {
  // @ts-expect-error
  let current: DataType | undefined = schema[collectionName]?.schema;
  const getter = (attribute: string): Traverser => {
    let next: DataType | undefined = current;
    if (current?.type === 'record') {
      next = current.properties[attribute];
    } else if (current?.type === 'query') {
      const { query } = current;
      return createSchemaTraverser(schema, query.collectionName).get(attribute);
    } else {
      next = undefined;
    }
    current = next;
    return { get: getter, current };
  };
  return {
    get: getter,
    current: schema[collectionName]?.schema as DataType | undefined,
  };
}

export function getAttributeFromSchema<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
>(attribute: string[], schema: M, collectionName: CN) {
  let iter = createSchemaIterator(attribute, schema, collectionName);
  let result = iter.next();
  while (!result.done) {
    result = iter.next();
  }
  return result.value;
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
  delete schemaData['_collection'];
  delete schemaData['id'];
  const version = (schemaData.version as number) || 0;
  const collections = (schemaData.collections as CollectionsDefinition) || {};
  return JSONToSchema({
    ...schemaData,
    version,
    collections,
  });
}

export function JSONToSchema(
  schemaJSON: SchemaDefinition | undefined
): StoreSchema<Models<any, any>> | undefined {
  if (!schemaJSON) return undefined;
  const collections = collectionsDefinitionToSchema(schemaJSON.collections);
  return { ...schemaJSON, version: schemaJSON.version, collections };
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

  // Remove any undefined properties
  const santizedSchema = JSON.parse(
    JSON.stringify({ ...schema, version: schema.version, collections })
  );

  return santizedSchema;
}

function collectionSchemaToJSON(
  collection: Collection<any>
): CollectionDefinition {
  const rulesObj = collection.rules ? { rules: collection.rules } : {};
  const permissionsObj = collection.permissions
    ? { permissions: collection.permissions }
    : {};
  return {
    // @ts-expect-error need to refactor SchemaConfig type + id constant I think
    schema: collection.schema.toJSON() as Model<any>,
    ...rulesObj,
    ...permissionsObj,
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
