import {
  UpdateTypeFromModel,
  Model,
  Models,
  InsertTypeFromModel,
  timestampedSchemaToSchema,
} from './schema.js';
import { AsyncTupleStorageApi, TupleStorageApi } from '@triplit/tuple-database';
import CollectionQueryBuilder, {
  fetch,
  FetchResult,
  FetchResultEntity,
  subscribe,
  subscribeTriples,
} from './collection-query.js';
import {
  CollectionQuery,
  Entity,
  Query,
  QueryWhere,
  constructEntity,
  updateEntity,
} from './query.js';
import { MemoryBTreeStorage } from './storage/memory-btree.js';
import { DBOptionsError, InvalidMigrationOperationError } from './errors.js';
import { Clock } from './clocks/clock.js';

import { DBTransaction, EntityOpSet } from './db-transaction.js';
import {
  appendCollectionToId,
  readSchemaFromTripleStore,
  overrideStoredSchema,
  StoreSchema,
  prepareQuery,
  getSchemaTriples,
} from './db-helpers.js';
import { VariableAwareCache } from './variable-aware-cache.js';

import {
  AttributeDefinition,
  UserTypeOptions,
} from './data-types/serialization.js';
import { copyHooks, triplesToObject } from './utils.js';
import { EAV, indexToTriple, TripleRow } from './triple-store-utils.js';
import { TripleStore, TripleStoreApi } from './triple-store.js';
import { TripleStoreTransaction } from './triple-store-transaction.js';

export interface Rule<M extends Model<any>> {
  filter: QueryWhere<M>;
  description?: string;
}

export interface CollectionRules<M extends Model<any>> {
  read?: Record<string, Rule<M>>;
  write?: Record<string, Rule<M>>;
  // insert?: Rule<M>[];
  // update?: Rule<M>[];
}

interface TransactOptions {
  storeScope?: { read: string[]; write: string[] };
  skipRules?: boolean;
}

