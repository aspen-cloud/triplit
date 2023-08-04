import {
  AttributeItem,
  EAV,
  StoreSchema,
  TripleRow,
  TripleStore,
  TripleStoreTransaction,
} from './triple-store';
import {
  getSchemaFromPath,
  JSONTypeFromModel,
  Model,
  Models,
  timestampedObjectToPlainObject,
  TypeFromModel,
} from './schema';
import * as Document from './document';
import { nanoid } from 'nanoid';
import { AsyncTupleStorageApi } from 'tuple-database';
import CollectionQueryBuilder, {
  CollectionQuery,
  fetch,
  FetchResult,
  subscribe,
  subscribeTriples,
} from './collection-query';
import { FilterStatement, Query, QueryWhere } from './query';
import MemoryStorage from './storage/memory-btree';
import {
  InvalidEntityIdError,
  InvalidInternalEntityIdError,
  InvalidMigrationOperationError,
  SessionVariableNotFoundError,
} from './errors';
import { Clock } from './clocks/clock';
import { ValuePointer } from '@sinclair/typebox/value';

type AttributeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'set_string'
  | 'set_number';
type CollectionAttribute = {
  type: AttributeType;
};

type CreateCollectionOperation = [
  'create_collection',
  { name: string; attributes: { [path: string]: CollectionAttribute } }
];
type DropCollectionOperation = ['drop_collection', { name: string }];
type AddAttributeOperation = [
  'add_attribute',
  { collection: string; path: string; attribute: CollectionAttribute }
];
type DropAttributeOperation = [
  'drop_attribute',
  { collection: string; path: string }
];
// TODO: rename path should be string[] not string
type RenameAttributeOperation = [
  'rename_attribute',
  { collection: string; path: string; newPath: string }
];
type DBOperation =
  | CreateCollectionOperation
  | DropCollectionOperation
  | AddAttributeOperation
  | DropAttributeOperation
  | RenameAttributeOperation;

export type Migration = {
  up: DBOperation[];
  down: DBOperation[];
  version: number;
  parent: number;
};

type StorageSource = AsyncTupleStorageApi;

interface DBConfig<M extends Models<any, any> | undefined> {
  schema?: M;
  migrations?: Migration[];
  source?: StorageSource;
  sources?: Record<string, StorageSource>;
  tenantId?: string;
  clock?: Clock;
  variables?: Record<string, any>;
}

const DEFAULT_STORE_KEY = 'default';

export type ModelFromModels<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M> = any
> = M extends Models<any, any>
  ? M[CN]
  : M extends undefined
  ? undefined
  : never;

export type CollectionNameFromModels<M extends Models<any, any> | undefined> =
  M extends Models<any, any> ? keyof M : M extends undefined ? string : never;

export class DBTransaction<M extends Models<any, any> | undefined> {
  constructor(
    readonly storeTx: TripleStoreTransaction,
    readonly variables?: Record<string, any>
  ) {}

  // get schema() {
  //   return this.storeTx.schema?.collections;
  // }

