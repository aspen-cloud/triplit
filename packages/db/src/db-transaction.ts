import { TripleStoreTransaction } from './triple-store-transaction.js';
import {
  getSchemaFromPath,
  UpdateTypeFromModel,
  Model,
  Models,
  getDefaultValuesForCollection,
  timestampedObjectToPlainObject,
  collectionsDefinitionToSchema,
  clientInputToDbModel,
  InsertTypeFromModel,
  convertEntityToJS,
} from './schema.js';
import { nanoid } from 'nanoid';
import CollectionQueryBuilder, {
  doesEntityObjMatchWhere,
  fetch,
  FetchResult,
  MaybeReturnTypeFromQuery,
} from './collection-query.js';
import {
  DBSerializationError,
  EntityNotFoundError,
  InvalidCollectionNameError,
  InvalidInsertDocumentError,
  InvalidOperationError,
  UnrecognizedPropertyInUpdateError,
  WriteRuleError,
} from './errors.js';
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
  AddRuleOperation,
  DropRuleOperation,
  FetchByIdQueryParams,
  DBHooks,
  DEFAULT_STORE_KEY,
  EntityOpSet,
} from './db.js';
import {
  validateExternalId,
  appendCollectionToId,
  replaceVariablesInQuery,
  validateTriple,
  readSchemaFromTripleStore,
  StoreSchema,
  splitIdParts,
  getCollectionSchema,
  prepareQuery,
} from './db-helpers.js';
import {
  CollectionQuery,
  Entity,
  Query,
  constructEntity,
  updateEntity,
} from './query.js';
import { dbDocumentToTuples } from './utils.js';
import { typeFromJSON } from './data-types/base.js';
import { SchemaDefinition } from './data-types/serialization.js';
import { createSetProxy } from './data-types/set.js';
import {
  EntityId,
  TripleStoreBeforeInsertHook,
  TripleStoreBeforeCommitHook,
  TripleRow,
  EAV,
  Attribute,
  Value,
  TripleStoreAfterCommitHook,
} from './triple-store-utils.js';
import { TripleStoreApi } from './triple-store.js';
import DB, { constructEntities } from './index.js';

interface TransactionOptions<
  M extends Models<any, any> | undefined = undefined
> {
  variables?: Record<string, any>;
  schema?: StoreSchema<M>;
  skipRules?: boolean;
}

const EXEMPT_FROM_WRITE_RULES = new Set(['_metadata']);

function checkWriteRules<M extends Models<any, any> | undefined>(
  id: EntityId,
  timestampedEntity: any,
  variables: Record<string, any> | undefined,
  schema: StoreSchema<M> | undefined
) {
  const [collectionName, _entityId] = splitIdParts(id);

  if (EXEMPT_FROM_WRITE_RULES.has(collectionName)) return;

  const collection = schema?.collections[collectionName];
  const writeRules = Object.values(collection?.rules?.write ?? {});
  if (writeRules.length) {
    const filters = writeRules.flatMap((r) => r.filter);
    let query = {
      where: filters,
      vars: variables,
    } as CollectionQuery<M, any>;
    query = replaceVariablesInQuery(query);
    const satisfiedRule = doesEntityObjMatchWhere(
      timestampedEntity,
      query.where,
      collection?.schema
    );
    if (!satisfiedRule) {
      // TODO add better error that uses rule description
      throw new WriteRuleError(`Update does not match write rules`);
    }
  }
}

async function triplesToEntityOpSet(
  triples: TripleRow[],
  tripleStore: TripleStoreApi
): Promise<EntityOpSet> {
  const deltas = Array.from(constructEntities(triples).entries());
  const opSet: EntityOpSet = { inserts: [], updates: [], deletes: [] };
  for (const [id, delta] of deltas) {
    // default to update
    let operation: 'insert' | 'update' | 'delete' = 'update';
    // Inserts and deletes will include the _collection attribute
    if ('_collection' in delta.data) {
      // Deletes will set _collection to undefined
      const isDelete = delta.data._collection[0] === undefined;
      if (isDelete) operation = 'delete';
      else operation = 'insert';
    }

    // Get the full entities from the triple store
    const entity = constructEntity(await tripleStore.findByEntity(id), id);
    if (!entity) continue;
    switch (operation) {
      case 'insert':
        opSet.inserts.push([
          id,
          timestampedObjectToPlainObject(entity.data) as any,
        ]);
        break;
      case 'update':
        // TODO: add deltas to update
        opSet.updates.push([
          id,
          timestampedObjectToPlainObject(entity.data) as any,
        ]);
        break;
      case 'delete':
        const [collection, externalId] = splitIdParts(id);
        opSet.deletes.push([
          id,
          {
            id: externalId,
            _collection: collection,
            // I don't expect an entity to have any data here as the
            // triples are already tombstoned
            ...(timestampedObjectToPlainObject(entity.data) as any),
          },
        ]);
        break;
    }
  }
  return opSet;
}

