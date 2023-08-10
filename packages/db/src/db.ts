import { EAV, TripleRow, TripleStore } from './triple-store';
import {
  JSONTypeFromModel,
  Model,
  Models,
  timestampedObjectToPlainObject,
  objectToTimestampedObject,
  TypeFromModel,
} from './schema';
import * as Document from './document';
import { nanoid } from 'nanoid';
import { AsyncTupleStorageApi } from 'tuple-database';
import CollectionQueryBuilder, {
  CollectionQuery,
  doesEntityObjMatchWhere,
  fetch,
  FetchResult,
  subscribe,
  subscribeTriples,
} from './collection-query';
import { Query, QueryWhere } from './query';
import MemoryStorage from './storage/memory-btree';
import { InvalidMigrationOperationError, WriteRuleError } from './errors';
import { Clock } from './clocks/clock';

type Reference = `ref:${string}`;
import { DBTransaction } from './db-transaction';
import {
  replaceVariablesInFilterStatements,
  appendCollectionToId,
  validateExternalId,
} from './db-helpers';

type AttributeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'set_string'
  | 'set_number'
  | 'record'
  | Reference;

type CollectionAttribute = {
  type: AttributeType;
};

export interface Rule<M extends Model<any>> {
  filter: QueryWhere<M>;
  description?: string;
}

export interface CollectionRules<M extends Model<any>> {
  read?: Rule<M>[];
  write?: Rule<M>[];
  // insert?: Rule<M>[];
  // update?: Rule<M>[];
}

export type CreateCollectionOperation = [
  'create_collection',
  {
    name: string;
    attributes: { [path: string]: CollectionAttribute };
    rules?: CollectionRules<any>;
  }
];
export type DropCollectionOperation = ['drop_collection', { name: string }];
export type AddAttributeOperation = [
  'add_attribute',
  { collection: string; path: string; attribute: CollectionAttribute }
];
export type DropAttributeOperation = [
  'drop_attribute',
  { collection: string; path: string }
];
// TODO: rename path should be string[] not string
export type RenameAttributeOperation = [
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
  schema?: { collections: NonNullable<M>; version?: number };
  migrations?: Migration[];
  source?: StorageSource;
  sources?: Record<string, StorageSource>;
  tenantId?: string;
  clock?: Clock;
  variables?: Record<string, any>;
}

const DEFAULT_STORE_KEY = 'default';

export type CollectionFromModels<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>
> = M extends Models<any, any>
  ? M[CN]
  : M extends undefined
  ? undefined
  : never;

export type ModelFromModels<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>
> = M extends Models<any, any>
  ? M[CN]['attributes']
  : M extends undefined
  ? undefined
  : never;

export type CollectionNameFromModels<M extends Models<any, any> | undefined> =
  M extends Models<any, any> ? keyof M : M extends undefined ? string : never;