  async getSchema() {
    return this.storeTx.readSchema();
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
      entity: JSONTypeFromModel<ModelFromModels<M, CN>>
    ) => Promise<void>
  ) {
    const schema = (await this.getSchema())?.collections[collectionName] as
      | ModelFromModels<M, CN>
      | undefined;

    const entity = await this.fetchById(collectionName, entityId);

    if (!entity) {
      throw new Error(
        `Entity ${entityId} not found in collection ${collectionName}`
      );
    }
    const changes = new Map<string, any>();
    const updateProxy = this.createUpdateProxy<typeof schema>(
      changes,
      entity,
      schema
    );
    await updater(updateProxy);
    const fullEntityId = appendCollectionToId(collectionName, entityId);
    for (let [path, value] of changes) {
      await this.storeTx.setValue(
        fullEntityId,
        [collectionName, ...path.slice(1).split('/')],
        value
      );
    }
  }

  private createUpdateProxy<M extends Model<any> | undefined>(
    changeTracker: Map<string, any>,
    entityObj: JSONTypeFromModel<M>,
    schema?: M,
    prefix: string = ''
  ): JSONTypeFromModel<M> {
    return new Proxy(entityObj, {
      set: (_target, prop, value) => {
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
          // TODO use correct Triplit Error
          throw new Error(
            `Cannot set unrecognized property ${propPointer} to ${value}`
          );
        }
        changeTracker.set(propPointer, value);
        return true;
      },
      get: (_target, prop) => {
        const propPointer = [prefix, prop].join('/');
        const propValue = ValuePointer.Get(entityObj, propPointer);
        if (propValue === undefined) return changeTracker.get(propPointer);
        const propSchema =
          schema && getSchemaFromPath(schema, propPointer.slice(1).split('/'));
        if (
          typeof propValue === 'object' &&
          (!propSchema || propSchema['x-crdt-type'] !== 'Set') &&
          propValue !== null
        ) {
          return this.createUpdateProxy(
            changeTracker,
            propValue,
            schema,
            propPointer
          );
        }
        if (propSchema) {
          if (propSchema['x-crdt-type'] === 'Set') {
            return {
              add: (value: any) => {
                changeTracker.set([propPointer, value].join('/'), true);
              },
              remove: (value: any) => {
                changeTracker.set([propPointer, value].join('/'), false);
              },
              has: (value: any) => {
                const valuePointer = [propPointer, value].join('/');
                return changeTracker.has(valuePointer)
                  ? changeTracker.get(valuePointer)
                  : propValue[value];
              },
            };
          }
        }
        return changeTracker.has(propPointer)
          ? changeTracker.get(propPointer)
          : propValue;
      },
    });
  }

  private replaceVariablesInQuery<M extends Model<any>>(
    query: CollectionQuery<ModelFromModels<M>>
  ): CollectionQuery<ModelFromModels<M>> {
    query.where = replaceVariablesInFilterStatements(
      query.where,
      this.variables ?? {}
    );
    return query;
  }

  async fetch(query: CollectionQuery<ModelFromModels<M>>) {
    this.replaceVariablesInQuery(query);
    return fetch(this.storeTx, query);
  }

  async fetchById<Schema extends Model<any>>(
    collectionName: string,
    id: string
  ) {
    const entity = await this.storeTx.getEntity(
      appendCollectionToId(collectionName, id)
    );
    if (!entity) return null;
    return timestampedObjectToPlainObject(
      entity
    ) as TypeFromModel<Schema> | null;
  }

  async createCollection(params: CreateCollectionOperation[1]) {
    const { name: collectionName, attributes } = params;
    const updates = Object.entries(attributes).map<EAV>(([path, attribute]) => [
      '_schema',
      ['collections', collectionName, 'attributes', path, 'type'],
      attribute.type,
    ]);
    await this.storeTx.updateMetadataTuples(updates);
  }

  async dropCollection(params: DropCollectionOperation[1]) {
    const { name: collectionName } = params;
    // DELETE SCHEMA INFO
    const existingAttributeInfo = await this.storeTx.readMetadataTuples(
      '_schema',
      ['collections', collectionName]
    );
    const deletes = existingAttributeInfo.map<[string, AttributeItem[]]>(
      (eav) => [eav[0], eav[1]]
    );
    await this.storeTx.deleteMetadataTuples(deletes);

    // DELETE DATA
    // TODO: check _collection marker too?
    // const attribute = [collectionName];
    // const currentTriples = this.storeTx.findByAttribute(attribute);
    // this.storeTx.deleteTriples(currentTriples);
  }

  async renameAttribute(params: RenameAttributeOperation[1]) {
    const { collection: collectionName, path, newPath } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const existingAttributeInfo = await this.storeTx.readMetadataTuples(
        '_schema',
        ['collections', collectionName, 'attributes', path]
      );
      // Delete old attribute tuples
      const deletes = existingAttributeInfo.map<[string, AttributeItem[]]>(
        (eav) => [eav[0], eav[1]]
      );
      // Upsert new attribute tuples
      const updates = existingAttributeInfo.map<EAV>((eav) => {
        const attr = [...eav[1]];
        // ['collections', collectionName, 'attributes'] is prefix
        attr.splice(3, 1, newPath); // Logic may change if path and new path arent strings
        return [eav[0], attr, eav[2]];
      });
      await this.storeTx.deleteMetadataTuples(deletes);
      await this.storeTx.updateMetadataTuples(updates);
    }
    // Update data in place
    // For each storage scope, find all triples with the attribute and update them
    for (const storageKey of Object.keys(this.storeTx.tupleTx.store.storage)) {
      const attribute = [collectionName, path];
      const newAttribute = [collectionName, newPath];
      const scopedTx = this.storeTx.withScope({
        read: [storageKey],
        write: [storageKey],
      });
      const currentTriples = await scopedTx.findByAttribute(attribute);
      const newTriples = transformTripleAttribute(
        currentTriples,
        attribute,
        newAttribute
      );
      await scopedTx.deleteTriples(currentTriples);
      await scopedTx.insertTriples(newTriples);
    }
  }

  async addAttribute(params: AddAttributeOperation[1]) {
    const { collection: collectionName, path, attribute } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const updates: EAV[] = Object.entries(attribute).map(([key, value]) => {
        return [
          '_schema',
          ['collections', collectionName, 'attributes', path, key],
          value,
        ];
      });
      await this.storeTx.updateMetadataTuples(updates);
    }
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    const { collection: collectionName, path } = params;
    // Update schema if there is schema
    if (await this.getSchema()) {
      const existingAttributeInfo = await this.storeTx.readMetadataTuples(
        '_schema',
        ['collections', collectionName, 'attributes', path]
      );
      // Delete old attribute tuples
      const deletes = existingAttributeInfo.map<[string, AttributeItem[]]>(
        (eav) => [eav[0], eav[1]]
      );
      await this.storeTx.deleteMetadataTuples(deletes);
    }

    // TODO: check _collection marker too?
    // const attribute = [collectionName, path];
    // const currentTriples = this.storeTx.findByAttribute(attribute);
    // this.storeTx.deleteTriples(currentTriples);
  }
}