export class DBTransaction<M extends Models<any, any> | undefined> {
  schema: StoreSchema<M> | undefined;
  private _schema: Entity | undefined;
  readonly variables?: Record<string, any>;
  private _permissionCache: Map<string, boolean> = new Map();

  constructor(
    readonly db: DB<M>,
    readonly storeTx: TripleStoreTransaction,
    private readonly hooks: DBHooks<M>,
    readonly options: TransactionOptions<M> = {}
  ) {
    this.schema = options.schema;
    this.variables = options.variables;
    this.storeTx.beforeInsert(this.ValidateTripleSchema);
    if (!options?.skipRules) {
      // Pre-update write checks
      this.storeTx.beforeInsert(async (triples, tx) => {
        /**
         * This will check writes rules on every insert
         * it will look for a _collection attribute to indicate an insert
         * which means looking only at the inserted triples is sufficient
         * to validate the rule.
         * Otherwise treat any triples as an update/delete and fetch the entity
         * from the store to validate the rule
         */
        const insertedEntities: Set<string> = new Set();
        const updatedEntities: Set<string> = new Set();
        for (const triple of triples) {
          if (triple.attribute[0] === '_collection' && !triple.expired) {
            insertedEntities.add(triple.id);
            updatedEntities.delete(triple.id);
            const entityTriples = triples.filter(
              (t) => t.id === triple.id && t.expired === false
            );
            const entity = constructEntity(entityTriples, triple.id);
            checkWriteRules(
              triple.id,
              entity?.data,
              this.variables,
              this.schema
            );
          } else {
            updatedEntities.add(triple.id);
          }
        }
        // for each updatedEntity, load triples, construct entity, and check write rules
        for (const id of updatedEntities) {
          const entityTriples = await tx.findByEntity(id);
          const entity = constructEntity(entityTriples, id);
          checkWriteRules(id, entity?.data, this.variables, this.schema);
        }
      });
    }
    this.storeTx.beforeInsert(this.UpdateLocalSchema);
    this.storeTx.beforeCommit(this.CallBeforeCommitDBHooks);
    this.storeTx.afterCommit(this.CallAfterCommitDBHooks);
  }

  private ValidateTripleSchema: TripleStoreBeforeInsertHook = async (
    triples
  ) => {
    if (!this.schema) return;
    for (const trip of triples) {
      if (trip.attribute[0] === '_metadata') continue;
      if (trip.attribute[0] === '_collection') continue;
      if (trip.expired) continue;
      // TODO: figure out how to validate tombstones (value will be null so validation may fail, but want to think through if naively skipping is ok)
      validateTriple(this.schema.collections, trip.attribute, trip.value);
    }
  };

  private UpdateLocalSchema: TripleStoreBeforeInsertHook = async (
    triples,
    tx
  ) => {
    const metadataTriples = triples.filter(
      ({ attribute }) => attribute[0] === '_metadata'
    );
    if (metadataTriples.length === 0) return;

    /**
     * When using the migrations option in the DB constructor, we need to query the schema triples when the hook first fires to initialize _schema,
     * otherwise the initial _schema value will just be the schema delta of the migration.
     */
    if (!this._schema) {
      const { schemaTriples } = await readSchemaFromTripleStore(tx);
      metadataTriples.unshift(...schemaTriples);
    }

    this._schema = this._schema ?? new Entity();
    updateEntity(this._schema, metadataTriples);

    // Type definitions are kinda ugly here
    const schemaDefinition = timestampedObjectToPlainObject(
      this._schema.data
    ) as SchemaDefinition | undefined;

    this.schema = {
      version: schemaDefinition?.version ?? 0,
      collections:
        schemaDefinition?.collections &&
        collectionsDefinitionToSchema(schemaDefinition.collections),
    } as StoreSchema<M>;
  };

