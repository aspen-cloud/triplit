import { TripleStoreTransaction } from './triple-store';
import {
  getSchemaFromPath,
  ProxyTypeFromModel,
  Model,
  Models,
  objectToTimestampedObject,
  SetProxy,
  getDefaultValuesForCollection,
  TimestampedObject,
  timestampedObjectToPlainObject,
  collectionsDefinitionToSchema,
} from './schema';
import * as Document from './document';
import { nanoid } from 'nanoid';
import CollectionQueryBuilder, {
  CollectionQuery,
  doesEntityObjMatchWhere,
  fetch,
  FetchResult,
} from './collection-query';
import { EntityNotFoundError, WriteRuleError } from './errors';
import { ValuePointer } from '@sinclair/typebox/value';
import {
  CollectionNameFromModels,
  CollectionFromModels,
  ModelFromModels,
  CreateCollectionOperation,
  DropCollectionOperation,
  AddAttributeOperation,
  DropAttributeOperation,
  DBFetchOptions,
  AlterAttributeOptionOperation,
  DropAttributeOptionOperation,
} from './db';
import {
  validateExternalId,
  appendCollectionToId,
  replaceVariablesInQuery,
  validateTriple,
} from './db-helpers';
import { Query, entityToResultReducer } from './query';
import { objectToTuples } from './utils';

