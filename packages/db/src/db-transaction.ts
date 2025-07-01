import { Schema as S } from './schema/builder.js';
import type { FetchResult, SchemaQuery } from './query/types/index.js';
import {
  CollectionNameFromModels,
  Type,
  type Models,
  type RecordType,
  type SetType,
} from './schema/index.js';
import {
  EntityNotFoundError,
  InvalidCollectionNameError,
  InvalidInsertDocumentError,
  InvalidOperationError,
  TransactionAlreadyCanceledError,
} from './errors.js';
import {
  DBChanges,
  CollectionName,
  KVStoreTransaction,
  EntityStore,
  KVStoreOrTransaction,
  DBEntity,
  Update,
  ApplyChangesOptions,
  WritePermissionCheck,
  EntityChangeValidator,
} from './types.js';
import { EntityStoreQueryEngine, flattenViewEntity } from './query-engine.js';
import { deepObjectAssign } from './utils/deep-merge.js';
import { deepIsEmpty } from './memory-write-buffer.js';
import { applyProjectionsAndConversions, DBSchema } from './db.js';
import { DBSession } from './session.js';
import { prepareQuery } from './query/prepare-query.js';
import { TypeConverters } from './schema/converters.js';
import {
  applyOverlay,
  overlayChangesOnCollection,
} from './overlay-change-buffer.js';
import { ReadModel, UpdatePayload, WriteModel } from './types/db.js';

export interface DBTransactionOptions<M extends Models<M> = Models> {
  entityStore: EntityStore;
  schema: DBSchema<M> | undefined;
  kvTx: KVStoreTransaction;
  systemVars: Record<string, any>;
  session: DBSession | undefined;
  typeConverters: TypeConverters | undefined;
  skipRules: boolean;
}

export class DBTransaction<M extends Models<M> = Models> {
  private readonly kvTx: KVStoreTransaction;
  private readonly entityStore: EntityStoreWithChanges;
  readonly changes: DBChanges = {};
  private readonly schema: DBSchema<M> | undefined;
  private readonly systemVars: Record<string, any>;
  private readonly session: DBSession | undefined;
  private readonly typeConverters: TypeConverters | undefined;
  private readonly skipRules: boolean;

  constructor(options: DBTransactionOptions<M>) {
    this.kvTx = options.kvTx;
    this.entityStore = new EntityStoreWithChanges(
      options.entityStore,
      this.changes
    );
    this.schema = options.schema;
    this.systemVars = options.systemVars;
    this.session = options.session;
    this.typeConverters = options.typeConverters;
    this.skipRules = options.skipRules;
  }

  async fetch<Q extends SchemaQuery<M>>(
    query: Q
  ): Promise<FetchResult<M, Q, 'many'>> {
    const preparedQuery = prepareQuery(
      query,
      this.schema?.collections,
      this.systemVars,
      this.session,
      {
        applyPermission: this.skipRules ? undefined : 'read',
      }
    );
    const queryEngine = new EntityStoreQueryEngine(this.kvTx, this.entityStore);
    let results = await queryEngine.fetch(preparedQuery);
    return applyProjectionsAndConversions(
      results,
      preparedQuery,
      'many',
      this.typeConverters
    );
  }

