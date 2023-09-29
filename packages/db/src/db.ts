import { EAV, TripleRow, TripleStore } from './triple-store';
import { ProxyTypeFromModel, Model, Models, JSONTypeFromModel } from './schema';
import { AsyncTupleStorageApi } from 'tuple-database';
import CollectionQueryBuilder, {
  CollectionQuery,
  fetch,
  FetchResult,
  subscribe,
  subscribeTriples,
} from './collection-query';
import { Query, QueryWhere } from './query';
import MemoryStorage from './storage/memory-btree';
import { InvalidMigrationOperationError } from './errors';
import { Clock } from './clocks/clock';

import { DBTransaction } from './db-transaction';
import {
  appendCollectionToId,
  replaceVariablesInQuery,
  mapFilterStatements,
  readSchemaFromTripleStore,
  overrideStoredSchema,
} from './db-helpers';
import {
  AttributeDefinition,
  UserTypeOptions,
} from './data-types/serialization';

export interface Rule<M extends Model> {
  filter: QueryWhere<M>;
  description?: string;
}

export interface CollectionRules<M extends Model> {
  read?: Rule<M>[];
  write?: Rule<M>[];
  // insert?: Rule<M>[];
  // update?: Rule<M>[];
}

export type CreateCollectionOperation = [
  'create_collection',
  {
    name: string;
    attributes: { [path: string]: AttributeDefinition };
    rules?: CollectionRules<any>;
  }
];
export type DropCollectionOperation = ['drop_collection', { name: string }];
export type AddAttributeOperation = [
  'add_attribute',
  { collection: string; path: string[]; attribute: AttributeDefinition }
];
export type DropAttributeOperation = [
  'drop_attribute',
  { collection: string; path: string[] }
];
export type AlterAttributeOptionOperation = [
  'alter_attribute_option',
  { collection: string; path: string[]; options: UserTypeOptions }
];
export type DropAttributeOptionOperation = [
  'drop_attribute_option',
  { collection: string; path: string[]; option: string }
];
type DBOperation =
  | CreateCollectionOperation
  | DropCollectionOperation
  | AddAttributeOperation
  | DropAttributeOperation
  | AlterAttributeOptionOperation
  | DropAttributeOptionOperation;

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

interface FetchOptions {
  scope?: string[];
  skipRules?: boolean;
}

const DEFAULT_STORE_KEY = 'default';

export type CollectionFromModels<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M> = any
> = M extends Models<any, any>
  ? M[CN]
  : M extends undefined
  ? undefined
  : never;

export type ModelFromModels<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M> = any
> = M extends Models<any, any>
  ? M[CN]['attributes']
  : M extends undefined
  ? undefined
  : never;

export type CollectionNameFromModels<M extends Models<any, any> | undefined> =
  M extends Models<any, any> ? keyof M : M extends undefined ? string : never;