  // private GarbageCollect: TripleStoreBeforeInsertHook = async (triples, tx) => {
  //   const toDelete: TripleRow[] = [];
  //   for (const triple of triples) {
  //     const { id, attribute, value, timestamp: txTimestamp } = triple;
  //     if (value === undefined) {
  //       throw new InvalidTripleStoreValueError(undefined);
  //     }
  //     const existingTriples = await tx.findByEntityAttribute(id, attribute);
  //     const olderTriples = existingTriples.filter(
  //       ({ timestamp }) => timestampCompare(timestamp, txTimestamp) < 0
  //     );

  //     if (olderTriples.length > 0) {
  //       toDelete.push(...olderTriples);
  //     }
  //   }
  //   await tx.deleteTriples(toDelete);
  // };

  private CallBeforeCommitDBHooks: TripleStoreBeforeCommitHook = async (
    triplesByStorage,
    tx
  ) => {
    const hasBeforeCallbacks =
      this.hooks.beforeCommit.length > 0 ||
      this.hooks.beforeInsert.length > 0 ||
      this.hooks.beforeUpdate.length > 0 ||
      this.hooks.beforeDelete.length > 0;
    if (!hasBeforeCallbacks) return;

    // At the moment, triggers only work for a single 'default' storage
    if (!triplesByStorage[DEFAULT_STORE_KEY]?.length) return;
    const triples = triplesByStorage[DEFAULT_STORE_KEY];
    const opSet = await triplesToEntityOpSet(triples, this.storeTx);
    if (opSet.inserts.length) {
      for (const [hook, options] of this.hooks.beforeInsert) {
        const collectionInserts = opSet.inserts.filter(
          ([id]) => splitIdParts(id)[0] === options.collectionName
        );
        for (const [id, entity] of collectionInserts) {
          await hook({ entity, tx: this, db: this.db });
        }
      }
    }
    if (opSet.updates.length) {
      for (const [hook, options] of this.hooks.beforeUpdate) {
        const collectionUpdates = opSet.updates.filter(
          ([id]) => splitIdParts(id)[0] === options.collectionName
        );
        for (const [id, entity] of collectionUpdates) {
          await hook({ entity, tx: this, db: this.db });
        }
      }
    }
    if (opSet.deletes.length) {
      for (const [hook, options] of this.hooks.beforeDelete) {
        const collectionDeletes = opSet.deletes.filter(
          ([id]) => splitIdParts(id)[0] === options.collectionName
        );
        for (const [id, entity] of collectionDeletes) {
          await hook({ entity, tx: this, db: this.db });
        }
      }
    }

    for (const [hook, options] of this.hooks.beforeCommit) {
      const inserts = opSet.inserts;
      // .filter(
      //   ([id]) => splitIdParts(id)[0] === options.collectionName
      // );
      const updates = opSet.updates;
      // .filter(
      //   ([id]) => splitIdParts(id)[0] === options.collectionName
      // );
      const deletes = opSet.deletes;
      // .filter(
      //   ([id]) => splitIdParts(id)[0] === options.collectionName
      // );
      if (!inserts.length && !updates.length && !deletes.length) continue;
      await hook({
        opSet: {
          inserts,
          updates,
          deletes,
        },
        tx: this,
        db: this.db,
      });
    }
  };

