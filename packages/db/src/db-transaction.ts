import { TripleStoreTransaction } from './triple-store-transaction.js';
import {
  getSchemaFromPath,
  getDefaultValuesForCollection,
  collectionsDefinitionToSchema,
  clientInputToDbModel,
} from './schema/schema.js';
import { schemaToJSON } from './schema/export/index.js';
import {
  UpdateTypeFromModel,
  InsertTypeFromModel,
  Models,
  StoreSchema,
  PermissionWriteOperations,
} from './schema/types';
import { nanoid } from 'nanoid';
import CollectionQueryBuilder, {
  fetch,
  fetchOne,
  initialFetchExecutionContext,
  convertEntityToJS,
} from './collection-query.js';
import {
  DBSerializationError,
  EntityNotFoundError,
  InvalidCollectionNameError,
  InvalidInsertDocumentError,
  InvalidOperationError,
  UnrecognizedPropertyInUpdateError,
  WriteRuleError,
  CollectionNotFoundError,
  InvalidSchemaPathError,
  WritePermissionError,
  TriplitError,
} from './errors.js';
import { ValuePointer } from '@sinclair/typebox/value';
import DB, {
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
  SetAttributeOptionalOperation,
  OpSet,
} from './db.js';
import {
  validateExternalId,
  appendCollectionToId,
  validateTriple,
  readSchemaFromTripleStore,
  splitIdParts,
  fetchResultToJS,
} from './db-helpers.js';
import {
  Entity,
  constructEntity,
  updateEntity,
  triplesToEntities,
} from './query.js';
import { dbDocumentToTuples, timestampedObjectToPlainObject } from './utils.js';
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
  TupleValue,
  TripleStoreAfterCommitHook,
} from './triple-store-utils.js';
import { TripleStoreApi } from './triple-store.js';
import { RecordType } from './data-types/record.js';
import { Logger } from '@triplit/types/logger';
import {
  CollectionQuery,
  CollectionQueryDefault,
  FetchResult,
  FetchResultEntity,
  FetchResultEntityFromParts,
  SchemaQueries,
  ToQuery,
  Unalias,
} from './query/types';
import { prepareQuery } from './query/prepare.js';
import { getCollectionPermissions } from './schema/permissions.js';
import { genToArr } from './utils/generator.js';

interface TransactionOptions<M extends Models = Models> {
  schema?: StoreSchema<M>;
  skipRules?: boolean;
  logger?: Logger;
  manualSchemaRefresh?: boolean;
}

const EXEMPT_FROM_WRITE_RULES = new Set(['_metadata']);

async function checkWritePermissions<M extends Models>(
  dbTx: DBTransaction<M>,
  storeTx: TripleStoreApi,
  id: EntityId,
  schema: StoreSchema<M> | undefined,
  operation: PermissionWriteOperations
) {
  if (!schema) return;
  const [collectionName, entityId] = splitIdParts(id);
  if (EXEMPT_FROM_WRITE_RULES.has(collectionName)) return;
  const sessionRoles = dbTx.db.sessionRoles;
  const permissions = getCollectionPermissions(
    schema.collections,
    collectionName
  );
  // If no permissions for collection, its exempt from rules
  if (!permissions) return;

  let permissionsStatements = [];
  let hasMatch = false;
  if (sessionRoles) {
    for (const sessionRole of sessionRoles) {
      const rolePermissions = permissions[sessionRole.key];
      const permission = rolePermissions?.[operation];

      if (!permission) continue;

      if (permission.filter) {
        // Must opt in to the permission
        hasMatch = true;
        // TODO: handle empty arrays
        if (Array.isArray(permission.filter)) {
          permissionsStatements.push(...permission.filter);
        }
      }
    }
  }

  if (!hasMatch) {
    // postUpdate is optional, so if there's nothing to check against, we can skip
    if (operation === 'postUpdate') return;
    permissionsStatements = [false];
  }

  const query = prepareQuery(
    {
      collectionName,
      where: [['id', '=', entityId], ...permissionsStatements],
    } as CollectionQuery<M, any>,
    schema.collections as M,
    {
      roles: dbTx.db.sessionRoles,
    },
    {
      // Skip application of read rules
      skipRules: true,
    }
  );

  const { results } = await fetchOne<M, any>(
    storeTx,
    query,
    initialFetchExecutionContext(),
    {
      schema: schema.collections,
      session: {
        systemVars: dbTx.db.systemVars,
        roles: dbTx.db.sessionRoles,
      },
    }
  );
  if (!results) {
    throw new WritePermissionError(
      collectionName,
      entityId,
      operation,
      sessionRoles ?? []
    );
  }
}