export class DBTransaction<M extends Models<any, any> | undefined> {
  schema: Models<any, any> | undefined;
  private _schema: TimestampedObject | undefined;
  constructor(
    readonly storeTx: TripleStoreTransaction,
    readonly variables?: Record<string, any>,
    schema?: Models<any, any>
  ) {
    this.schema = schema;

    this.storeTx.beforeInsert(async (trips) => {
      const metadataTriples = trips.filter(
        ({ attribute }) => attribute[0] === '_metadata'
      );
      if (metadataTriples.length === 0) return;
      this._schema = metadataTriples.reduce(
        entityToResultReducer,
        this._schema ?? {}
      );
      const schemaDefinition = timestampedObjectToPlainObject(this._schema);
      this.schema = {
        version: schemaDefinition.version ?? 0,
        collections:
          schemaDefinition.collections &&
          collectionsDefinitionToSchema(schemaDefinition.collections),
      };
    });
    this.storeTx.beforeInsert(async (triples) => {
      if (!this.schema) return;
      for (const trip of triples) {
        if (trip.attribute[0] === '_metadata') continue;
        if (trip.attribute[0] === '_collection') continue;
        validateTriple(this.schema.collections, trip.attribute, trip.value);
      }
    });
  }

  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ) {
    const { collections } = (await this.getSchema()) ?? {};
    if (!collections || !collections[collectionName]) return undefined;
    // TODO: i think we need some stuff in the triple store...
    const collectionSchema = collections[
      collectionName
    ] as CollectionFromModels<M, CN>;
    return collectionSchema;
  }

  private addReadRulesToQuery<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    collection: CollectionFromModels<M>
  ): Q {
    if (collection?.rules?.read) {
      const updatedWhere = [
        ...query.where,
        ...collection.rules.read.flatMap((rule) => rule.filter),
      ];
      return { ...query, where: updatedWhere };
    }
    return query;
  }

  async getSchema() {
    return this.schema;
  }

  async commit() {
    await this.storeTx.commit();
  }

  async cancel() {
    await this.storeTx.cancel();
  }

  async insert(
    collectionName: CollectionNameFromModels<M>,
    doc: any,
    id?: string
  ) {
    if (id) {
      const validationError = validateExternalId(id);
      if (validationError) throw validationError;
    }
    const collection = await this.getCollectionSchema(collectionName);
    if (collection) {
      const collectionDefaults = getDefaultValuesForCollection(collection);
      doc = { ...collectionDefaults, ...doc };
    }
    if (collection?.rules?.write?.length) {
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = replaceVariablesInQuery(this, query);
      // TODO there is probably a better way to to this
      // rather than converting to timestamped object check to
      // validate the where filter
      const timestampDoc = objectToTimestampedObject(doc);
      const satisfiedRule = doesEntityObjMatchWhere(
        timestampDoc,
        query.where,
        collection.attributes
      );
      if (!satisfiedRule) {
        // TODO add better error that uses rule description
        throw new WriteRuleError(`Insert does not match write rules`);
      }
    }
    await Document.insert(
      this.storeTx,
      appendCollectionToId(collectionName, id ?? nanoid()),
      doc,
      collectionName
    );
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: ProxyTypeFromModel<ModelFromModels<M, CN>>
    ) => Promise<void>
  ) {
    const collection = (await this.getSchema())?.collections[
      collectionName
    ] as CollectionFromModels<M, CN>;

    const entity = await this.fetchById(collectionName, entityId);

    if (!entity) {
      throw new EntityNotFoundError(
        entityId,
        collectionName,
        "Cannot perform an update on an entity that doesn't exist"
      );
    }
    const changes = {};
    const collectionSchema = collection?.attributes;
    const updateProxy = this.createUpdateProxy<typeof collectionSchema>(
      changes,
      entity,
      collectionSchema
    );
    await updater(updateProxy);
    const changeTuples = objectToTuples(changes);
    const fullEntityId = appendCollectionToId(collectionName, entityId);
    for (let tuple of changeTuples) {
      const path = tuple.slice(0, -1) as string[];
      let value = tuple.at(-1);
      const attribute = [collectionName, ...path];
      // undefined is treated as a delete
      if (value === undefined) {
        const triples = await this.storeTx.findByEAV([fullEntityId, attribute]);
        for (const trip of triples) {
          await this.storeTx.expireEntityAttribute(trip.id, trip.attribute);
        }
        continue;
      }
      value = value instanceof Date ? value.toISOString() : value;
      await this.storeTx.setValue(fullEntityId, attribute, value);
    }
    if (collection?.rules?.write?.length) {
      const updatedEntity = await this.fetchById(collectionName, entityId);
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = replaceVariablesInQuery(this, query);
      const satisfiedRule = doesEntityObjMatchWhere(
        objectToTimestampedObject(updatedEntity),
        query.where,
        collectionSchema
      );
      if (!satisfiedRule) {
        // TODO add better error that uses rule description
        throw new WriteRuleError(`Update does not match write rules`);
      }
    }
  }

  private createUpdateProxy<M extends Model<any> | undefined>(
    changeTracker: {},
    entityObj: ProxyTypeFromModel<M>,
    schema?: M,
    prefix: string = ''
  ): ProxyTypeFromModel<M> {
    return new Proxy(entityObj, {
      set: (_target, prop, value) => {
        const propPointer = [prefix, prop].join('/');
        if (!schema) {
          ValuePointer.Set(changeTracker, propPointer, value);
          return true;
        }
        const propSchema = getSchemaFromPath(
          schema,
          propPointer.slice(1).split('/')
        );
        if (!propSchema) {
          // TODO use correct Triplit Error
          throw new Error(
            `Cannot set unrecognized property ${propPointer} to ${value}`
          );
        }
        ValuePointer.Set(changeTracker, propPointer, value);
        return true;
      },
      deleteProperty: (_target, prop) => {
        const propPointer = [prefix, prop].join('/');
        ValuePointer.Set(changeTracker, propPointer, undefined);
        return true;
      },
      get: (_target, prop) => {
        const propPointer = [prefix, prop].join('/');
        let propValue = ValuePointer.Get(entityObj, propPointer);
        if (propValue === undefined) {
          propValue = ValuePointer.Get(changeTracker, propPointer);
        }

        const propSchema =
          schema && getSchemaFromPath(schema, propPointer.slice(1).split('/'));
        if (
          typeof propValue === 'object' &&
          (!propSchema || propSchema['x-crdt-type'] !== 'Set') &&
          propValue !== null
        ) {
          return this.createUpdateProxy(
            changeTracker,
            entityObj,
            schema,
            propPointer
          );
        }
        if (propSchema) {
          if (propSchema['x-crdt-type'] === 'Set') {
            return {
              add: (value: any) => {
                // changeTracker.set([propPointer, value].join('/'), true);
                ValuePointer.Set(
                  changeTracker,
                  [propPointer, value].join('/'),
                  true
                );
              },
              remove: (value: any) => {
                // changeTracker.set([propPointer, value].join('/'), false);
                ValuePointer.Set(
                  changeTracker,
                  [propPointer, value].join('/'),
                  false
                );
              },
              has: (value: any) => {
                const valuePointer = [propPointer, value].join('/');
                return (
                  ValuePointer.Get(changeTracker, valuePointer) ??
                  propValue[value]
                );
                // return changeTracker.has(valuePointer)
                //   ? changeTracker.get(valuePointer)
                //   : propValue[value];
              },
            } as SetProxy<any>;
          }
        }
        // return changeTracker.has(propPointer)
        //   ? changeTracker.get(propPointer)
        //   : propValue;
        return ValuePointer.Get(changeTracker, propPointer) ?? propValue;
      },
    });
  }

  async fetch<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    { skipRules = false }: DBFetchOptions = {}
  ): Promise<FetchResult<Q>> {
    let fetchQuery = query;
    const collection = await this.getCollectionSchema(
      fetchQuery.collectionName as CollectionNameFromModels<M>
    );
    if (collection && !skipRules) {
      fetchQuery = this.addReadRulesToQuery(fetchQuery, collection);
    }
    fetchQuery = replaceVariablesInQuery(this, fetchQuery);
    return fetch(this.storeTx, fetchQuery, {
      schema: collection?.attributes,
      includeTriples: false,
    });
  }

  // maybe make it public? Keeping private bc its only used internally
  private query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Query<ModelFromModels<M, CN>>
  ) {
    // TODO: When fixing the type here, ensure the built output looks correct (had to manually assign this to work in the past)
    return CollectionQueryBuilder(collectionName as string, params);
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    { skipRules = false }: DBFetchOptions = {}
  ) {
    const query = this.query(collectionName).entityId(id).build();
    const result = await this.fetch(query, { skipRules });
    return result.has(id) ? result.get(id) : null;
  }

  async checkOrCreateSchema() {
    const existingSchema = await this.fetchById('_metadata', '_schema');
    if (!existingSchema) {
      await this.insert('_metadata', {}, '_schema');
    }
  }

  async createCollection(params: CreateCollectionOperation[1]) {
    await this.checkOrCreateSchema();
    const { name: collectionName, attributes, rules } = params;
    await this.update('_metadata', '_schema', async (schema) => {
      if (!schema.collections) schema.collections = {};
      if (!schema.collections[collectionName])
        schema.collections[collectionName] = {};
      const collectionAttributes = schema.collections[collectionName];
      collectionAttributes.attributes = attributes;
      collectionAttributes.rules = rules;
    });
  }

  async dropCollection(params: DropCollectionOperation[1]) {
    const { name: collectionName } = params;
    await this.update('_metadata', '_schema', async (schema) => {
      if (!schema.collections) schema.collections = {};
      delete schema.collections[collectionName];
    });
  }

  async addAttribute(params: AddAttributeOperation[1]) {
    const { collection: collectionName, path, attribute } = params;
    await this.update('_metadata', '_schema', async (schema) => {
      const collectionAttributes = schema.collections[collectionName];
      const parentPath = path.slice(0, -1);
      const attrName = path[path.length - 1];
      let attr = parentPath.reduce((acc, curr) => {
        if (!acc[curr]) acc[curr] = {};
        return acc[curr];
      }, collectionAttributes.attributes);
      attr[attrName] = attribute;
    });
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    const { collection: collectionName, path } = params;
    // Update schema if there is schema
    await this.update('_metadata', '_schema', async (schema) => {
      const collectionAttributes = schema.collections[collectionName];
      const parentPath = path.slice(0, -1);
      const attrName = path[path.length - 1];
      let attr = parentPath.reduce((acc, curr) => {
        if (!acc[curr]) acc[curr] = {};
        return acc[curr];
      }, collectionAttributes.attributes);
      delete attr[attrName];
    });
  }

  async alterAttributeOption(params: AlterAttributeOptionOperation[1]) {
    const { collection: collectionName, path, ...options } = params;
    await this.update('_metadata', '_schema', async (schema) => {
      const collectionAttributes = schema.collections[collectionName];
      const parentPath = path.slice(0, -1);
      const attrName = path[path.length - 1];
      let attr = parentPath.reduce((acc, curr) => {
        if (!acc[curr]) acc[curr] = {};
        return acc[curr];
      }, collectionAttributes.attributes);
      for (const [option, value] of Object.entries(options)) {
        attr[attrName].options[option] = value;
      }
    });
  }

  async dropAttributeOption(params: DropAttributeOptionOperation[1]) {
    const { collection: collectionName, path, option } = params;
    // Update schema if there is schema
    await this.update('_metadata', '_schema', async (schema) => {
      const collectionAttributes = schema.collections[collectionName];
      const parentPath = path;
      const attrName = option;
      let attr = parentPath.reduce((acc, curr) => {
        if (!acc[curr]) acc[curr] = {};
        return acc[curr];
      }, collectionAttributes.attributes);
      delete attr[attrName];
    });
  }
}