  async fetchOne<Q extends SchemaQuery<M>>(
    query: Q
  ): Promise<FetchResult<M, Q, 'one'>> {
    const results = await this.fetch({ ...query, limit: 1 });
    return results[0] ?? null;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string
  ): Promise<FetchResult<M, { collectionName: CN }, 'one'>> {
    const query = { collectionName, where: [['id', '=', id]] };
    return this.fetchOne<{ collectionName: CN }>(query);
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    data: WriteModel<M, CN>
  ): Promise<ReadModel<M, CN>> {
    // have these checks also in the kvTx itself, but
    // we don't call those until we're ready to commit
    // so these intermediate updates are necessary
    /**
     * TODO: determine how to handle cancelling
     * We discussed this once, but I think throwing an error on cancel might make sense as an abort (so you cant have operations after and dont need the below check)
     */
    if (this.kvTx.status === 'cancelled') {
      throw new TransactionAlreadyCanceledError();
    }
    if (!collectionName)
      throw new InvalidCollectionNameError(
        collectionName,
        'Collection name must be defined'
      );
    if (!data)
      throw new InvalidInsertDocumentError(
        'The document being inserted is undefined'
      );
    if (typeof data !== 'object' || Array.isArray(data))
      throw new InvalidInsertDocumentError(
        `The document being inserted must be an object.`
      );
    // TODO: this (I think) will accept inserts to collections that don't exist in the schema ... do we want to allow this?
    const collectionSchema = this.schema?.collections[collectionName]?.schema;
    const parsed = parseInsert(collectionSchema, data);
    // If at this point an id default has not been applied, add an id to the entity because its an insert
    if (!parsed.id) {
      parsed.id = Type.defaultValue(S.Id());
    }
    const collectionChanges = this.getOrCreateCollectionChanges(collectionName);
    collectionChanges.sets.set(parsed.id, parsed);

    // TODO: we should allow you to optioanlly not return the entity
    return (
      collectionSchema ? Type.decode(collectionSchema, parsed) : parsed
    ) as ReadModel<M, CN>;
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    update: UpdatePayload<M, CN>
  ) {
    if (!collectionName) {
      throw new InvalidCollectionNameError(collectionName);
    }
    if (this.kvTx.status === 'cancelled') {
      throw new TransactionAlreadyCanceledError();
    }
    let changes = undefined;
    const collectionSchema = this.schema?.collections[collectionName]?.schema;
    if (typeof update === 'function') {
      const existingEntity = structuredClone(
        await this.entityStore.getEntity(this.kvTx, collectionName, id)
      );
      if (!existingEntity) {
        throw new EntityNotFoundError(id, collectionName);
      }
      const decoded = collectionSchema
        ? Type.decode(collectionSchema, existingEntity)
        : existingEntity;
      changes = {};
      // one of the key assumptions we're making here is that the update proxy
      // will take car of the conversion of Sets and Dates. This is mostly
      // to account for capturing changes to Sets because we need something
      // that can track deletes and sets to a Set, which a Set itself cannot do
      await update(
        createUpdateProxyAndTrackChanges(decoded, changes, collectionSchema)
      );
    } else {
      changes = update;
    }
    // doing this "deeply" because property accessions of
    // nested objects (including sets) will create empty objects
    // in the changeset that will be throw errors in the
    // schema validation process
    // TODO: is this right if you want to clear an object ... I guess you cant delete the id?
    if (deepIsEmpty(changes)) {
      return;
    }
    if ('id' in changes) {
      throw new InvalidOperationError(
        `Attempted to update the id of an entity in the ${collectionName} to ${changes.id}. The 'id' attribute of an entity is immutable and cannot be updated.`
      );
    }

    const collectionChanges = this.getOrCreateCollectionChanges(collectionName);
    const currentUpdate = collectionChanges.sets.get(id);
    changes = collectionSchema
      ? Type.encode(collectionSchema, changes)
      : changes;
    if (currentUpdate) {
      changes = deepObjectAssign({}, currentUpdate, changes);
    }
    collectionChanges.sets.set(id, changes);
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string
  ) {
    if (!collectionName) {
      throw new InvalidCollectionNameError(collectionName);
    }
    if (this.kvTx.status === 'cancelled') {
      throw new TransactionAlreadyCanceledError();
    }
    const collectionChanges = this.getOrCreateCollectionChanges(collectionName);
    const existingChange = collectionChanges.sets.get(id);

    // if we're deleting an entity that has been inserted in this transaction
    // we can just remove it from the changeset
    if (existingChange && 'id' in existingChange) {
      collectionChanges.sets.delete(id);
      return;
    }
    if (existingChange) {
      collectionChanges.sets.delete(id);
    }
    collectionChanges.deletes.add(id);
  }

  private getOrCreateCollectionChanges(collection: string) {
    if (!this.changes[collection]) {
      this.changes[collection] = {
        sets: new Map(),
        deletes: new Set(),
      };
    }
    return this.changes[collection];
  }
}

export class EntityStoreWithChanges implements EntityStore {
  baseStore: EntityStore;

  constructor(
    baseStore: EntityStore,
    readonly changes: DBChanges = {}
  ) {
    this.baseStore = baseStore;
  }

  // TODO: only store changes, not full entities in buffer
  // Let the entity store handle applying stuff to full entities
  async applyChanges(
    tx: KVStoreTransaction,
    changes: DBChanges,
    options: ApplyChangesOptions
  ) {
    return this.baseStore.applyChanges(tx, changes, options);
  }

  async getEntity(
    storage: KVStoreOrTransaction,
    collection: string,
    id: string
  ): Promise<DBEntity | undefined> {
    const baseEntity = await this.baseStore.getEntity(storage, collection, id);
    if (!this.changes[collection]) {
      return baseEntity;
    }
    const buffer = this.changes[collection];
    const isDeleted = buffer.deletes.has(id);
    return applyOverlay(baseEntity, isDeleted, buffer.sets.get(id));
  }

  async *getEntitiesInCollection(
    storage: KVStoreOrTransaction,
    collection: CollectionName
  ): AsyncIterable<DBEntity> {
    // Get entities from base store
    yield* overlayChangesOnCollection(
      this.baseStore.getEntitiesInCollection(storage, collection),
      this.changes[collection]
    );
  }

  async getCollectionStats(
    storage: KVStoreOrTransaction,
    knownCollections?: CollectionName[]
  ): Promise<Map<string, number>> {
    throw new Error(
      'getCollectionStats is not implemented in EntityStoreWithChanges'
    );
  }
}