async function checkWriteRules<M extends Models>(
  dbTx: DBTransaction<M>,
  tx: TripleStoreApi,
  id: EntityId,
  schema: StoreSchema<M> | undefined
) {
  const [collectionName, entityId] = splitIdParts(id);
  if (EXEMPT_FROM_WRITE_RULES.has(collectionName)) return;
  const collections = schema?.collections;
  if (!collections) return;
  const collection = schema?.collections[collectionName];
  if (!collection) return;

  const writeRules = Object.values(collection?.rules?.write ?? {});
  if (writeRules.length) {
    const rulesWhere = writeRules.flatMap((r) => r.filter);
    const query = prepareQuery(
      {
        collectionName,
        where: [['id', '=', entityId], ...rulesWhere],
      } as CollectionQuery<M, any>,
      collections as M,
      {
        roles: dbTx.db.sessionRoles,
      },
      {
        skipRules: false,
      }
    );
    const { results } = await fetchOne<M, any>(
      tx,
      query,
      initialFetchExecutionContext(),
      {
        schema: collections,
        session: {
          systemVars: dbTx.db.systemVars,
          roles: dbTx.db.sessionRoles,
        },
      }
    );
    if (!results) {
      // TODO add better error that uses rule description
      throw new WriteRuleError(`Update does not match write rules`);
    }
  }
}

function triplesToDeltaOpSet(triples: TripleRow[]): OpSet<any> {
  const deltas = Array.from(triplesToEntities(triples).entries());
  const opSet: OpSet<any> = { inserts: [], updates: [], deletes: [] };
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

    if (operation === 'insert') opSet.inserts.push([id, delta.data]);
    else if (operation === 'update') opSet.updates.push([id, delta.data]);
    else if (operation === 'delete') opSet.deletes.push([id, delta.data]);
  }
  return opSet;
}