export default class DB<M extends Models<any, any> | undefined> {
  tripleStore: TripleStore;
  ensureMigrated: Promise<void>;
  variables: Record<string, any>;

  constructor({
    schema,
    source,
    sources,
    tenantId,
    migrations,
    clock,
    variables,
  }: DBConfig<M> = {}) {
    this.variables = variables ?? {};
    // If only one source is provided, use the default key
    const sourcesMap = sources ?? {
      [DEFAULT_STORE_KEY]: source ?? new MemoryStorage(),
    };
    if (Object.keys(sourcesMap).length === 0)
      throw new Error('No triple stores provided.');

    if (schema && migrations)
      throw new Error('Cannot provide both schema and migrations');

    // If a schema is provided, assume using schema but no migrations (keep at version 0)
    const tripleStoreSchema = schema
      ? { version: 0, collections: schema }
      : undefined;

    this.tripleStore = new TripleStore({
      storage: sourcesMap,
      tenantId,
      schema: tripleStoreSchema,
      clock,
    });

    this.ensureMigrated = migrations
      ? this.migrate(migrations, 'up').catch(() => {})
      : Promise.resolve();
  }

  async getClientId() {
    const ts = await this.tripleStore.clock.getCurrentTimestamp();
    return ts[1];
  }

  async getSchema(full: true): Promise<StoreSchema<M>>;
  async getSchema(
    full?: false
  ): Promise<
    M extends Models<any, any>
      ? StoreSchema<M>['collections']
      : M extends undefined
      ? undefined
      : never
  >;
  async getSchema(full: boolean = false) {
    await this.ensureMigrated;
    const tripleStoreSchema = await this.tripleStore.readSchema();
    if (full) return tripleStoreSchema;
    return tripleStoreSchema?.collections;
  }

  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ) {
    const collections = await this.getSchema();
    if (!collections) return undefined;
    // TODO: i think we need some stuff in the triple store...
    const collectionSchema = collections[collectionName] as ModelFromModels<
      M,
      CN
    >;
    return {
      ...collectionSchema,
    };
  }

  static ABORT_TRANSACTION = Symbol('abort transaction');

  async transact(
    callback: (tx: DBTransaction<M>) => Promise<void>,
    storeScope?: { read: string[]; write: string[] }
  ) {
    await this.ensureMigrated;
    return await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction<M>(tripTx, this.variables);
      return await callback(tx);
      // await tx.commit();
    }, storeScope);
  }

  private replaceVariablesInQuery<M extends Model<any>>(
    query: CollectionQuery<ModelFromModels<M>>
  ): CollectionQuery<ModelFromModels<M>> {
    query.where = replaceVariablesInFilterStatements(
      query.where,
      this.variables
    );
    return query;
  }

  async fetch(query: CollectionQuery<ModelFromModels<M>>, scope?: string[]) {
    await this.ensureMigrated;
    // TODO: need to fix collectionquery typing
    const schema = await this.getCollectionSchema(
      query.collectionName as CollectionNameFromModels<M>
    );

    this.replaceVariablesInQuery(query);

    return await fetch(
      scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
      query,
      { schema, includeTriples: false }
    );
  }

  // TODO: we could probably infer a type here
  async fetchById<Schema extends Model<any>>(
    collectionName: string,
    id: string
  ) {
    const entity = await this.tripleStore.getEntity(
      appendCollectionToId(collectionName, id)
    );
    if (!entity) return null;
    return timestampedObjectToPlainObject(
      entity
    ) as TypeFromModel<Schema> | null;
  }

  async insert(
    collectionName: string,
    doc: any,
    id?: string,
    storeScope?: { read: string[]; write: string[] }
  ) {
    if (id) {
      const validationError = validateExternalId(id);
      if (validationError) throw validationError;
    }
    await this.ensureMigrated;
    const schema = await this.getCollectionSchema(
      collectionName as CollectionNameFromModels<M>
    );

    if (schema?.rules?.write) {
    }

    const timestamp = await this.tripleStore.transact(async (tx) => {
      await Document.insert(
        tx,
        appendCollectionToId(collectionName, id ?? nanoid()),
        doc,
        collectionName
      );
    }, storeScope);
    return timestamp;
  }

  subscribe<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    callback: (results: FetchResult<Q>) => void,
    scope?: string[]
  ) {
    const startSubscription = async () => {
      // TODO: get rid of this "as" here
      const schema = await this.getCollectionSchema(
        query.collectionName as CollectionNameFromModels<M>
      );
      // @ts-ignore TODO: fix this excessively deep / infinite type error
      this.replaceVariablesInQuery(query);

      const unsub = subscribe(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
        query,
        callback,
        schema
      );
      return unsub;
    };

    const unsubPromise = startSubscription();

    return async () => {
      const unsub = await unsubPromise;
      return unsub();
    };
  }

  subscribeTriples<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    callback: (results: TripleRow[]) => void,
    scope?: string[]
  ) {
    const startSubscription = async () => {
      const schema = await this.getCollectionSchema(
        query.collectionName as CollectionNameFromModels<M>
      );
      this.replaceVariablesInQuery(query);

      const unsub = subscribeTriples(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
        query,
        callback,
        schema
      );
      return unsub;
    };

    const unsubPromise = startSubscription();

    return async () => {
      const unsub = await unsubPromise;
      return unsub();
    };
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: JSONTypeFromModel<ModelFromModels<M, CN>>
    ) => Promise<void>,
    storeScope?: { read: string[]; write: string[] }
  ) {
    await this.ensureMigrated;
    await this.transact(async (tx) => {
      await tx.update(collectionName, entityId, updater);
    }, storeScope);
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Query<ModelFromModels<M, CN>>
  ) {
    return CollectionQueryBuilder(
      collectionName as string,
      // I think TS is mad that we're not passing the generic type down to the schema
      // this.schema is of type Models<any, any>, collection query is expecting us to use the generic type M
      // Passing down the generic touched a lot of things, so we're just ignoring the error for now
      // TODO: ...pretty sure this doesnt exist anymore...can it be removed?
      // @ts-ignore
      this.schema && this.schema[collectionName],
      params
    );
  }

  async createCollection(params: CreateCollectionOperation[1]) {
    await this.transact(async (tx) => {
      await tx.createCollection(params);
    });
  }

  async dropCollection(params: DropCollectionOperation[1]) {
    await this.transact(async (tx) => {
      await tx.dropCollection(params);
    });
  }

  async renameAttribute(params: RenameAttributeOperation[1]) {
    await this.transact(async (tx) => {
      await tx.renameAttribute(params);
    });
  }

  async addAttribute(params: AddAttributeOperation[1]) {
    await this.transact(async (tx) => {
      await tx.addAttribute(params);
    });
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction(tripTx);
      await tx.dropAttribute(params);
    });
  }

  private async applyRemoteTransaction(operations: DBOperation[]) {
    await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction(tripTx);
      for (const operation of operations) {
        switch (operation[0]) {
          case 'create_collection':
            await tx.createCollection(operation[1]);
            break;
          case 'drop_collection':
            await tx.dropCollection(operation[1]);
            break;
          case 'rename_attribute':
            await tx.renameAttribute(operation[1]);
            break;
          case 'add_attribute':
            await tx.addAttribute(operation[1]);
            break;
          case 'drop_attribute':
            await tx.dropAttribute(operation[1]);
            break;
          default:
            throw new InvalidMigrationOperationError(
              `The operation ${operation[0]} is not recognized.`
            );
        }
      }
    });
  }

  async migrate(migrations: Migration[], direction: 'up' | 'down') {
    for (const migration of migrations) {
      const tripleSchema = await this.tripleStore.readSchema();
      const dbVersion = tripleSchema?.version ?? 0;
      if (canMigrate(migration, direction, dbVersion)) {
        try {
          await this.applyRemoteTransaction(migration[direction]);
        } catch (e) {
          console.error(
            `Error applying ${direction} migration with verison`,
            migration.version,
            e
          );
          throw e;
        }
        // TODO: move this into the transaction
        await this.tripleStore.updateMetadataTuples([
          [
            '_schema',
            ['version'],
            direction === 'up' ? migration.version : migration.parent,
          ],
        ]);
      } else {
        console.info('skipping migration', migration);
      }
    }
  }

  async getCollectionStats() {
    const collectionMetaTriples = await this.tripleStore.findByAttribute([
      '_collection',
    ]);
    // Aggregates each collection my entity count
    const stats = collectionMetaTriples.reduce((acc, t) => {
      const collectionName = t.value;
      if (!acc.has(collectionName)) {
        acc.set(collectionName, 0);
      }
      acc.set(collectionName, acc.get(collectionName) + 1);
      return acc;
    }, new Map());
    return stats;
  }

  async clear() {
    await this.tripleStore.clear();
  }
}