export type CreateCollectionOperation = [
  'create_collection',
  {
    name: string;
    schema: { [path: string]: AttributeDefinition };
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
export type AddRuleOperation = [
  'add_rule',
  { collection: string; scope: string; id: string; rule: Rule<any> }
];
export type DropRuleOperation = [
  'drop_rule',
  { collection: string; scope: string; id: string }
];

type DBOperation =
  | CreateCollectionOperation
  | DropCollectionOperation
  | AddAttributeOperation
  | DropAttributeOperation
  | AlterAttributeOptionOperation
  | DropAttributeOptionOperation
  | AddRuleOperation
  | DropRuleOperation;

export type Migration = {
  up: DBOperation[];
  down: DBOperation[];
  version: number;
  parent: number;
  name: string;
};

type StorageSource = AsyncTupleStorageApi | TupleStorageApi;

export interface DBConfig<M extends Models<any, any> | undefined> {
  schema?: { collections: NonNullable<M>; version?: number };
  migrations?:
    | Migration[]
    | {
        definitions: Migration[];
        scopes?: string[];
      };
  source?: StorageSource;
  sources?: Record<string, StorageSource>;
  tenantId?: string;
  clock?: Clock;
  variables?: Record<string, any>;
}

export const DEFAULT_STORE_KEY = 'default';
const QUERY_CACHE_ENABLED = true;

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
  ? M[CN]['schema']
  : M extends undefined
  ? undefined
  : never;

type IsAny<T> = 0 extends 1 & T ? true : false;
type isAnyOrUndefined<T> = IsAny<T> extends true
  ? true
  : undefined extends T
  ? true
  : false;

export type CollectionNameFromModels<M extends Models<any, any> | undefined> =
  isAnyOrUndefined<M> extends true
    ? string
    : M extends Models<any, any>
    ? keyof M
    : never;

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

// export type FetchByIdQueryParams<
//   M extends Models<any, any> | undefined,
//   CN extends CollectionNameFromModels<M>
// > = {
//   include?: Parameters<
//     ReturnType<typeof CollectionQueryBuilder<M, CN>>['include']
//   >[0][];
// };

export type FetchByIdQueryParams<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Pick<Query<M, CN>, 'include'>;

type SchemaChangeCallback<M extends Models<any, any> | undefined> = (
  schema: StoreSchema<M> | undefined
) => void;

type TriggerWhen =
  | 'afterCommit'
  | 'afterDelete'
  | 'afterInsert'
  | 'afterUpdate'
  | 'beforeCommit'
  | 'beforeDelete'
  | 'beforeInsert'
  | 'beforeUpdate';

interface TriggerOptionsBase {
  when: TriggerWhen;
  collectionName: string;
}

interface AfterCommitOptions extends TriggerOptionsBase {
  when: 'afterCommit';
}
type AfterCommitCallback = (args: {
  opSet: EntityOpSet;
  // TODO: should be db transaction
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface AfterInsertOptions extends TriggerOptionsBase {
  when: 'afterInsert';
}
type AfterInsertCallback = (args: {
  entity: any;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface AfterUpdateOptions extends TriggerOptionsBase {
  when: 'afterUpdate';
}
type AfterUpdateCallback = (args: {
  entity: any;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface AfterDeleteOptions extends TriggerOptionsBase {
  when: 'afterDelete';
}
type AfterDeleteCallback = (args: {
  entity: any;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface BeforeCommitOptions extends TriggerOptionsBase {
  when: 'beforeCommit';
}
type BeforeCommitCallback = (args: {
  opSet: EntityOpSet;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface BeforeInsertOptions extends TriggerOptionsBase {
  when: 'beforeInsert';
}
type BeforeInsertCallback = (args: {
  entity: any;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface BeforeUpdateOptions extends TriggerOptionsBase {
  when: 'beforeUpdate';
}
type BeforeUpdateCallback = (args: {
  entity: any;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;
interface BeforeDeleteOptions extends TriggerOptionsBase {
  when: 'beforeDelete';
}
type BeforeDeleteCallback = (args: {
  entity: any;
  tx: TripleStoreTransaction;
  db: TripleStoreApi;
}) => void | Promise<void>;

type TriggerOptions =
  | AfterCommitOptions
  | AfterInsertOptions
  | AfterUpdateOptions
  | AfterDeleteOptions
  | BeforeCommitOptions
  | BeforeInsertOptions
  | BeforeUpdateOptions
  | BeforeDeleteOptions;

type TriggerCallback =
  | AfterCommitCallback
  | AfterInsertCallback
  | AfterUpdateCallback
  | AfterDeleteCallback
  | BeforeCommitCallback
  | BeforeInsertCallback
  | BeforeUpdateCallback
  | BeforeDeleteCallback;

export type DBHooks = {
  afterCommit: [AfterCommitCallback, AfterCommitOptions][];
  afterInsert: [AfterInsertCallback, AfterInsertOptions][];
  afterUpdate: [AfterInsertCallback, AfterUpdateOptions][];
  afterDelete: [AfterDeleteCallback, AfterDeleteOptions][];
  beforeCommit: [BeforeCommitCallback, BeforeCommitOptions][];
  beforeInsert: [BeforeInsertCallback, BeforeInsertOptions][];
  beforeUpdate: [BeforeUpdateCallback, BeforeUpdateOptions][];
  beforeDelete: [BeforeDeleteCallback, BeforeDeleteOptions][];
};

export default class DB<M extends Models<any, any> | undefined = undefined> {
  tripleStore: TripleStore;
  ensureMigrated: Promise<void | void[]>;
  variables: Record<string, any>;
  cache: VariableAwareCache<Models<any, any>>;

  _schema?: Entity; // Timestamped Object
  schema?: StoreSchema<M>;
  private onSchemaChangeCallbacks: Set<SchemaChangeCallback<M>>;

  private hooks: DBHooks = {
    afterCommit: [],
    afterInsert: [],
    afterUpdate: [],
    afterDelete: [],
    beforeCommit: [],
    beforeInsert: [],
    beforeUpdate: [],
    beforeDelete: [],
  };

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
      [DEFAULT_STORE_KEY]: source ?? new MemoryBTreeStorage(),
    };
    if (Object.keys(sourcesMap).length === 0)
      throw new DBOptionsError('No triple stores provided.');

    if (schema && migrations)
      throw new DBOptionsError('Cannot provide both schema and migrations');

    // If a schema is provided, assume using schema but no migrations (keep at version 0)
    const tripleStoreSchema = schema
      ? { version: schema.version ?? 0, collections: schema.collections }
      : undefined;

    this.tripleStore = new TripleStore({
      storage: sourcesMap,
      tenantId,
      clock,
    });

    this.cache = new VariableAwareCache(this.tripleStore);

    // Add listener to update in memory schema
    const updateCachedSchemaOnChange: SchemaChangeCallback<M> = (schema) =>
      (this.schema = schema);
    this.onSchemaChangeCallbacks = new Set([updateCachedSchemaOnChange]);

    this.ensureMigrated = this.tripleStore
      .ensureStorageIsMigrated()
      // Apply migrations or overwrite schema
      .then(() =>
        migrations
          ? Array.isArray(migrations)
            ? this.migrate(migrations, 'up')
            : this.migrate(migrations.definitions, 'up', migrations.scopes)
          : // .catch((e) => {
          //   console.error(e);
          // })
          tripleStoreSchema
          ? overrideStoredSchema(this.tripleStore, tripleStoreSchema)
          : Promise.resolve()
      )
      // Setup schema subscription
      .then(() => {
        this.tripleStore.tupleStore.subscribe(
          { prefix: ['EAT', appendCollectionToId('_metadata', '_schema')] },
          async (storeWrites) => {
            // This assumes we are properly using tombstoning, so only looking at set operations
            const schemaTriples = Object.values(storeWrites).flatMap(
              (w) => w.set?.map((s) => indexToTriple(s)) ?? []
            );

            // Initialize schema entity
            if (!this._schema) {
              await this.loadSchemaData();
            }

            // Update schema
            updateEntity(this._schema!, schemaTriples);
            const newSchema = timestampedSchemaToSchema(
              this._schema!.data
            ) as StoreSchema<M>;

            // Call any listeners
            for (const cb of this.onSchemaChangeCallbacks) {
              cb(newSchema);
            }
          }
        );
      });
  }

  setTrigger(on: AfterCommitOptions, callback: AfterCommitCallback): void;
  setTrigger(on: AfterInsertOptions, callback: AfterInsertCallback): void;
  setTrigger(on: AfterUpdateOptions, callback: AfterUpdateCallback): void;
  setTrigger(on: AfterDeleteOptions, callback: AfterDeleteCallback): void;
  setTrigger(on: BeforeCommitOptions, callback: BeforeCommitCallback): void;
  setTrigger(on: BeforeInsertOptions, callback: BeforeInsertCallback): void;
  setTrigger(on: BeforeUpdateOptions, callback: BeforeUpdateCallback): void;
  setTrigger(on: BeforeDeleteOptions, callback: BeforeDeleteCallback): void;
  setTrigger(on: TriggerOptions, callback: TriggerCallback) {
    switch (on.when) {
      case 'afterCommit':
        // @ts-expect-error TODO
        this.hooks.afterCommit.push([callback, on]);
        break;
      case 'afterInsert':
        // @ts-expect-error TODO
        this.hooks.afterInsert.push([callback, on]);
        break;
      case 'afterUpdate':
        // @ts-expect-error TODO
        this.hooks.afterUpdate.push([callback, on]);
        break;
      case 'afterDelete':
        // @ts-expect-error TODO
        this.hooks.afterDelete.push([callback, on]);
        break;
      case 'beforeCommit':
        // @ts-expect-error TODO
        this.hooks.beforeCommit.push([callback, on]);
        break;
      case 'beforeInsert':
        // @ts-expect-error TODO
        this.hooks.beforeInsert.push([callback, on]);
        break;
      case 'beforeUpdate':
        // @ts-expect-error TODO
        this.hooks.beforeUpdate.push([callback, on]);
        break;
      case 'beforeDelete':
        // @ts-expect-error TODO
        this.hooks.beforeDelete.push([callback, on]);
        break;
    }
  }

  withVars(variables: Record<string, any>): DB<M> {
    return Session(this, variables);
  }

  async getClientId() {
    const ts = await this.tripleStore.clock.getCurrentTimestamp();
    return ts[1];
  }

  private async loadSchemaData() {
    await this.ensureMigrated;
    const triples = await getSchemaTriples(this.tripleStore);
    this._schema =
      constructEntity(triples, appendCollectionToId('_metadata', '_schema')) ??
      new Entity();

    // Schema should remain undefined if no triples
    if (triples.length) {
      this.schema = timestampedSchemaToSchema(
        this._schema.data
      ) as StoreSchema<M>;
    }
  }

  async getSchema(): Promise<StoreSchema<M> | undefined> {
    await this.ensureMigrated;
    if (!this._schema) {
      await this.loadSchemaData();
    }
    return this.schema;
  }

  static ABORT_TRANSACTION = Symbol('abort transaction');

  async transact<Output>(
    callback: (tx: DBTransaction<M>) => Promise<Output>,
    options: TransactOptions = {}
  ) {
    await this.ensureMigrated;
    const schema = await this.getSchema();
    return await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction<M>(this, tripTx, this.hooks, {
        variables: this.variables,
        schema,
        skipRules: options.skipRules,
      });
      try {
        return await callback(tx);
      } catch (e) {
        console.error(e);
        await tx.cancel();
        throw e;
      }
    }, options.storeScope);
  }

  updateVariables(variables: Record<string, any>) {
    this.variables = { ...this.variables, ...variables };
  }

  async fetch<Q extends CollectionQuery<M, any>>(
    query: Q,
    options: DBFetchOptions = {}
  ) {
    await this.ensureMigrated;
    const { query: fetchQuery } = await prepareQuery(this, query, options);

    return await fetch<M, Q>(
      options.scope
        ? this.tripleStore.setStorageScope(options.scope)
        : this.tripleStore,
      fetchQuery,
      {
        schema: (await this.getSchema())?.collections,
        includeTriples: false,
        cache: QUERY_CACHE_ENABLED ? this.cache : undefined,
      }
    );
  }

  async fetchTriples<Q extends CollectionQuery<M, any>>(
    query: Q,
    options: DBFetchOptions = {}
  ) {
    await this.ensureMigrated;
    const { query: fetchQuery } = await prepareQuery(this, query, options);
    return [
      ...(
        await fetch<M, Q>(
          options.scope
            ? this.tripleStore.setStorageScope(options.scope)
            : this.tripleStore,
          fetchQuery,
          {
            schema: (await this.getSchema())?.collections,
            includeTriples: true,
          }
        )
      ).triples.values(),
    ].flat();
  }

  // TODO: we could probably infer a type here
  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    queryParams: FetchByIdQueryParams<M, CN> = {},
    options: DBFetchOptions = {}
  ) {
    const query = this.query(collectionName, queryParams)
      // @ts-expect-error ModelFromModels<M, CN> doesnt pass through that 'id' is a property
      .where('id', '=', id)
      .build();
    return this.fetchOne(query, options);
  }

  async fetchOne<Q extends CollectionQuery<M, any>>(
    query: Q,
    options: DBFetchOptions = {}
  ): Promise<FetchResultEntity<Q> | null> {
    query.limit = 1;
    await this.ensureMigrated;
    const result = await this.fetch(query, options);
    const entity = [...result.values()][0];
    if (!entity) return null;
    return entity;
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    doc: InsertTypeFromModel<ModelFromModels<M, CN>>,
    options: TransactOptions = {}
  ) {
    return this.transact(async (tx) => {
      return await tx.insert(collectionName, doc);
    }, options);
  }

  async delete<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options: TransactOptions = {}
  ) {
    return this.transact(async (tx) => {
      await tx.delete(collectionName, id);
    }, options);
  }

  subscribe<Q extends CollectionQuery<M, any>>(
    query: Q,
    onResults: (results: FetchResult<Q>) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options: DBFetchOptions = {}
  ) {
    const startSubscription = async () => {
      await this.ensureMigrated;
      let { query: subscriptionQuery } = await prepareQuery(
        this,
        query,
        options
      );

      const unsub = subscribe<M, Q>(
        options.scope
          ? this.tripleStore.setStorageScope(options.scope)
          : this.tripleStore,
        subscriptionQuery,
        onResults,
        onError,
        (await this.getSchema())?.collections
      );
      return unsub;
    };

    const unsubPromise = startSubscription();

    return async () => {
      const unsub = await unsubPromise;
      return unsub();
    };
  }

  subscribeTriples<Q extends CollectionQuery<M, any>>(
    query: Q,
    onResults: (results: TripleRow[]) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options: DBFetchOptions = {}
  ) {
    const startSubscription = async () => {
      await this.ensureMigrated;
      let { query: subscriptionQuery } = await prepareQuery(
        this,
        query,
        options
      );

      const unsub = subscribeTriples<M, Q>(
        options.scope
          ? this.tripleStore.setStorageScope(options.scope)
          : this.tripleStore,
        subscriptionQuery,
        (tripMap) => onResults([...tripMap.values()].flat()),
        onError,
        (await this.getSchema())?.collections
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
      entity: UpdateTypeFromModel<ModelFromModels<M, CN>>
    ) => void | Promise<void>,
    options: TransactOptions = {}
  ) {
    await this.ensureMigrated;
    return await this.transact(async (tx) => {
      await tx.update(collectionName, entityId, updater);
    }, options);
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Query<M, CN>
  ) {
    return CollectionQueryBuilder(collectionName, params);
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

  async addRule(params: AddRuleOperation[1]) {
    await this.transact(async (tx) => {
      await tx.addRule(params);
    });
  }

  async dropRule(params: DropRuleOperation[1]) {
    await this.transact(async (tx) => {
      await tx.dropRule(params);
    });
  }

  private async applySchemaMigration(
    migration: Migration,
    direction: 'up' | 'down',
    scopes?: string[]
  ) {
    const operations = migration[direction];
    // Need to read from triple store manually because we block db.transaction() api and schema access
    const { schema } = await readSchemaFromTripleStore(this.tripleStore);
    await this.tripleStore.transact(
      async (tripTx) => {
        const tx = new DBTransaction(this, tripTx, copyHooks(this.hooks), {
          variables: this.variables,
          // @ts-expect-error storeSchema issue
          schema,
        });
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
            case 'add_rule':
              await tx.addRule(operation[1]);
              break;
            case 'drop_rule':
              await tx.dropRule(operation[1]);
              break;
            default:
              throw new InvalidMigrationOperationError(
                `The operation ${operation[0]} is not recognized.`
              );
          }
        }
        // Keeping for backwards compatability, but it doesnt really need to be in the schema
        await tripTx.insertTriples([
          {
            id: appendCollectionToId('_metadata', '_schema'),
            attribute: ['_metadata', 'version'],
            value: direction === 'up' ? migration.version : migration.parent,
            timestamp: await tripTx.clock.getNextTimestamp(),
            expired: false,
          },
        ]);
        if (direction === 'up') {
          // Add migration marker
          await tripTx.updateMetadataTuples([
            ['migrations', [`${migration.version}`, 'id'], migration.version],
            [
              'migrations',
              [`${migration.version}`, 'parent'],
              migration.parent,
            ],
            ['migrations', [`${migration.version}`, 'name'], migration.name],
            [
              'migrations',
              [`${migration.version}`, 'applied'],
              new Date().toISOString(),
            ],
          ]);
        } else if (direction === 'down') {
          // remove migration marker
          await tripTx.deleteMetadataTuples([
            ['migrations', [`${migration.version}`]],
          ]);
        }
      },
      scopes ? { read: scopes, write: scopes } : undefined
    );
  }

  async migrate(
    migrations: Migration[],
    direction: 'up' | 'down',
    scopes?: string[]
  ) {
    const sortedMigrations = migrations.sort(
      (a, b) => (a.version - b.version) * (direction === 'up' ? 1 : -1)
    );
    for (const migration of sortedMigrations) {
      const { schema: storedSchema } = await readSchemaFromTripleStore(
        this.tripleStore
      );

      const dbVersion = storedSchema?.version ?? 0;
      if (canMigrate(migration, direction, dbVersion)) {
        try {
          await this.applySchemaMigration(migration, direction, scopes);
        } catch (e) {
          console.error(
            `Error applying ${direction} migration with verison`,
            migration.version,
            e
          );
          throw e;
        }
      } else {
        console.info('skipping migration', migration);
      }
    }
  }

  async getAppliedMigrations() {
    const migrationTuples = await this.tripleStore.readMetadataTuples(
      'migrations'
    );
    const res = triplesToObject<{
      migrations?: Record<
        string,
        { applied: string; id: number; parent: number; name: string }
      >;
    }>(migrationTuples);
    return res.migrations || {};
  }

  async getLatestMigrationId() {
    const migrations = await this.getAppliedMigrations();
    const maxVersion = Object.values(migrations).reduce<number | undefined>(
      (max, m) => Math.max(max || 0, m.id),
      undefined
    );
    return maxVersion;
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

  onSchemaChange(cb: SchemaChangeCallback<M>) {
    this.onSchemaChangeCallbacks.add(cb);
    return () => this.onSchemaChangeCallbacks.delete(cb);
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

function Session<T extends DB<any>>(db: T, vars: Record<string, any>): T {
  return new Proxy<T>(db, {
    get(target, prop, receiver) {
      if (prop === 'variables') {
        return { ...db.variables, ...vars };
      }
      return Reflect.get(target, prop, receiver);
    },
    set: Reflect.set,
    deleteProperty: Reflect.deleteProperty,
  });
}