async function triplesToEntityOpSet(
  triples: TripleRow[],
  tripleStore: TripleStoreApi
): Promise<EntityOpSet> {
  const deltas = Array.from(triplesToEntities(triples).entries());
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
    const entity = constructEntity(
      await genToArr(tripleStore.findByEntity(id)),
      id
    );
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

export class DBTransaction<M extends Models> {
  schema: StoreSchema<M> | undefined;
  private _schema: Entity | undefined;
  private _permissionCache: Map<string, boolean> = new Map();
  logger: Logger;

  constructor(
    readonly db: DB<M>,
    readonly storeTx: TripleStoreTransaction,
    private readonly hooks: DBHooks<M>,
    readonly options: TransactionOptions<M> = {}
  ) {
    this.logger = options.logger ?? db.logger;
    this.schema = options.schema;
    this.storeTx.beforeInsert(this.ValidateTripleSchema);
    if (!options?.skipRules) {
      // Before we perform writes, check permissions
      this.storeTx.beforeInsert(this.PreWriteCheckPermissions);
      // After we perform writes, check permissions
      this.storeTx.beforeCommit(this.PostCheckWritePermissions);
    }
    if (!options.manualSchemaRefresh)
      this.storeTx.beforeInsert(this.UpdateLocalSchema);

    this.storeTx.beforeCommit(this.CallBeforeCommitDBHooks);
    this.storeTx.afterCommit(this.CallAfterCommitDBHooks);
  }

  // NOTE: this will only work on the server due to hooks limitaitons (requires a single storage)
  private PreWriteCheckPermissions: TripleStoreBeforeInsertHook = async (
    triples,
    tx
  ) => {
    const deltas = triplesToDeltaOpSet(triples);
    // Check permissions for updates before we've written
    for (const [id, _delta] of deltas.updates) {
      await checkWritePermissions(this, tx, id, this.schema, 'update');
    }
  };

  private PostCheckWritePermissions: TripleStoreBeforeCommitHook = async (
    triplesByStorage,
    tx
  ) => {
    /**
     * This will check writes rules before we commit the transaction
     * it will look for a _collection attribute to indicate an insert
     * which means looking only at the inserted triples is sufficient
     * to validate the rule.
     * Otherwise treat any triples as an update/delete and fetch the entity
     * from the store to validate the rule
     */
    for (const [storageId, triples] of Object.entries(triplesByStorage)) {
      const insertedEntities: Set<string> = new Set();
      const updatedEntities: Set<string> = new Set([
        ...triples.map((t) => t.id),
      ]);
      const deletedEntities: Set<string> = new Set();
      for (const triple of triples) {
        if (deletedEntities.has(triple.id) || insertedEntities.has(triple.id))
          continue;
        if (triple.attribute[0] === '_collection' && triple.expired) {
          updatedEntities.delete(triple.id);
          deletedEntities.add(triple.id);
          continue;
        }
        if (triple.attribute[0] === '_collection' && !triple.expired) {
          insertedEntities.add(triple.id);
          updatedEntities.delete(triple.id);
          continue;
        }
      }
      // for each updatedEntity, load triples, construct entity, and check write rules
      for (const id of updatedEntities) {
        await checkWriteRules(this, tx, id, this.schema);
        await checkWritePermissions(this, tx, id, this.schema, 'postUpdate');
      }
      for (const id of insertedEntities) {
        await checkWriteRules(this, tx, id, this.schema);
        await checkWritePermissions(this, tx, id, this.schema, 'insert');
      }
      for (const id of deletedEntities) {
        // Notably deletes use the original triples (using tx wont have data)
        // We may not be able to differentiate between a delete elsewhere and a write rule failure
        await checkWriteRules(
          this,
          this.db.tripleStore,
          id,

          this.schema
        );
        await checkWritePermissions(
          this,
          this.db.tripleStore,
          id,
          this.schema,
          'delete'
        );
      }
    }
  };

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
    // @ts-expect-error - Probably want a way to override the output type of this
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
  readonly METADATA_COLLECTION_NAME = '_metadata';

  // The original current schema operating on the transaction
  async getSchema() {
    return this.schema;
  }

  // Read the current schema based on stored data
  async getSchemaFromStore() {
    const { schemaTriples } = await readSchemaFromTripleStore(this.storeTx);
    const entity = new Entity();
    updateEntity(entity, schemaTriples);
    // Type definitions are kinda ugly here
    // @ts-expect-error - Probably want a way to override the output type of this
    const schemaDefinition = timestampedObjectToPlainObject(entity.data) as
      | SchemaDefinition
      | undefined;

    return {
      version: schemaDefinition?.version ?? 0,
      collections:
        schemaDefinition?.collections &&
        collectionsDefinitionToSchema(schemaDefinition.collections),
    } as StoreSchema<M>;
  }

  // If you would like to update the schema within a transaction (data may not be queryable after this)
  async refreshSchema() {
    if (!this.options.manualSchemaRefresh)
      throw new TriplitError(
        'Schema refresh is disabled by default. To enable, set manualSchemaRefresh to true in the transaction options.'
      );
    this.schema = await this.getSchemaFromStore();
  }

  async getSchemaJson() {
    return schemaToJSON(await this.getSchema());
  }

  async commit() {
    await this.storeTx.commit();
  }

  async cancel() {
    await this.storeTx.cancel();
  }

  get isCanceled() {
    return this.storeTx.isCanceled;
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    doc: Unalias<InsertTypeFromModel<ModelFromModels<M, CN>>>
  ): Promise<Unalias<FetchResultEntityFromParts<M, CN>>> {
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
    this.logger.debug('insert START', collectionName, doc);

    const schema = (await this.getSchema())?.collections;
    const collectionSchema = schema?.[collectionName];

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
      // @ts-expect-error
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
    const insertedEntityJS = convertEntityToJS(
      insertedEntity.data as any,
      schema,
      collectionName
    );
    this.logger.debug('insert END', collectionName, insertedEntityJS);
    return insertedEntityJS;
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: Unalias<UpdateTypeFromModel<ModelFromModels<M, CN>>>
    ) => void | Promise<void>
  ): Promise<void> {
    this.logger.debug('update START', collectionName, entityId);
    const schema = (await this.getSchema())?.collections as M;

    await this.updateRaw(collectionName, entityId, async (entity) => {
      const changes = new ChangeTracker(entity);
      const updateProxy =
        collectionName === '_metadata'
          ? createUpdateProxy<M, CN>(changes, entity)
          : createUpdateProxy<M, CN>(changes, entity, schema, collectionName);
      await updater(
        updateProxy as Unalias<UpdateTypeFromModel<ModelFromModels<M, CN>>>
      );
      // return dbDocumentToTuples(updateProxy);
      return changes.getTuples();
    });

    this.logger.debug('update END', collectionName, entityId);
  }

  /**
   * In contrast to `update`, `updateRaw` does not use a proxy to allow
   * for direct manipulation of the entity. Instead a ReadOnly version of the entity
   * is passed into the updater function which is expected to return low level
   * triples ([attribute, value]) to be inserted into the store.
   */
  async updateRaw<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    callback: (
      entity: any
    ) => [Attribute, TupleValue][] | Promise<[Attribute, TupleValue][]>
  ) {
    this.logger.debug('updateRaw START');

    const storeId = appendCollectionToId(collectionName, entityId);

    const entityTriples = await genToArr(this.storeTx.findByEntity(storeId));
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
    const changeTuples = await callback(entity);
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

    this.logger.debug('updateRaw END', updateValues);
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
    this.logger.debug('delete START', collectionName, id);
    const storeId = appendCollectionToId(collectionName, id);
    await this.storeTx.expireEntity(storeId);
    this.logger.debug('delete END', collectionName, id);
  }

  async fetch<Q extends SchemaQueries<M>>(
    query: Q,
    options: DBFetchOptions = {}
  ): Promise<Unalias<FetchResult<M, ToQuery<M, Q>>>> {
    const schema = (await this.getSchema())?.collections as M;
    const fetchQuery = prepareQuery(
      query,
      schema,
      { roles: this.db.sessionRoles },
      {
        skipRules: options.skipRules,
      }
    );
    // TODO: read scope?
    // See difference between this fetch and db fetch
    const { results } = await fetch<M, Q>(
      this.storeTx,
      fetchQuery,
      initialFetchExecutionContext(),
      {
        schema,
        skipIndex: options.skipIndex,
        session: {
          systemVars: this.db.systemVars,
          roles: this.db.sessionRoles,
        },
      }
    );
    return fetchResultToJS(
      results,
      schema,
      fetchQuery.collectionName
    ) as Unalias<FetchResult<M, Q>>;
  }

  // maybe make it public? Keeping private bc its only used internally
  private query<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    return CollectionQueryBuilder<M, CN>(collectionName);
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options: DBFetchOptions = {}
  ): Promise<Unalias<
    FetchResultEntity<M, ToQuery<M, CollectionQueryDefault<M, CN>>>
  > | null> {
    const query = this.query(collectionName).id(id).build() as SchemaQueries<M>;
    return this.fetchOne(query, options) as Promise<Unalias<
      FetchResultEntity<M, ToQuery<M, CollectionQueryDefault<M, CN>>>
    > | null>;
  }

  async fetchOne<Q extends SchemaQueries<M>>(
    query: Q,
    options: DBFetchOptions = {}
  ): Promise<Unalias<FetchResultEntity<M, ToQuery<M, Q>>> | null> {
    query = { ...query, limit: 1 };
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
    // The set of params here is unfortunately awkward to add to because of the way the schema is stored
    // We really want schema to encompass properties + optional + whatever else a part of the record type
    // Keeping the way it is now for backwards compatability though
    const {
      name: collectionName,
      schema: schemaJSON,
      rules,
      optional,
    } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schemaEntity = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        // If there are no collections, create property
        if (!schemaEntity.collections) schemaEntity.collections = {};
        const sortedOptional = optional ? optional.slice().sort() : undefined;
        // Overwrite collection data
        // Schemas are saved as record types, so translate that here
        const schemaJSONWithType = typeFromJSON({
          type: 'record',
          properties: schemaJSON,
          optional: sortedOptional,
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
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        if (!schema.collections) schema.collections = {};
        delete schema.collections[collectionName];
      }
    );
  }

  async addAttribute(params: AddAttributeOperation[1]) {
    const { collection: collectionName, path, attribute, optional } = params;
    validatePath(path);
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        validateCollectionName(schema.collections, collectionName);

        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];

        const parent = getAttribute(
          parentPath,
          schema.collections[collectionName]
        );
        validateIsValidRecordInTraversal(parent, path);

        // Update properties
        parent.properties[attrName] = attribute;

        updateOptional(parent, attrName, optional ?? false);
      }
    );
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    const { collection: collectionName, path } = params;
    validatePath(path);
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        validateCollectionName(schema.collections, collectionName);

        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];

        const parent = getAttribute(
          parentPath,
          schema.collections[collectionName]
        );
        validateIsValidRecordInTraversal(parent, path);

        delete parent.properties[attrName];

        updateOptional(parent, attrName, false);
      }
    );
  }

  async alterAttributeOption(params: AlterAttributeOptionOperation[1]) {
    const { collection: collectionName, path, options } = params;
    validatePath(path);
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        validateCollectionName(schema.collections, collectionName);

        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];

        const parent = getAttribute(
          parentPath,
          schema.collections[collectionName]
        );
        validateIsValidRecordInTraversal(parent, path);

        const attr = parent.properties[attrName];
        if (!attr)
          throw new InvalidSchemaPathError(
            path,
            'Could not traverse this path'
          );

        for (const [option, value] of Object.entries(options)) {
          // // instantiate this here until we support empty objects
          if (!attr.options) attr.options = {};
          attr.options[option] = value;
        }
      }
    );
  }

  async dropAttributeOption(params: DropAttributeOptionOperation[1]) {
    const { collection: collectionName, path, option } = params;
    validatePath(path);
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        validateCollectionName(schema.collections, collectionName);

        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];

        const parent = getAttribute(
          parentPath,
          schema.collections[collectionName]
        );
        validateIsValidRecordInTraversal(parent, path);

        const attr = parent.properties[attrName];
        if (!attr)
          throw new InvalidSchemaPathError(
            path,
            'Could not traverse this path'
          );

        if (attr.options) delete attr.options[option];
      }
    );
  }

  async addRule(params: AddRuleOperation[1]) {
    const { collection, scope, id, rule } = params;
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
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
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        const collectionAttributes = schema.collections[collection];
        delete collectionAttributes.rules[scope][id];
      }
    );
  }

  async setAttributeOptional(params: SetAttributeOptionalOperation[1]) {
    const { collection: collectionName, path, optional } = params;
    validatePath(path);
    await this.update(
      this.METADATA_COLLECTION_NAME,
      '_schema',
      async (entity) => {
        const schema = entity as UpdateTypeFromModel<
          ModelFromModels<Models, string>
        >;
        validateCollectionName(schema.collections, collectionName);

        const parentPath = path.slice(0, -1);
        const attrName = path[path.length - 1];

        const parent = getAttribute(
          parentPath,
          schema.collections[collectionName]
        );
        validateIsValidRecordInTraversal(parent, path);

        if (!parent.properties[attrName]) {
          throw new InvalidSchemaPathError(
            path,
            'Could not traverse this path'
          );
        }

        updateOptional(parent, attrName, optional);
      }
    );
  }
}