  private CallAfterCommitDBHooks: TripleStoreAfterCommitHook = async (
    triplesByStorage,
    tx
  ) => {
    const hasAfterCallbacks =
      this.hooks.afterCommit.length > 0 ||
      this.hooks.afterInsert.length > 0 ||
      this.hooks.afterUpdate.length > 0 ||
      this.hooks.afterDelete.length > 0;
    if (!hasAfterCallbacks) return;

    // At the moment, triggers only work for a single 'default' storage
    if (!triplesByStorage[DEFAULT_STORE_KEY]?.length) return;
    const triples = triplesByStorage[DEFAULT_STORE_KEY];
    const opSet = await triplesToEntityOpSet(triples, this.db.tripleStore);
    if (opSet.inserts.length) {
      for (const [hook, options] of this.hooks.afterInsert) {
        const collectionInserts = opSet.inserts.filter(
          ([id]) => splitIdParts(id)[0] === options.collectionName
        );
        for (const [_id, entity] of collectionInserts) {
          await hook({ entity, tx: this, db: this.db });
        }
      }
    }
    if (opSet.updates.length) {
      for (const [hook, options] of this.hooks.afterUpdate) {
        const collectionUpdates = opSet.updates.filter(
          ([id]) => splitIdParts(id)[0] === options.collectionName
        );

        for (const [_id, entity] of collectionUpdates) {
          await hook({ entity, tx: this, db: this.db });
        }
      }
    }
    if (opSet.deletes.length) {
      for (const [hook, options] of this.hooks.afterDelete) {
        const collectionDeletes = opSet.deletes.filter(
          ([id]) => splitIdParts(id)[0] === options.collectionName
        );
        for (const [_id, entity] of collectionDeletes) {
          await hook({ entity, tx: this, db: this.db });
        }
      }
    }

    for (const [hook, options] of this.hooks.afterCommit) {
      const inserts = opSet.inserts;
      // .filter(
      //   ([id]) => splitIdParts(id)[0] === options.collectionName
      // );
      const updates = opSet.updates;
      // .filter(
      //   ([id]) => splitIdParts(id)[0] === options.collectionName
      // );
      const deletes = opSet.deletes;
      // .filter(
      //   ([id]) => splitIdParts(id)[0] === options.collectionName
      // );
      if (!inserts.length && !updates.length && !deletes.length) continue;
      await hook({
        opSet: {
          inserts,
          updates,
          deletes,
        },
        tx: this,
        db: this.db,
      });
    }
  };