export function ruleToTuple(
  collectionName: string,
  ruleType: keyof CollectionRules<any>,
  index: number,
  rule: Rule<any>
) {
  return Object.entries(rule).map<EAV>(([key, value]) => [
    '_schema',
    ['collections', collectionName, 'rules', ruleType, index, key],
    value,
  ]);
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
      ? { version: schema.version ?? 0, collections: schema.collections }
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

  async getSchema() {
    await this.ensureMigrated;
    // TODO: add schema definition to triple store, so we can return StoreSchema<M>
    // Or make StoreSchema<M> compatible with StoreSchema<Models<any, any>>
    return await this.tripleStore.readSchema();
  }

  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ) {
    const collections = (await this.getSchema())?.collections;
    if (!collections) return undefined;
    // TODO: i think we need some stuff in the triple store...
    const collectionSchema = collections[
      collectionName
    ] as CollectionFromModels<M, CN>;
    return {
      ...collectionSchema,
    };
  }

  static ABORT_TRANSACTION = Symbol('abort transaction');

  private addReadRulesToQuery(
    query: CollectionQuery<ModelFromModels<M>>,
    collection: CollectionFromModels<M>
  ): CollectionQuery<ModelFromModels<M>> {
    if (collection?.rules?.read) {
      const updatedWhere = [
        ...query.where,
        ...collection.rules.read.flatMap((rule) => rule.filter),
      ];
      // @ts-ignore I think we need to pass the schema type to where we read from storage
      return { ...query, where: updatedWhere };
    }
    return query;
  }

  async transact(
    callback: (tx: DBTransaction<M>) => Promise<void>,
    storeScope?: { read: string[]; write: string[] }
  ) {
    await this.ensureMigrated;
    return await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction<M>(tripTx, this.variables);
      try {
        await callback(tx);
      } catch (e) {
        console.error(e);
        await tx.cancel();
        throw e;
      }
    }, storeScope);
  }

  updateVariables(variables: Record<string, any>) {
    this.variables = { ...this.variables, ...variables };
  }

  private replaceVariablesInQuery(
    query: CollectionQuery<ModelFromModels<M>>
  ): CollectionQuery<ModelFromModels<M>> {
    const variables = { ...(this.variables ?? {}), ...(query.vars ?? {}) };
    const where = replaceVariablesInFilterStatements(query.where, variables);
    return { ...query, where };
  }

  async fetch(
    query: CollectionQuery<ModelFromModels<M>>,
    { scope, skipRules = false }: { scope?: string[]; skipRules?: boolean } = {}
  ) {
    await this.ensureMigrated;
    // TODO: need to fix collectionquery typing
    let fetchQuery = query;
    const collection = await this.getCollectionSchema(
      fetchQuery.collectionName as CollectionNameFromModels<M>
    );
    if (collection && !skipRules) {
      fetchQuery = this.addReadRulesToQuery(fetchQuery, collection);
    }
    fetchQuery = this.replaceVariablesInQuery(fetchQuery);
    return await fetch(
      scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
      fetchQuery,
      { schema: collection?.attributes, includeTriples: false }
    );
  }

  // TODO: we could probably infer a type here
  async fetchById<Schema extends Model<any>>(
    collectionName: CollectionNameFromModels<M>,
    id: string
  ) {
    const collection = await this.getCollectionSchema(collectionName);
    const readRules = collection?.rules?.read;
    const entity = await this.tripleStore.getEntity(
      appendCollectionToId(collectionName, id)
    );
    if (!entity) return null;
    if (entity && readRules) {
      const whereFilter = readRules.flatMap((rule) => rule.filter);
      let query = { where: whereFilter };
      // TODO see other comment about replaceVariablesInQuery on how to improve
      // @ts-ignore
      query = this.replaceVariablesInQuery(query);
      const collectionSchema = collection.attributes;
      if (doesEntityObjMatchWhere(entity, query.where, collectionSchema)) {
        return entity;
      }
      return null;
    }
    return timestampedObjectToPlainObject(
      entity
    ) as TypeFromModel<Schema> | null;
  }

  async insert(
    collectionName: CollectionNameFromModels<M>,
    doc: any,
    id?: string,
    storeScope?: { read: string[]; write: string[] }
  ) {
    if (id) {
      const validationError = validateExternalId(id);
      if (validationError) throw validationError;
    }
    await this.ensureMigrated;
    const collection = await this.getCollectionSchema(collectionName);

    if (collection?.rules?.write?.length) {
      const filters = collection.rules.write.flatMap((r) => r.filter);
      let query = { where: filters } as CollectionQuery<ModelFromModels<M>>;
      query = this.replaceVariablesInQuery(query);
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
    onResults: (results: FetchResult<Q>) => void,
    onError?: (error: any) => void,
    { scope, skipRules = false }: { scope?: string[]; skipRules?: boolean } = {}
  ) {
    const startSubscription = async () => {
      let subscriptionQuery = query;
      // TODO: get rid of this "as" here
      const collection = await this.getCollectionSchema(
        subscriptionQuery.collectionName as CollectionNameFromModels<M>
      );
      if (collection && !skipRules) {
        // TODO see other comment about replaceVariablesInQuery on how to improve
        // @ts-ignore
        subscriptionQuery = this.addReadRulesToQuery(
          subscriptionQuery,
          collection
        );
      }
      // @ts-ignore
      subscriptionQuery = this.replaceVariablesInQuery(subscriptionQuery);

      const unsub = subscribe(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
        subscriptionQuery,
        onResults,
        onError,
        // @ts-ignore
        collection?.attributes
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
    onResults: (results: TripleRow[]) => void,
    onError?: (error: any) => void,
    { scope, skipRules = false }: { scope?: string[]; skipRules?: boolean } = {}
  ) {
    const startSubscription = async () => {
      let subscriptionQuery = query;
      const collection = await this.getCollectionSchema(
        subscriptionQuery.collectionName as CollectionNameFromModels<M>
      );
      if (collection && !skipRules) {
        // @ts-ignore
        subscriptionQuery = this.addReadRulesToQuery(
          subscriptionQuery,
          collection
        );
      }
      // @ts-ignore
      subscriptionQuery = this.replaceVariablesInQuery(subscriptionQuery);

      const unsub = subscribeTriples(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
        subscriptionQuery,
        onResults,
        onError,
        //@ts-ignore
        collection?.attributes
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
    return await this.transact(async (tx) => {
      await tx.update(collectionName, entityId, updater);
    }, storeScope);
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Query<ModelFromModels<M, CN>>
  ) {
    return CollectionQueryBuilder(collectionName as string, params);
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
