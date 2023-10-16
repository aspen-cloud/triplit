import { EAV, TripleRow, TripleStore } from './triple-store';

import {
  ProxyTypeFromModel,
  Model,
  Models,
  InsertTypeFromModel,
  getSchemaFromPath,
} from './schema';
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
import { DBOptionsError, InvalidMigrationOperationError } from './errors';
import { Clock } from './clocks/clock';

import { DBTransaction } from './db-transaction';
import {
  appendCollectionToId,
  mapFilterStatements,
  readSchemaFromTripleStore,
  overrideStoredSchema,
  StoreSchema,
} from './db-helpers';
import { VariableAwareCache } from './variable-aware-cache';

import {
  AttributeDefinition,
  UserTypeOptions,
} from './data-types/serialization';
import { triplesToObject } from './utils';

export interface Rule<M extends Model> {
  filter: QueryWhere<M>;
  description?: string;
}

export interface CollectionRules<M extends Model> {
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
};

type StorageSource = AsyncTupleStorageApi;

interface DBConfig<M extends Models<any, any> | undefined> {
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

interface FetchOptions {
  scope?: string[];
  skipRules?: boolean;
}

const DEFAULT_STORE_KEY = 'default';
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
  cache: VariableAwareCache<Models<any, any>>;

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

    this.ensureMigrated = migrations
      ? (Array.isArray(migrations)
          ? this.migrate(migrations, 'up')
          : this.migrate(migrations.definitions, 'up', migrations.scopes)
        ).catch((e) => {
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

  async getSchema(): Promise<StoreSchema<M>> {
    await this.ensureMigrated;
    const { schema } = await readSchemaFromTripleStore(this.tripleStore);
    return schema as StoreSchema<M>;
  }

  async getSchemaTriples() {
    await this.ensureMigrated;
    const { schemaTriples } = await readSchemaFromTripleStore(this.tripleStore);
    return schemaTriples;
  }

  async getCollectionSchema<CN extends CollectionNameFromModels<M>>(
    collectionName: CN
  ): Promise<CollectionFromModels<M, CN> | undefined> {
    const collections = (await this.getSchema())?.collections;
    if (!collections || !collections[collectionName]) return undefined;
    // TODO: i think we need some stuff in the triple store...
    const collectionSchema = collections[collectionName];
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
        ...Object.values(collection.rules.read).flatMap((rule) => rule.filter),
      ];
      return { ...query, where: updatedWhere };
    }
    return query;
  }

  async transact(
    callback: (tx: DBTransaction<M>) => Promise<void>,
    options: TransactOptions = {}
  ) {
    await this.ensureMigrated;
    const schema = await this.getSchema();
    return await this.tripleStore.transact(async (tripTx) => {
      const tx = new DBTransaction<M>(tripTx, {
        variables: this.variables,
        schema,
        skipRules: options.skipRules,
      });
      try {
        await callback(tx);
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

  async fetch<Q extends CollectionQuery<ModelFromModels<M, any>>>(
    query: Q,
    { scope, skipRules = false }: FetchOptions = {}
  ) {
    await this.ensureMigrated;
    const { query: fetchQuery } = await this.prepareQuery(query, {
      scope,
      skipRules,
    });

    return await fetch(
      scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
      fetchQuery,
      {
        schema: (await this.getSchema())?.collections,
        includeTriples: false,
        cache: QUERY_CACHE_ENABLED ? this.cache : undefined,
      }
    );
  }

  async fetchTriples<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    { scope, skipRules = false }: FetchOptions = {}
  ) {
    await this.ensureMigrated;
    const { query: fetchQuery } = await this.prepareQuery(query, {
      scope,
      skipRules,
    });
    return [
      ...(
        await fetch(
          scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
          fetchQuery,
          {
            schema: (await this.getSchema())?.collections,
            includeTriples: true,
          }
        )
      ).triples.values(),
    ].flat();
  }

  private async prepareQuery<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    options: FetchOptions
  ) {
    await this.ensureMigrated;
    let fetchQuery = { ...query };
    const collectionSchema = await this.getCollectionSchema(
      fetchQuery.collectionName as CollectionNameFromModels<M>
    );
    if (collectionSchema && !options.skipRules) {
      fetchQuery = this.addReadRulesToQuery(fetchQuery, collectionSchema);
    }
    fetchQuery.vars = { ...this.variables, ...(fetchQuery.vars ?? {}) };
    fetchQuery.where = mapFilterStatements(
      fetchQuery.where,
      ([prop, op, val]) => [
        prop,
        op,
        val instanceof Date ? val.toISOString() : val,
      ]
    );
    if (collectionSchema) {
      fetchQuery.where = mapFilterStatements(
        fetchQuery.where,
        ([prop, op, val]) => {
          const attributeType = getSchemaFromPath(
            collectionSchema.attributes,
            prop.split('.')
          );
          if (attributeType.type !== 'query') {
            return [prop, op, val];
          }
          const [_collectionName, ...path] = prop.split('.');
          const subquery = { ...attributeType.query };
          subquery.where = [...subquery.where, [path.join('.'), op, val]];
          return {
            exists: subquery,
          };
        }
      );
    }
    return { query: fetchQuery, collection: collectionSchema };
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
    doc: InsertTypeFromModel<ModelFromModels<M, CN>>,
    id?: string,
    options: TransactOptions = {}
  ) {
    return this.transact(async (tx) => {
      await tx.insert(collectionName, doc, id);
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

  subscribe<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    onResults: (results: FetchResult<Q>) => void,
    onError?: (error: any) => void,
    { scope, skipRules = false }: { scope?: string[]; skipRules?: boolean } = {}
  ) {
    const startSubscription = async () => {
      let { query: subscriptionQuery } = await this.prepareQuery(query, {
        scope,
        skipRules,
      });

      const unsub = subscribe(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
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

  subscribeTriples<Q extends CollectionQuery<ModelFromModels<M>>>(
    query: Q,
    onResults: (results: TripleRow[]) => void,
    onError?: (error: any) => void,
    { scope, skipRules = false }: { scope?: string[]; skipRules?: boolean } = {}
  ) {
    const startSubscription = async () => {
      let { query: subscriptionQuery, collection } = await this.prepareQuery(
        query,
        {
          scope,
          skipRules,
        }
      );

      const unsub = subscribeTriples(
        scope ? this.tripleStore.setStorageScope(scope) : this.tripleStore,
        subscriptionQuery,
        (tripMap) => onResults([...tripMap.values()].flat()),
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
        const tx = new DBTransaction(tripTx, {
          variables: this.variables,
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
        { applied: string; id: number; parent: number }
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