  // Doing this as a TS fix, but would like to properly define the _metadata scheam
  readonly METADATA_COLLECTION_NAME =
    '_metadata' as CollectionNameFromModels<M>;

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
    doc: InsertTypeFromModel<ModelFromModels<M, CN>>
  ) {
    if (!collectionName)
      throw new InvalidCollectionNameError(
        collectionName,
        'Collection name must be defined'
      );
    if (!doc)
      throw new InvalidInsertDocumentError(
        'The document being inserted is undefined'
      );
    if (typeof doc !== 'object' || Array.isArray(doc))
      throw new InvalidInsertDocumentError(
        `The document being inserted must be an object.`
      );
    const collectionSchema = await getCollectionSchema(this, collectionName);

    // prep the doc for insert to db
    const defaultValues = collectionSchema
      ? getDefaultValuesForCollection(collectionSchema)
      : {};

    // Append defaults
    const inputWithDefaults = {
      ...defaultValues,
      ...doc,
    };

    const fullDoc = clientInputToDbModel(
      inputWithDefaults,
      collectionSchema?.schema
    );

    // this is just to handle the schemaless case
    if (!collectionSchema && fullDoc.id === undefined) fullDoc.id = nanoid();

    const validationError = validateExternalId(fullDoc.id);
    if (validationError) throw validationError;

    // create triples
    const timestamp = await this.storeTx.getTransactionTimestamp();
    const avTuples = dbDocumentToTuples(fullDoc);
    const storeId = appendCollectionToId(collectionName, fullDoc.id);
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

    // insert triples
    await this.storeTx.insertTriples(triples);
    const insertedEntity = constructEntity(triples, storeId);
    if (!insertedEntity) throw new Error('Malformed id');
    return convertEntityToJS(
      insertedEntity.data as any,
      collectionSchema?.schema
    ) as MaybeReturnTypeFromQuery<M, CN>;
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => void | Promise<void>
  ) {
    const collection =
      collectionName !== '_metadata'
        ? ((await this.getSchema())?.collections[
            collectionName
          ] as CollectionFromModels<M, CN>)
        : undefined;

    // TODO: Would be great to plug into the pipeline at any point
    // In this case I want untimestamped values, valid values
    const storeId = appendCollectionToId(collectionName, entityId);
    const entityTriples = await this.storeTx.findByEntity(storeId);
    const timestampedEntity = constructEntity(entityTriples, storeId);
    const entity = timestampedObjectToPlainObject(timestampedEntity!.data);

    // If entity doesn't exist or is deleted, throw error
    // Schema/metadata does not have _collection attribute
    if (collectionName !== '_metadata' && !entity?._collection) {
      throw new EntityNotFoundError(
        entityId,
        collectionName,
        "Cannot perform an update on an entity that doesn't exist"
      );
    }

    // Collect changes
    const collectionSchema = collection?.schema;
    const changes = new ChangeTracker(entity);
    const updateProxy = createUpdateProxy<typeof collectionSchema>(
      changes,
      entity,
      collectionSchema
    );

    // Run updater (runs serialization of values)
    await updater(updateProxy);
    const changeTuples = changes.getTuples();
    for (const [attr, value] of changeTuples) {
      if (attr.at(0) === 'id') {
        throw new InvalidOperationError(
          `Attempted to update the id of an entity in the ${collectionName} from ${entity.id} to ${value}. The 'id' attribute of an entity is immutable and cannot be updated.`
        );
      }
    }
    // Create change tuples
    const updateValues: EAV[] = [];
    for (let tuple of changeTuples) {
      const [attr, value] = tuple;
      const storeAttribute = [collectionName, ...attr];
      // undefined is treated as a delete
      if (value === undefined || value === '{}') {
        await this.storeTx.expireEntityAttributes([
          { id: storeId, attribute: storeAttribute },
        ]);
      }
      if (value === undefined) {
        continue;
      }
      // TODO: use standardized json conversions
      updateValues.push([storeId, storeAttribute, value]);
    }

    // Apply changes
    await this.storeTx.setValues(updateValues);
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string
  ) {
    if (!collectionName)
      throw new InvalidCollectionNameError(
        collectionName,
        'Collection name must be defined'
      );
    const storeId = appendCollectionToId(collectionName, id);
    await this.storeTx.expireEntity(storeId);
  }

  async fetch<Q extends CollectionQuery<M, any>>(
    query: Q,
    options: DBFetchOptions = {}
  ): Promise<FetchResult<Q>> {
    const { query: fetchQuery } = await prepareQuery(this, query, options);
    // TODO: read scope?
    // See difference between this fetch and db fetch
    return fetch<M, Q>(this.storeTx, fetchQuery, {
      schema: (await this.getSchema())?.collections,
      includeTriples: false,
    });
  }

  // maybe make it public? Keeping private bc its only used internally
  private query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Query<M, CN>
  ) {
    // TODO: When fixing the type here, ensure the built output looks correct (had to manually assign this to work in the past)
    return CollectionQueryBuilder(collectionName, params);
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    queryParams: FetchByIdQueryParams<M, CN> = {},
    options: DBFetchOptions = {}
  ) {
    return this.fetchOne(
      // @ts-ignore
      this.query(collectionName, queryParams).where('id', '=', id).build(),
      options
    );
  }

  async fetchOne<Q extends CollectionQuery<M, any>>(
    query: Q,
    options: DBFetchOptions = {}
  ) {
    query.limit = 1;
    const result = await this.fetch(query, options);
    const entity = [...result.values()][0];
    if (!entity) return null;
    return entity;
  }

  async checkOrCreateSchema() {
    const existingSchema = await this.fetchById(
      this.METADATA_COLLECTION_NAME,
      '_schema'
    );
    if (!existingSchema) {
      await this.insert(this.METADATA_COLLECTION_NAME, {
        id: '_schema',
      } as any);
    }
  }

  async createCollection(params: CreateCollectionOperation[1]) {
    // Create schema object so it can be updated
    await this.checkOrCreateSchema();
    const { name: collectionName, schema: schemaJSON, rules } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schemaEntity) => {
        // If there are no collections, create property
        if (!schemaEntity.collections) schemaEntity.collections = {};
        // Overwrite collection data
        // Schemas are saved as record types, so translate that here
        const schemaJSONWithType = typeFromJSON({
          type: 'record',
          properties: schemaJSON,
        }).toJSON();
        const newSchema: any = {
          schema: schemaJSONWithType,
        };
        // rules may be undefined, only add key if defined
        if (rules) newSchema.rules = rules;
        schemaEntity.collections[collectionName] = newSchema;
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
        if (!collectionAttributes.schema) {
          // TODO add proper Typescript type here
          collectionAttributes.schema = { type: 'record', properties: {} };
        }

        ValuePointer.Set(
          collectionAttributes.schema.properties,
          path.join('/'),
          attribute
        );
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
        }, collectionAttributes.schema.properties);
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
        }, collectionAttributes.schema.properties);
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
        }, collectionAttributes.schema.properties);

        // instantiate this here until we support empty objects
        if (!attr.options) attr.options = {};
        delete attr.options[option];
      }
    );
  }

  async addRule(params: AddRuleOperation[1]) {
    const { collection, scope, id, rule } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        const collectionAttributes = schema.collections[collection];
        if (!collectionAttributes.rules) collectionAttributes.rules = {};
        if (!collectionAttributes.rules[scope])
          collectionAttributes.rules[scope] = {};
        collectionAttributes.rules[scope][id] = rule;
      }
    );
  }

  async dropRule(params: DropRuleOperation[1]) {
    const { collection, scope, id } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (schema) => {
        const collectionAttributes = schema.collections[collection];
        delete collectionAttributes.rules[scope][id];
      }
    );
  }
}