export function createUpdateProxyAndTrackChanges(
  entity: any,
  changes: any,
  type: RecordType<any> | undefined
) {
  return new Proxy(entity, {
    get(target, prop) {
      const targetDataType =
        // If record type, get property
        type?.type === 'record'
          ? type.properties[prop]
          : // If json type, continue to assume json
            type?.type === 'json'
            ? type
            : type;
      if (target[prop] instanceof Set) {
        if (!changes[prop]) {
          changes[prop] = {};
        }
        return createSetProxy(target[prop], changes[prop], targetDataType);
      }
      if (
        typeof target[prop] === 'object' &&
        !(target[prop] instanceof Date) &&
        target[prop] !== null
      ) {
        if (!changes[prop]) {
          changes[prop] = {};
        }
        return createUpdateProxyAndTrackChanges(
          target[prop],
          changes[prop],
          targetDataType
        );
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, newValue) {
      if (typeof prop === 'symbol') return true;
      // TODO: generally we don't expect an "Input" to be undefined because optional properties
      // are checked at the top level instead of at the specific attribute
      let changeAtThisProp = newValue;
      if (newValue instanceof Set) {
        let setChanges: Record<string, boolean> = {};
        // if we are overwriting an existing set, we need to clear out the old values
        if (target[prop] instanceof Set) {
          for (const item of target[prop]) {
            setChanges[item] = false;
          }
        }
        for (const item of newValue) {
          setChanges[item] = true;
        }
        changeAtThisProp = setChanges;
      } else if (newValue === undefined) {
        changeAtThisProp = null;
      } else if (newValue instanceof Date) {
        changeAtThisProp = newValue.toISOString();
      } else if (
        typeof newValue === 'object' &&
        newValue !== null &&
        // replace Arrays wholesale, don't merge
        !Array.isArray(newValue)
      ) {
        if (!changes[prop]) {
          changes[prop] = {};
        }
        changeAtThisProp = {};
        // if we're doing object reassignment
        // merge by setting existing keys to null
        if (typeof target[prop] === 'object' && target[prop] !== null) {
          for (const key in target[prop]) {
            changeAtThisProp[key] = null;
          }
        }
        for (const key in newValue) {
          changeAtThisProp[key] = newValue[key];
        }
      }
      changes[prop] = changeAtThisProp;

      return Reflect.set(target, prop, newValue);
    },
    deleteProperty(target, prop) {
      if (typeof prop === 'symbol') return true;
      changes[prop] = null;
      target[prop] = null;
      return true;
    },
  });
}

export function createSetProxy<T>(
  set: Set<T>,
  changes: Record<string, boolean>,
  type: SetType<any> | undefined
): Set<T> {
  const encoder = (value: any) =>
    type ? Type.encode(type.items, value) : value;
  const methodsToTrackUpdates = {
    add(value: T) {
      // TODO: add input validation, use schema to get set type and validate input
      if (!set.has(value)) {
        changes[encoder(value)] = true;
      }
    },
    clear(): void {
      for (const value of set) {
        changes[encoder(value)] = false;
      }
    },
    delete(value: T) {
      if (set.has(value)) {
        changes[encoder(value)] = false;
      }
    },
  };
  return new Proxy(set, {
    get(target, prop) {
      // if this is a non-function property, just return the set's value
      if (
        typeof (
          //@ts-expect-error
          target[prop]
        ) !== 'function'
      )
        return Reflect.get(target, prop);

      // if it's a function property, return a function that tracks changes
      // as necessary
      return function (
        //@ts-expect-error
        ...args
      ) {
        //@ts-expect-error
        methodsToTrackUpdates[prop]?.(...args);

        //@ts-expect-error
        return target[prop](...args);
      };
    },
  });
}

/**
 * TODO: Unify this with type converters and selections
 * If we want to eek out performance, we can pre-compile a function for the schema that does the checks below
 */

function parseInsert(type: RecordType | undefined, input: any) {
  if (!type) return input;
  const struct = Type.struct(type);
  const assigned = Type.assign(type, struct, input);
  // Helps for merging to remove undefined keys
  // TODO: see if we can avoid doing this when we merge undefined / null
  recursivelyDeleteUndefinedKeys(assigned);
  const encoded = Type.encode(type, assigned);
  return encoded;
}

function recursivelyDeleteUndefinedKeys(obj: any) {
  for (const key in obj) {
    if (obj[key] === undefined) {
      delete obj[key];
    } else if (typeof obj[key] !== 'object') {
      continue;
    } else if (
      obj[key] !== null &&
      !Array.isArray(obj[key]) &&
      !(obj[key] instanceof Date) &&
      !(obj[key] instanceof Set)
    ) {
      recursivelyDeleteUndefinedKeys(obj[key]);
    }
  }
}