export interface DBFetchOptions {
  skipRules?: boolean;
  scope?: string[];
}

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
  ensureMigrated: Promise<void | void[]>;
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
      ? this.migrate(migrations, 'up').catch((e) => {
          console.error(e);
        })
      : tripleStoreSchema
      ? overrideStoredSchema(this.tripleStore, tripleStoreSchema)
      : Promise.resolve();
  }

  async getClientId() {
    const ts = await this.tripleStore.clock.getCurrentTimestamp();
    return ts[1];
  }

  async getSchema() {
    await this.ensureMigrated;
    const { schema } = await readSchemaFromTripleStore(this.tripleStore);
    return schema;
  }

  async getSchemaTriples() {
    await this.ensureMigrated;
    const { schemaTriples } = await readSchemaFromTripleStore(this.tripleStore);
    return schemaTriples;
  }

  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ) {
    const collections = (await this.getSchema())?.collections;
    if (!collections || !collections[collectionName]) return undefined;
    // TODO: i think we need some stuff in the triple store...
    const collectionSchema = collections[
      collectionName
    ] as CollectionFromModels<M, CN>;
    return collectionSchema;
  }

  static ABORT_TRANSACTION = Symbol('abort transaction');

  // TODO: move to shared method with db-transaction
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

  async transact(
    callback: (tx: DBTransaction<M>) => Promise<void>,
    storeScope?: { read: string[]; write: string[] }
  ) {
    await this.ensureMigrated;
    const schema = await this.getSchema();
    return await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction<M>(tripTx, this.variables, schema);
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

  async fetch<Q extends CollectionQuery<ModelFromModels<M, any>>>(
    query: Q,
    { scope, skipRules = false }: FetchOptions = {}
  ) {
    await this.ensureMigrated;
    const { query: fetchQuery, collection } = await this.prepareQuery(query, {
      scope,
      skipRules,
    });
    return await fetch(
      scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
      fetchQuery,
      { schema: collection?.attributes, includeTriples: false }
    );
  }

  async fetchTriples<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    { scope, skipRules = false }: FetchOptions = {}
  ) {
    await this.ensureMigrated;
    const { query: fetchQuery, collection } = await this.prepareQuery(query, {
      scope,
      skipRules,
    });
    return (
      await fetch(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
        fetchQuery,
        { schema: collection?.attributes, includeTriples: true }
      )
    ).triples;
  }

  private async prepareQuery<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    options: FetchOptions
  ) {
    await this.ensureMigrated;
    let fetchQuery = query;
    const collection = await this.getCollectionSchema(
      fetchQuery.collectionName as CollectionNameFromModels<M>
    );
    if (collection && !options.skipRules) {
      fetchQuery = this.addReadRulesToQuery(fetchQuery, collection);
    }
    fetchQuery = replaceVariablesInQuery(this, fetchQuery);
    fetchQuery.where = mapFilterStatements(
      fetchQuery.where,
      ([prop, op, val]) => [
        prop,
        op,
        val instanceof Date ? val.toISOString() : val,
      ]
    );
    return { query: fetchQuery, collection };
  }

  // TODO: we could probably infer a type here
  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    { skipRules = false }: DBFetchOptions = {}
  ) {
    await this.ensureMigrated;
    const query = this.query(collectionName).entityId(id).build();
    const result = await this.fetch(query, { skipRules });
    return result.has(id) ? result.get(id) : null;
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    doc: JSONTypeFromModel<ModelFromModels<M, CN>>,
    id?: string,
    storeScope?: { read: string[]; write: string[] }
  ) {
    return this.transact(async (tx) => {
      await tx.insert(collectionName, doc, id);
    }, storeScope);
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
        subscriptionQuery = this.addReadRulesToQuery(
          subscriptionQuery,
          collection
        );
      }
      subscriptionQuery = replaceVariablesInQuery(this, subscriptionQuery);

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
      subscriptionQuery = replaceVariablesInQuery(this, subscriptionQuery);

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
      entity: ProxyTypeFromModel<ModelFromModels<M, CN>>
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

  async addAttribute(params: AddAttributeOperation[1]) {
    await this.transact(async (tx) => {
      await tx.addAttribute(params);
    });
  }

  async dropAttribute(params: DropAttributeOperation[1]) {
    await this.transact(async (tx) => {
      await tx.dropAttribute(params);
    });
  }

  async alterAttributeOption(params: AlterAttributeOptionOperation[1]) {
    await this.transact(async (tx) => {
      await tx.alterAttributeOption(params);
    });
  }

  async dropAttributeOption(params: DropAttributeOptionOperation[1]) {
    await this.transact(async (tx) => {
      await tx.dropAttributeOption(params);
    });
  }

  private async applySchemaMigration(operations: DBOperation[]) {
    // Need to read from triple store manually because we block db.transaction() api and schema access
    const { schema } = await readSchemaFromTripleStore(this.tripleStore);
    await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction(tripTx, this.variables, schema);
      for (const operation of operations) {
        switch (operation[0]) {
          case 'create_collection':
            await tx.createCollection(operation[1]);
            break;
          case 'drop_collection':
            await tx.dropCollection(operation[1]);
            break;
          case 'add_attribute':
            await tx.addAttribute(operation[1]);
            break;
          case 'drop_attribute':
            await tx.dropAttribute(operation[1]);
            break;
          case 'alter_attribute_option':
            await tx.alterAttributeOption(operation[1]);
            break;
          case 'drop_attribute_option':
            await tx.dropAttributeOption(operation[1]);
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
      const { schema: storedSchema } = await readSchemaFromTripleStore(
        this.tripleStore
      );
      const dbVersion = storedSchema?.version ?? 0;
      if (canMigrate(migration, direction, dbVersion)) {
        try {
          await this.applySchemaMigration(migration[direction]);
        } catch (e) {
          console.error(
            `Error applying ${direction} migration with verison`,
            migration.version,
            e
          );
          throw e;
        }
        await this.tripleStore.insertTriples(
          [
            {
              id: appendCollectionToId('_metadata', '_schema'),
              attribute: ['_metadata', 'version'],
              value: direction === 'up' ? migration.version : migration.parent,
              timestamp: await this.tripleStore.clock.getNextTimestamp(),
              expired: false,
            },
          ],
          false
        );
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
