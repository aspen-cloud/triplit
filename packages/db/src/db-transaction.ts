import { EAV, TripleRow, TripleStoreTransaction } from './triple-store';
import {
  getSchemaFromPath,
  ProxyTypeFromModel,
  Model,
  Models,
  SetProxy,
  getDefaultValuesForCollection,
  TimestampedObject,
  timestampedObjectToPlainObject,
  collectionsDefinitionToSchema,
  JSONTypeFromModel,
  serializeClientModel,
} from './schema';
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
  readSchemaFromTripleStore,
  StoreSchema,
} from './db-helpers';
import { Query, constructEntity, entityToResultReducer } from './query';
import { serializedItemToTuples } from './utils';

export class DBTransaction<M extends Models<any, any> | undefined> {
  schema: StoreSchema<M> | undefined;
  private _schema: TimestampedObject | undefined;
  constructor(
    readonly storeTx: TripleStoreTransaction,
    readonly variables?: Record<string, any>,
    schema?: StoreSchema<M>
  ) {
    this.schema = schema;

    this.storeTx.beforeInsert(async (trips, tx) => {
      const metadataTriples = trips.filter(
        ({ attribute }) => attribute[0] === '_metadata'
      );
      if (metadataTriples.length === 0) return;

      /**
       * We need to support tombstoning in entityToResultReducer to properly handle schema incremental schema changes
       * When we expire, we delete the old value and insert a tombstone,
       * but we're not set up to do anything with that tombstone so it does nothing on an incremental update.
       *
       * For now setting this to requery the schema on updates.
       *
       * As well (when going back to a true incremental update system), when using the migrations option in the DB constructor, we need to query the schema triples when the hook first fires to initialize _schema,
       * otherwise the initial _schema value will just be the schema delta of the migration.
       */
      const { schemaTriples } = await readSchemaFromTripleStore(tx);
      // order matters here (may have attr + timestamp collisions inside a tx)
      // TODO: we should fix that...
      metadataTriples.unshift(...schemaTriples);

      // Need to actually support tombstoning...or figure out how to properly read tombstones so theyre deleted from objects
      this._schema = metadataTriples.reduce(
        entityToResultReducer,
        {} // this._schema ?? {}
      );
      // TODO: schema triples and type?
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

  // Doing this as a TS fix, but would like to properly define the _metadata scheam
  readonly METADATA_COLLECTION_NAME =
    '_metadata' as CollectionNameFromModels<M>;

  // get schema() {
  //   return this.storeTx.schema?.collections;
  // }
  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ) {
    const res = await this.getSchema();
    const { collections } = res ?? {};
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

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    doc: JSONTypeFromModel<ModelFromModels<M, CN>>,
    id?: string
  ) {
    // TODO: confirm if collectionName is required (validate if it is)
    if (id) {
      const validationError = validateExternalId(id);
      if (validationError) throw validationError;
    }
    const collection = await this.getCollectionSchema(collectionName);

    // serialize the doc values
    const serializedDoc = serializeClientModel(doc, collection?.attributes);

    // Append defaults
    const fullDoc = collection
      ? {
          ...getDefaultValuesForCollection(collection),
          ...serializedDoc,
        }
      : serializedDoc;

    // create triples
    const timestamp = await this.storeTx.getTransactionTimestamp();
    const avTuples = serializedItemToTuples(fullDoc);
    const storeId = appendCollectionToId(collectionName, id ?? nanoid());
    const triples: TripleRow[] = avTuples.map<TripleRow>(
      ([attribute, value]) => ({
        id: storeId,
        attribute: [collectionName, ...attribute],
        value: value,
        timestamp,
        expired: false,
      })
    );
    triples.push({
      id: storeId,
      attribute: ['_collection'],
      value: collectionName,
      timestamp,
      expired: false,
    });

    // check rules (Could also be done after insertion)
    if (collection?.rules?.write?.length) {
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = replaceVariablesInQuery(this, query);
      const timestampDoc = constructEntity(triples, storeId);
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

    // insert triples
    await this.storeTx.insertTriples(triples);
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

    // Collect changes
    const changes = {};
    const collectionSchema = collection?.attributes;
    const updateProxy = this.createUpdateProxy<typeof collectionSchema>(
      changes,
      entity,
      collectionSchema
    );

    // Run updater (runs serialization of values)
    await updater(updateProxy);
    const changeTuples = serializedItemToTuples(changes);
    const storeId = appendCollectionToId(collectionName, entityId);

    // Create change tuples
    const updateValues: EAV[] = [];
    for (let tuple of changeTuples) {
      const [attr, value] = tuple;
      const storeAttribute = [collectionName, ...attr];
      // undefined is treated as a delete
      if (value === undefined) {
        const triples = await this.storeTx.findByEAV([storeId, storeAttribute]);
        for (const trip of triples) {
          await this.storeTx.expireEntityAttribute(trip.id, trip.attribute);
        }
        continue;
      }
      // TODO: use standardized json conversions
      updateValues.push([storeId, storeAttribute, value]);
    }

    // Apply changes
    await this.storeTx.setValues(updateValues);

    // Check rules
    if (collection?.rules?.write?.length) {
      const triples = await this.storeTx.findByEntity(storeId);
      const entity = constructEntity(triples, storeId);
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = replaceVariablesInQuery(this, query);
      const satisfiedRule = doesEntityObjMatchWhere(
        entity,
        query.where,
        collectionSchema
      );
      if (!satisfiedRule) {
        // TODO add better error that uses rule description
        throw new WriteRuleError(`Update does not match write rules`);
      }
    }
  }

  // TODO add tests for proxy reads
  private createUpdateProxy<M extends Model | undefined>(
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
        const serializedValue = propSchema.serialize(value);
        ValuePointer.Set(changeTracker, propPointer, serializedValue);
        return true;
      },
      deleteProperty: (_target, prop) => {
        const propPointer = [prefix, prop].join('/');
        ValuePointer.Set(changeTracker, propPointer, undefined);
        ValuePointer.Delete(entityObj, prop as string);
        return true;
      },
      get: (_target, prop) => {
        const parentPropPointer = [prefix, prop].join('/');
        let propValue = ValuePointer.Has(changeTracker, parentPropPointer)
          ? ValuePointer.Get(changeTracker, parentPropPointer)
          : ValuePointer.Get(entityObj, prop as string);

        const propSchema =
          schema &&
          getSchemaFromPath(schema, parentPropPointer.slice(1).split('/'));
        if (
          typeof propValue === 'object' &&
          (!propSchema || propSchema.type !== 'set') &&
          propValue !== null
        ) {
          return this.createUpdateProxy(
            changeTracker,
            propValue,
            schema,
            parentPropPointer
          );
        }
        if (propSchema) {
          if (propSchema.type == 'set') {
            return {
              add: (value: any) => {
                // changeTracker.set([propPointer, value].join('/'), true);
                const serializedValue = propSchema.items.serialize(value);
                ValuePointer.Set(
                  changeTracker,
                  [parentPropPointer, serializedValue].join('/'),
                  true
                );
              },
              remove: (value: any) => {
                // changeTracker.set([propPointer, value].join('/'), false);
                const serializedValue = propSchema.items.serialize(value);
                ValuePointer.Set(
                  changeTracker,
                  [parentPropPointer, serializedValue].join('/'),
                  false
                );
              },
              has: (value: any) => {
                const serializedValue = propSchema.items.serialize(value);
                const valuePointer = [parentPropPointer, serializedValue].join(
                  '/'
                );
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
        return ValuePointer.Get(changeTracker, parentPropPointer) ?? propValue;
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
    const existingSchema = await this.fetchById(
      this.METADATA_COLLECTION_NAME,
      '_schema'
    );
    if (!existingSchema) {
      await this.insert(this.METADATA_COLLECTION_NAME, {} as any, '_schema');
    }
  }

  async createCollection(params: CreateCollectionOperation[1]) {
    await this.checkOrCreateSchema();
    const { name: collectionName, attributes, rules } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        if (!schema.collections) schema.collections = {};
        if (!schema.collections[collectionName])
          schema.collections[collectionName] = {};
        const collectionAttributes = schema.collections[collectionName];
        collectionAttributes.attributes = attributes;
        collectionAttributes.rules = rules;
      }
    );
  }

  async dropCollection(params: DropCollectionOperation[1]) {
    const { name: collectionName } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        if (!schema.collections) schema.collections = {};
        delete schema.collections[collectionName];
      }
    );
  }

  async addAttribute(params: AddAttributeOperation[1]) {
    const { collection: collectionName, path, attribute } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        const collectionAttributes = schema.collections[collectionName];
        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];
        let attr = parentPath.reduce((acc, curr) => {
          if (!acc[curr]) acc[curr] = {};
          return acc[curr];
        }, collectionAttributes.attributes);
        attr[attrName] = attribute;
      }
    );
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    const { collection: collectionName, path } = params;
    // Update schema if there is schema
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        const collectionAttributes = schema.collections[collectionName];
        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];
        let attr = parentPath.reduce((acc, curr) => {
          if (!acc[curr]) acc[curr] = {};
          return acc[curr];
        }, collectionAttributes.attributes);
        delete attr[attrName];
      }
    );
  }

  async alterAttributeOption(params: AlterAttributeOptionOperation[1]) {
    const { collection: collectionName, path, options } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        const collectionAttributes = schema.collections[collectionName];
        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];
        let attr = parentPath.reduce((acc, curr) => {
          if (!acc[curr]) acc[curr] = {};
          return acc[curr];
        }, collectionAttributes.attributes);
        for (const [option, value] of Object.entries(options)) {
          // // instantiate this here until we support empty objects
          if (!attr[attrName].options) attr[attrName].options = {};
          attr[attrName].options[option] = value;
        }
      }
    );
  }

  async dropAttributeOption(params: DropAttributeOptionOperation[1]) {
    const { collection: collectionName, path, option } = params;
    // Update schema if there is schema
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        const collectionAttributes = schema.collections[collectionName];
        let attr = path.reduce((acc, curr) => {
          if (!acc[curr]) acc[curr] = {};
          return acc[curr];
        }, collectionAttributes.attributes);

        // instantiate this here until we support empty objects
        if (!attr.options) attr.options = {};
        delete attr.options[option];
      }
    );
  }
}