export class ChangeTracker {
  // On assignment, set proper tuples
  private tuplesTracker: Record<string, Value> = {};

  // Track updated values with ValuePointer
  changes: Record<string, any> = {};

  constructor(changes: Record<string, any>) {
    this.changes = changes;
  }

  set(prop: string, value: any) {
    ValuePointer.Set(this.changes, prop, value);
    const tuples = dbDocumentToTuples(value, prop.slice(1).split('/'));
    for (const tuple of tuples) {
      const [attr, value] = tuple;
      this.tuplesTracker[attr.join('/')] = value;
    }
  }

  delete(prop: string) {
    ValuePointer.Delete(this.changes, prop);
  }

  get(prop: string) {
    return ValuePointer.Get(this.changes, prop);
  }

  has(prop: string) {
    return ValuePointer.Has(this.changes, prop);
  }

  getChanges() {
    return this.changes;
  }

  getTuples(): [Attribute, Value][] {
    return Object.entries(this.tuplesTracker).map(([attr, value]) => [
      attr.split('/'),
      value,
    ]);
  }
}

export function createUpdateProxy<M extends Model<any> | undefined>(
  changeTracker: ChangeTracker,
  entityObj: UpdateTypeFromModel<M>,
  schema?: M,
  prefix: string = ''
): UpdateTypeFromModel<M> {
  return new Proxy(entityObj, {
    set: (_target, prop, value) => {
      if (typeof prop === 'symbol') return true;
      const propPointer = [prefix, prop].join('/');
      if (!schema) {
        changeTracker.set(propPointer, value);
        return true;
      }
      const propSchema = getSchemaFromPath(
        schema,
        propPointer.slice(1).split('/')
      );
      if (!propSchema) {
        throw new UnrecognizedPropertyInUpdateError(propPointer, value);
      }
      if (propSchema.type === 'set') {
        if (!Array.isArray(value) && !(value instanceof Set)) {
          throw new DBSerializationError(
            'Set',
            `Cannot assign a non-array or non-set value to a set.`
          );
        }
        const setProxy = createSetProxy(changeTracker, propPointer, propSchema);
        setProxy.clear();
        for (const v of value) {
          setProxy.add(v);
        }
        return true;
      }
      const dbValue = propSchema.convertInputToDBValue(
        // @ts-expect-error Big DataType union results in never as arg type
        value
      );
      changeTracker.set(propPointer, dbValue);
      return true;
    },
    deleteProperty: (_target, prop) => {
      if (typeof prop === 'symbol') return true;
      if (!!schema)
        throw new InvalidOperationError(
          `Cannot delete property ${prop}. If the property is nullable you can set it to null instead.`
        );
      const propPointer = [prefix, prop].join('/');
      // ValuePointer.Set(changeTracker, propPointer, undefined);
      changeTracker.set(propPointer, undefined);
      ValuePointer.Delete(entityObj, prop as string);
      return true;
    },
    get: (_target, prop) => {
      if (typeof prop === 'symbol') return undefined;
      const parentPropPointer = [prefix, prop].join('/');
      const currentValue = changeTracker.get(parentPropPointer);

      const propSchema =
        schema &&
        getSchemaFromPath(schema, parentPropPointer.slice(1).split('/'));

      if (propSchema && propSchema.type === 'set') {
        return createSetProxy(changeTracker, parentPropPointer, propSchema);
      }
      if (typeof currentValue === 'object' && currentValue !== null) {
        return createUpdateProxy(
          changeTracker,
          currentValue,
          schema,
          parentPropPointer
        );
      }

      return currentValue;
    },
  });
}