// Updates the optional properties of a record type
// Only use pure assignment operations for arrays
// Ensure optional is sorted when assigned
function updateOptional(
  recordAttr: RecordType<any>,
  attrName: string,
  optional: boolean
) {
  if (!recordAttr.optional && optional) recordAttr.optional = [attrName];
  if (recordAttr.optional) {
    if (!recordAttr.optional.includes(attrName) && optional) {
      const updatedKeys = [];
      for (let i = 0; i < recordAttr.optional.length; i++) {
        updatedKeys.push(recordAttr.optional[i]);
      }
      recordAttr.optional = [...updatedKeys, attrName].sort();
    } else if (recordAttr.optional.includes(attrName) && !optional)
      recordAttr.optional = recordAttr.optional
        .filter((attr) => attr !== attrName)
        .sort();
  }
}

function getAttribute(path: string[], collectionAttributes: any) {
  return path.reduce((acc, curr) => {
    validateIsValidRecordInTraversal(acc, path);
    return acc.properties[curr];
  }, collectionAttributes.schema);
}

function validateIsValidRecordInTraversal(record: any, path: string[]) {
  if (!record)
    throw new InvalidSchemaPathError(path, 'Could not traverse this path');
  if (!record.properties)
    throw new InvalidSchemaPathError(
      path,
      'This path terminated at a non-record type.'
    );
}