function canMigrate(
  migration: Migration,
  direction: 'up' | 'down',
  dbVersion: number
) {
  if (direction === 'up') {
    return migration.parent === dbVersion;
  } else {
    return migration.version === dbVersion;
  }
}

function transformTripleAttribute(
  triples: TripleRow[],
  attribute: string[],
  newAttribute: string[]
) {
  // At some point this may not work for all data types, but for now it does
  return triples.map<TripleRow>((triple) => {
    const fullAttribute = [...triple.attribute];
    fullAttribute.splice(0, attribute.length, ...newAttribute);
    return { ...triple, attribute: fullAttribute };
  });
}

const ID_SEPARATOR = '#';

function validateExternalId(id: string): Error | undefined {
  if (String(id).includes(ID_SEPARATOR)) {
    return new InvalidEntityIdError(id, `Id cannot include ${ID_SEPARATOR}.`);
  }
  return;
}

export function appendCollectionToId(collectionName: string, id: string) {
  return `${collectionName}${ID_SEPARATOR}${id}`;
}

export function splitIdParts(id: string): [collectionName: string, id: string] {
  const parts = id.split(ID_SEPARATOR);
  if (parts.length !== 2) {
    throw new InvalidInternalEntityIdError(
      `Malformed ID: ${id} should only include one separator(${ID_SEPARATOR})`
    );
  }
  return [parts[0], parts[1]];
}

export function stripCollectionFromId(id: string): string {
  const [_collection, entityId] = splitIdParts(id);
  return entityId;
}

function replaceVariablesInFilterStatements<M extends Model<any> | undefined>(
  statements: QueryWhere<M>,
  variables: Record<string, any>
): QueryWhere<M> {
  return statements.map((filter) => {
    if (!(filter instanceof Array)) {
      filter.filters = replaceVariablesInFilterStatements(
        filter.filters,
        variables
      );
      return filter;
    }
    if (typeof filter[2] !== 'string' || !filter[2].startsWith('$'))
      return filter;
    const varValue = variables[filter[2].slice(1)];
    if (!varValue) throw new SessionVariableNotFoundError(filter[2]);
    return [filter[0], filter[1], varValue] as FilterStatement<M>;
  });
}