function validatePath(path: string[]) {
  if (path.length === 0)
    throw new InvalidSchemaPathError(
      path,
      'The provided path is empty. Paths must be at least one level deep.'
    );
}

function validateCollectionName(collections: any, collectionName: string) {
  const collectionAttributes = collections[collectionName];
  if (!collectionAttributes?.schema) {
    throw new CollectionNotFoundError(collectionName, collections);
  }
}

export class ChangeTracker {
  // On assignment, set proper tuples
  private tuplesTracker: Record<string, TupleValue> = {};

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

  getTuples(): [Attribute, TupleValue][] {
    return Object.entries(this.tuplesTracker).map(([attr, value]) => [
      attr.split('/'),
      value,
    ]);
  }
}

export function createUpdateProxy<
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>
>(
  changeTracker: ChangeTracker,
  entityObj: any, // TODO: type this properly, should be an untimestamped entity
  schema?: M,
  collectionName?: CN,
  prefix: string = ''
): UpdateTypeFromModel<ModelFromModels<M, CN>> {
  function proxyDeleteProperty(prop: string) {
    const propPointer = [prefix, prop].join('/');
    // ValuePointer.Set(changeTracker, propPointer, undefined);
    changeTracker.set(propPointer, undefined);
    ValuePointer.Delete(entityObj, prop as string);
    return true;
  }

  // @ts-expect-error - weird types here
  const collectionSchema = schema?.[collectionName]?.schema;

  const convertedForRead = convertEntityToJS(
    entityObj,
    schema,
    collectionName
  ) as UpdateTypeFromModel<ModelFromModels<M, CN>>;
  return new Proxy(convertedForRead, {
    set: (_target, prop, value) => {
      if (typeof prop === 'symbol') return true;
      const propPointer = [prefix, prop].join('/');
      if (!collectionSchema) {
        if (value === undefined) return proxyDeleteProperty(prop);
        changeTracker.set(propPointer, value);
        return true;
      }
      const propPath = propPointer.slice(1).split('/');
      const propSchema = getSchemaFromPath(collectionSchema, propPath);
      if (!propSchema) {
        throw new UnrecognizedPropertyInUpdateError(propPointer, value);
      }
      if (propSchema.context.optional && value === undefined) {
        return proxyDeleteProperty(prop);
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
      if (collectionSchema) {
        const propPointer = [prefix, prop].join('/');
        const propPath = propPointer.slice(1).split('/');
        const propSchema = getSchemaFromPath(
          collectionSchema,
          propPath
        ) as RecordType<any>;
        if (!propSchema.context.optional) {
          throw new InvalidOperationError(
            `Cannot delete property ${prop} because it is not optional. Please mark this property optional in your schema. If the property is nullable you may also set it to null.`
          );
        }
      }
      return proxyDeleteProperty(prop);
    },
    get: (_target, prop) => {
      if (typeof prop === 'symbol') return undefined;
      const parentPropPointer = [prefix, prop].join('/');
      const currentValue = changeTracker.get(parentPropPointer);
      // Non exitent values should be read as undefined
      if (currentValue === undefined) return undefined;
      // Null values will be returned as null (essentially the base case of "return currentValue")
      if (currentValue === null) return null;
      const propSchema =
        collectionSchema &&
        getSchemaFromPath(
          collectionSchema,
          parentPropPointer.slice(1).split('/')
        );
      // Handle sets
      if (propSchema && propSchema.type === 'set') {
        return createSetProxy(changeTracker, parentPropPointer, propSchema);
      }
      // Handle deep objects
      if (typeof currentValue === 'object' && currentValue !== null) {
        return createUpdateProxy(
          changeTracker,
          currentValue,
          schema,
          collectionName,
          parentPropPointer
        );
      }
      // TODO: fixup access to 'constructor' and other props
      return propSchema
        ? propSchema.convertDBValueToJS(currentValue)
        : currentValue;
    },
  });
}
