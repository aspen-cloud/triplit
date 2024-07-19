import { timestampedSchemaToSchema } from './schema/schema.js';
import { schemaToJSON } from './schema/export/index.js';
import {
  UpdateTypeFromModel,
  Models,
  InsertTypeFromModel,
  StoreSchema,
  AttributeDefinition,
} from './schema/types/index.js';
import { AsyncTupleStorageApi, TupleStorageApi } from '@triplit/tuple-database';
import CollectionQueryBuilder, {
  fetch,
  initialFetchExecutionContext,
  subscribe,
  subscribeTriples,
} from './collection-query.js';
import { Entity, constructEntity, updateEntity } from './query.js';
import { MemoryBTreeStorage } from './storage/memory-btree.js';
import {
  DBOptionsError,
  InvalidMigrationOperationError,
  TriplitError,
} from './errors.js';
import { Clock } from './clocks/clock.js';

import { DBTransaction } from './db-transaction.js';
import {
  appendCollectionToId,
  readSchemaFromTripleStore,
  overrideStoredSchema,
  getSchemaTriples,
  fetchResultToJS,
  logSchemaChangeViolations,
} from './db-helpers.js';
import { VariableAwareCache } from './variable-aware-cache.js';
import { UserTypeOptions } from './data-types/types/index.js';
import { copyHooks, prefixVariables, triplesToObject } from './utils.js';
import { EAV, indexToTriple, TripleRow } from './triple-store-utils.js';
import { ClearOptions, TripleStore } from './triple-store.js';
import { Logger } from '@triplit/types/logger';
import { isAnyOrUndefined } from './utility-types.js';
import {
  Unalias,
  FetchResult,
  FetchResultEntity,
  CollectionQuery,
  QueryWhere,
  SchemaQueries,
  ToQuery,
  CollectionQueryDefault,
} from './query/types/index.js';
import { prepareQuery } from './query/prepare.js';
import {
  getRolesFromSession,
  normalizeSessionVars,
} from './schema/permissions.js';
import { diffSchemas } from './schema/diff.js';
import { genToArr } from './utils/generator.js';

const DEFAULT_CACHE_DISABLED = true;

export interface Rule<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  filter: QueryWhere<M, CN>;
  description?: string;
}

export interface CollectionRules<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  read?: Record<string, Rule<M, CN>>;
  write?: Record<string, Rule<M, CN>>;
  // insert?: Rule<M>[];
  // update?: Rule<M>[];
}

export interface TransactOptions {
  storeScope?: { read: string[]; write: string[] };
  skipRules?: boolean;
  dangerouslyBypassSchemaInitialization?: boolean;
  manualSchemaRefresh?: boolean;
}

export type CreateCollectionOperation = [
  'create_collection',
  {
    name: string;
    schema: { [path: string]: AttributeDefinition };
    rules?: CollectionRules<any, any>;
    optional?: string[];
  }
];
export type DropCollectionOperation = ['drop_collection', { name: string }];
export type AddAttributeOperation = [
  'add_attribute',
  {
    collection: string;
    path: string[];
    attribute: AttributeDefinition;
    optional?: boolean;
  }
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
  { collection: string; scope: string; id: string; rule: Rule<any, any> }
];
export type DropRuleOperation = [
  'drop_rule',
  { collection: string; scope: string; id: string }
];
export type SetAttributeOptionalOperation = [
  'set_attribute_optional',
  { collection: string; path: string[]; optional: boolean }
];

type DBOperation =
  | CreateCollectionOperation
  | DropCollectionOperation
  | AddAttributeOperation
  | DropAttributeOperation
  | AlterAttributeOptionOperation
  | DropAttributeOptionOperation
  | AddRuleOperation
  | DropRuleOperation
  | SetAttributeOptionalOperation;

export type Migration = {
  up: DBOperation[];
  down: DBOperation[];
  version: number;
  parent: number;
  name: string;
};

type StorageSource = AsyncTupleStorageApi | TupleStorageApi;

export interface DBConfig<M extends Models = Models> {
  schema?: { collections: M; version?: number; roles?: Record<string, any> };
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
  logger?: Logger;
}

export const DEFAULT_STORE_KEY = 'default';

export type CollectionFromModels<
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>
> = M[CN];

export type ModelFromModels<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = M[CN]['schema'];

export type CollectionNameFromModels<M extends Models = Models> = keyof M &
  string;

export interface DBFetchOptions {
  skipRules?: boolean;
  scope?: string[];
  stateVector?: Map<string, number>;
  noCache?: boolean;
  skipIndex?: boolean;
}

export function ruleToTuple(
  collectionName: string,
  ruleType: keyof CollectionRules<any, any>,
  index: number,
  rule: Rule<any, any>
) {
  return Object.entries(rule).map<EAV>(([key, value]) => [
    '_schema',
    ['collections', collectionName, 'rules', ruleType, index, key],
    value,
  ]);
}

export type FetchByIdQueryParams<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = Pick<CollectionQuery<M, CN>, 'include'>;

type SchemaChangeCallback<M extends Models> = (
  schema: StoreSchema<M> | undefined
) => void;

type TxOutput<Output> = {
  txId: string | undefined;
  output: Output | undefined;
};

type TriggerWhen =
  | 'afterCommit'
  | 'afterDelete'
  | 'afterInsert'
  | 'afterUpdate'
  | 'beforeCommit'
  | 'beforeDelete'
  | 'beforeInsert'
  | 'beforeUpdate';

// TODO: type this better
export type EntityOpSet = OpSet<any>;

export type OpSet<T> = {
  inserts: [string, T][];
  updates: [string, T][];
  deletes: [string, T][];
};

interface AfterCommitOptions<M extends Models> {
  when: 'afterCommit';
}
type AfterCommitCallback<M extends Models> = (args: {
  opSet: EntityOpSet;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface AfterInsertOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  when: 'afterInsert';
  collectionName: CN;
}
type AfterInsertCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface AfterUpdateOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  when: 'afterUpdate';
  collectionName: CN;
}
type AfterUpdateCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface AfterDeleteOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  when: 'afterDelete';
  collectionName: CN;
}
type AfterDeleteCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface BeforeCommitOptions<M extends Models> {
  when: 'beforeCommit';
}
type BeforeCommitCallback<M extends Models> = (args: {
  opSet: EntityOpSet;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface BeforeInsertOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  when: 'beforeInsert';
  collectionName: CN;
}
type BeforeInsertCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface BeforeUpdateOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  when: 'beforeUpdate';
  collectionName: CN;
}
type BeforeUpdateCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface BeforeDeleteOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> {
  when: 'beforeDelete';
  collectionName: CN;
}
type BeforeDeleteCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;

type TriggerOptions =
  | AfterCommitOptions<any>
  | AfterInsertOptions<any, any>
  | AfterUpdateOptions<any, any>
  | AfterDeleteOptions<any, any>
  | BeforeCommitOptions<any>
  | BeforeInsertOptions<any, any>
  | BeforeUpdateOptions<any, any>
  | BeforeDeleteOptions<any, any>;

type TriggerCallback =
  | AfterCommitCallback<any>
  | AfterInsertCallback<any, any>
  | AfterUpdateCallback<any, any>
  | AfterDeleteCallback<any, any>
  | BeforeCommitCallback<any>
  | BeforeInsertCallback<any, any>
  | BeforeUpdateCallback<any, any>
  | BeforeDeleteCallback<any, any>;

export type DBHooks<M extends Models> = {
  afterCommit: [AfterCommitCallback<M>, AfterCommitOptions<M>][];
  afterInsert: [
    AfterInsertCallback<M, CollectionNameFromModels<M>>,
    AfterInsertOptions<M, CollectionNameFromModels<M>>
  ][];
  afterUpdate: [
    AfterInsertCallback<M, CollectionNameFromModels<M>>,
    AfterUpdateOptions<M, CollectionNameFromModels<M>>
  ][];
  afterDelete: [
    AfterDeleteCallback<M, CollectionNameFromModels<M>>,
    AfterDeleteOptions<M, CollectionNameFromModels<M>>
  ][];
  beforeCommit: [BeforeCommitCallback<M>, BeforeCommitOptions<M>][];
  beforeInsert: [
    BeforeInsertCallback<M, CollectionNameFromModels<M>>,
    BeforeInsertOptions<M, CollectionNameFromModels<M>>
  ][];
  beforeUpdate: [
    BeforeUpdateCallback<M, CollectionNameFromModels<M>>,
    BeforeUpdateOptions<M, CollectionNameFromModels<M>>
  ][];
  beforeDelete: [
    BeforeDeleteCallback<M, CollectionNameFromModels<M>>,
    BeforeDeleteOptions<M, CollectionNameFromModels<M>>
  ][];
};

export type SystemVariables = {
  global: Record<string, any>;
  session: Record<string, any>;
};

export default class DB<M extends Models = Models> {
  tripleStore: TripleStore;
  systemVars: SystemVariables;
  cache: VariableAwareCache<M>;

  // DB setup
  private storageReady: Promise<void>;
  private schemaInitialized: Promise<void>;
  private isSchemaInitialized: boolean = false;
  ready: Promise<void>;

  _schema?: Entity; // Timestamped Object
  schema?: StoreSchema<M>;
  private onSchemaChangeCallbacks: Set<SchemaChangeCallback<M>>;

  private hooks: DBHooks<M> = {
    afterCommit: [],
    afterInsert: [],
    afterUpdate: [],
    afterDelete: [],
    beforeCommit: [],
    beforeInsert: [],
    beforeUpdate: [],
    beforeDelete: [],
  };
  private _pendingSchemaRequest: Promise<void> | null;
  logger: Logger;

  constructor({
    schema,
    source,
    sources,
    tenantId,
    migrations,
    clock,
    variables,
    logger,
  }: DBConfig<M> = {}) {
    this.logger = logger ?? {
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: () => {},
      scope: () => this.logger,
    };
    this.systemVars = {
      global: variables ?? {},
      session: {},
    };
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
      ? {
          ...schema,
          version: (schema.version ?? 0) as number,
          collections: schema.collections,
        }
      : undefined;

    this._pendingSchemaRequest = null;
    this.tripleStore = new TripleStore({
      storage: sourcesMap,
      tenantId,
      clock,
    });
    this.tripleStore.onClear(() => {
      this.schema = undefined;
      this._schema = undefined;
    });

    this.cache = new VariableAwareCache(this);

    // Add listener to update in memory schema
    const updateCachedSchemaOnChange: SchemaChangeCallback<M> = (schema) =>
      (this.schema = schema);
    this.onSchemaChangeCallbacks = new Set([updateCachedSchemaOnChange]);

    this.logger.debug('Initializing', {
      //@ts-expect-error
      schema: schema && schemaToJSON(schema),
      tripleStoreSchema: tripleStoreSchema && schemaToJSON(tripleStoreSchema),
    });

    this.storageReady = this.tripleStore.ensureStorageIsMigrated();
    this.schemaInitialized = !!tripleStoreSchema
      ? this.storageReady
          // Setup schema subscription
          .then(() => {
            this.setupSchemaListener();
          })
          .then(() => this.initializeDBWithSchema(tripleStoreSchema))
      : !!migrations
      ? this.storageReady
          // TODO: look into why test fails if we setup listener first for migrations
          .then(() => this.initializeDBWithMigrations(migrations))
          .then(() => {
            this.setupSchemaListener();
          })
      : this.storageReady.then(() => {
          this.setupSchemaListener();
        });

    this.schemaInitialized
      .then(() => (this.isSchemaInitialized = true))
      .catch(() => {});

    this.ready = Promise.all([this.storageReady, this.schemaInitialized]).then(
      () => this.logger.debug('Ready')
    );
  }

  get sessionRoles() {
    const schema = this.getSchemaSync(true);
    return getRolesFromSession(schema, this.systemVars.session);
  }

  private getSchemaSync(dangerouslyBypassSchemaInitialization = false) {
    if (!dangerouslyBypassSchemaInitialization && !this.isSchemaInitialized)
      throw new TriplitError('Schema not initialized');
    return this.schema;
  }

  private initializeDBWithMigrations(
    migrations:
      | Migration[]
      | {
          definitions: Migration[];
          scopes?: string[] | undefined;
        }
      | undefined
  ): Promise<void> {
    return migrations
      ? Array.isArray(migrations)
        ? this.migrate(migrations, 'up')
        : this.migrate(migrations.definitions, 'up', migrations.scopes)
      : Promise.resolve();
  }

  private async initializeDBWithSchema(schema: StoreSchema<M> | undefined) {
    if (!schema) return;
    const existingSchema = await this.getSchema(true);
    // exit of exiting schema matches provided schema
    if (existingSchema && diffSchemas(existingSchema, schema).length === 0)
      return;
    await this.overrideSchema(schema);
  }

  /**
   * Sets up a subscription to changes to the schema in the triple store
   */
  private setupSchemaListener() {
    return this.tripleStore.tupleStore.subscribe(
      { prefix: ['EAT', appendCollectionToId('_metadata', '_schema')] },
      async (storeWrites) => {
        // If there are deletes clear cached data and update if there are sets
        // NOTE: IF WE ADD GARBAGE COLLECTION ENSURE THIS IS STILL CORRECT
        if (Object.values(storeWrites).some((w) => !!w.remove?.length)) {
          this.schema = undefined;
          this._schema = undefined;
        }

        // This assumes we are properly using tombstoning, so only looking at set operations
        const schemaTriples = Object.values(storeWrites).flatMap(
          (w) => w.set?.map((s) => indexToTriple(s)) ?? []
        );
        if (!schemaTriples.length) return;

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
  }

  addTrigger(on: AfterCommitOptions<M>, callback: AfterCommitCallback<M>): void;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: AfterInsertOptions<M, CN>,
    callback: AfterInsertCallback<M, CN>
  ): void;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: AfterUpdateOptions<M, CN>,
    callback: AfterUpdateCallback<M, CN>
  ): void;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: AfterDeleteOptions<M, CN>,
    callback: AfterDeleteCallback<M, CN>
  ): void;
  addTrigger(
    on: BeforeCommitOptions<M>,
    callback: BeforeCommitCallback<M>
  ): void;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: BeforeInsertOptions<M, CN>,
    callback: BeforeInsertCallback<M, CN>
  ): void;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: BeforeUpdateOptions<M, CN>,
    callback: BeforeUpdateCallback<M, CN>
  ): void;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: BeforeDeleteOptions<M, CN>,
    callback: BeforeDeleteCallback<M, CN>
  ): void;
  addTrigger(on: TriggerOptions, callback: TriggerCallback) {
    switch (on.when) {
      case 'afterCommit':
        this.hooks.afterCommit.push([callback as AfterCommitCallback<M>, on]);
        break;
      case 'afterInsert':
        this.hooks.afterInsert.push([
          callback as AfterInsertCallback<M, CollectionNameFromModels<M>>,
          on,
        ]);
        break;
      case 'afterUpdate':
        this.hooks.afterUpdate.push([
          callback as AfterUpdateCallback<M, CollectionNameFromModels<M>>,
          on,
        ]);
        break;
      case 'afterDelete':
        this.hooks.afterDelete.push([
          callback as AfterDeleteCallback<M, CollectionNameFromModels<M>>,
          on,
        ]);
        break;
      case 'beforeCommit':
        this.hooks.beforeCommit.push([callback as BeforeCommitCallback<M>, on]);
        break;
      case 'beforeInsert':
        this.hooks.beforeInsert.push([
          callback as BeforeInsertCallback<M, CollectionNameFromModels<M>>,
          on,
        ]);
        break;
      case 'beforeUpdate':
        this.hooks.beforeUpdate.push([
          callback as BeforeUpdateCallback<M, CollectionNameFromModels<M>>,
          on,
        ]);
        break;
      case 'beforeDelete':
        this.hooks.beforeDelete.push([
          callback as BeforeDeleteCallback<M, CollectionNameFromModels<M>>,
          on,
        ]);
        break;
    }
  }

  withSessionVars(variables: Record<string, any>): DB<M> {
    return Session(this, normalizeSessionVars(variables));
  }

  async getClientId() {
    const ts = await this.tripleStore.clock.getCurrentTimestamp();
    return ts[1];
  }

  private async loadSchemaData() {
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

  async getSchema(
    dangerouslyBypassSchemaInitialization = false
  ): Promise<StoreSchema<M> | undefined> {
    // If we are bypassing schema initialization, we don't need to wait for the schema to be initialized
    // This will result in the "old" schema being loaded
    await (dangerouslyBypassSchemaInitialization
      ? this.storageReady
      : this.schemaInitialized);

    if (this._pendingSchemaRequest) await this._pendingSchemaRequest;
    if (!this._schema) {
      this._pendingSchemaRequest = this.loadSchemaData();
      await this._pendingSchemaRequest;
      this._pendingSchemaRequest = null;
    }
    return this.schema;
  }

  static ABORT_TRANSACTION = Symbol('abort transaction');

  async transact<Output>(
    callback: (tx: DBTransaction<M>) => Promise<Output>,
    options: TransactOptions = {}
  ) {
    this.logger.debug('transact START', { options });
    await this.storageReady;
    const schema = await this.getSchema(
      options.dangerouslyBypassSchemaInitialization
    );
    try {
      const resp = await this.tripleStore.transact(async (tripTx) => {
        const tx = new DBTransaction<M>(this, tripTx, copyHooks(this.hooks), {
          schema,
          skipRules: options.skipRules,
          logger: this.logger.scope('tx'),
          manualSchemaRefresh: options.manualSchemaRefresh,
        });
        return await callback(tx);
      }, options.storeScope);
      this.logger.debug('transact RESULT', resp);
      return resp;
    } catch (e) {
      this.logger.error('transact ERROR', e);
      throw e;
    } finally {
      this.logger.debug('transact END');
    }
  }

  updateGlobalVariables(variables: Record<string, any>) {
    this.systemVars.global = { ...this.systemVars.global, ...variables };
  }

  async overrideSchema(schema: StoreSchema<M> | undefined) {
    const { successful, issues } = await overrideStoredSchema(this, schema);
    logSchemaChangeViolations(successful, issues, this.logger);
    return { successful, issues };
  }

  async echoQuery<Q extends SchemaQueries<M>>(query: Q) {
    return query;
  }

  async fetch<Q extends SchemaQueries<M>>(
    query: Q,
    options: DBFetchOptions = {}
  ): Promise<Unalias<FetchResult<M, ToQuery<M, Q>>>> {
    this.logger.debug('fetch START', { query });
    await this.storageReady;
    const schema = (await this.getSchema())?.collections as M;
    const fetchQuery = prepareQuery(
      query,
      schema,
      { roles: this.sessionRoles },
      {
        skipRules: options.skipRules,
      }
    );

    const noCache =
      options.noCache === undefined ? DEFAULT_CACHE_DISABLED : options.noCache;

    const { results } = await fetch<M, Q>(
      options.scope
        ? this.tripleStore.setStorageScope(options.scope)
        : this.tripleStore,
      fetchQuery,
      initialFetchExecutionContext(),
      {
        schema,
        cache: noCache ? undefined : this.cache,
        skipRules: options.skipRules,
        skipIndex: options.skipIndex,
        session: {
          systemVars: this.systemVars,
          roles: this.sessionRoles,
        },
      }
    );
    this.logger.debug('fetch END', { query, result: results });
    return fetchResultToJS(
      results,
      schema,
      fetchQuery.collectionName
    ) as Unalias<FetchResult<M, ToQuery<M, Q>>>;
  }

  async fetchTriples<Q extends SchemaQueries<M>>(
    query: Q,
    options: DBFetchOptions = {}
  ) {
    await this.storageReady;
    const schema = (await this.getSchema())?.collections as M;
    const fetchQuery = prepareQuery(
      query,
      schema,
      { roles: this.sessionRoles },
      {
        skipRules: options.skipRules,
      }
    );
    return [
      ...(
        await fetch<M, Q>(
          options.scope
            ? this.tripleStore.setStorageScope(options.scope)
            : this.tripleStore,
          fetchQuery,
          initialFetchExecutionContext(),
          {
            schema: schema,
            stateVector: options.stateVector,
            skipRules: options.skipRules,
            session: {
              systemVars: this.systemVars,
              roles: this.sessionRoles,
            },
          }
        )
      ).triples,
    ];
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
    const entity = [...result][0];
    if (!entity) return null;
    return entity;
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    doc: Unalias<InsertTypeFromModel<ModelFromModels<M, CN>>>,
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

  subscribe<Q extends SchemaQueries<M>>(
    query: Q,
    onResults: (
      results: Unalias<FetchResult<M, ToQuery<M, Q>>>
    ) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options: DBFetchOptions = {}
  ) {
    let unsubscribed = false;
    const startSubscription = async () => {
      await this.storageReady;
      const schema = (await this.getSchema())?.collections as M;
      let subscriptionQuery = prepareQuery(
        query,
        schema,
        { roles: this.sessionRoles },
        {
          skipRules: options.skipRules,
        }
      );
      this.logger.debug('subscribe START', { query });
      const noCache =
        options.noCache === undefined
          ? DEFAULT_CACHE_DISABLED
          : options.noCache;
      const unsub = subscribe<M, Q>(
        options.scope
          ? this.tripleStore.setStorageScope(options.scope)
          : this.tripleStore,
        subscriptionQuery,
        {
          schema,
          cache: noCache ? undefined : this.cache,
          skipRules: options.skipRules,
          stateVector: options.stateVector,
          skipIndex: options.skipIndex,
          session: {
            systemVars: this.systemVars,
            roles: this.sessionRoles,
          },
        },
        (...args) => {
          if (unsubscribed) return;
          this.logger.debug('subscribe RESULTS', { query, results: args });
          onResults(
            ...(args as [results: Unalias<FetchResult<M, ToQuery<M, Q>>>])
          );
        },
        (...args) => {
          if (unsubscribed) return;
          onError?.(...args);
        }
      );
      return unsub;
    };

    const unsubPromise = startSubscription().catch(onError);

    return async () => {
      // Immediately set unsubscribed to true to prevent any new results from being processed
      unsubscribed = true;
      this.logger.debug('subscribe END', { query });
      const unsub = await unsubPromise;
      return unsub?.();
    };
  }

  subscribeTriples<Q extends CollectionQuery<M, any>>(
    query: Q,
    onResults: (results: TripleRow[]) => void | Promise<void>,
    onError?: (error: any) => void | Promise<void>,
    options: DBFetchOptions = {}
  ) {
    const startSubscription = async () => {
      await this.storageReady;
      const schema = (await this.getSchema())?.collections as M;
      let subscriptionQuery = prepareQuery(
        query,
        schema,
        { roles: this.sessionRoles },
        {
          skipRules: options.skipRules,
        }
      );
      const noCache =
        options.noCache === undefined
          ? DEFAULT_CACHE_DISABLED
          : options.noCache;

      const unsub = subscribeTriples<M, Q>(
        options.scope
          ? this.tripleStore.setStorageScope(options.scope)
          : this.tripleStore,
        subscriptionQuery,
        {
          schema,
          skipRules: options.skipRules,
          stateVector: options.stateVector,
          cache: noCache ? undefined : this.cache,
          skipIndex: options.skipIndex,
          session: {
            systemVars: this.systemVars,
            roles: this.sessionRoles,
          },
        },
        onResults,
        onError
      );
      return unsub;
    };

    const unsubPromise = startSubscription().catch(onError);

    return async () => {
      const unsub = await unsubPromise;
      return unsub?.();
    };
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    entityId: string,
    updater: (
      entity: Unalias<UpdateTypeFromModel<ModelFromModels<M, CN>>>
    ) => void | Promise<void>,
    options: TransactOptions = {}
  ) {
    return await this.transact(async (tx) => {
      await tx.update(collectionName, entityId, updater);
    }, options);
  }

  query<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    params?: Omit<CollectionQuery<M, CN>, 'collectionName'>
  ) {
    return CollectionQueryBuilder<M, CN>(collectionName, params);
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

  async setAttributeOptional(params: SetAttributeOptionalOperation[1]) {
    await this.transact(async (tx) => {
      await tx.setAttributeOptional(params);
    });
  }

  private async applySchemaMigration(
    migration: Migration,
    direction: 'up' | 'down',
    scopes?: string[]
  ) {
    const operations = migration[direction];
    // Need to read from triple store manually because we block db.transaction() api and schema access
    const { schema } = await readSchemaFromTripleStore<M>(this.tripleStore);
    await this.tripleStore.transact(
      async (tripTx) => {
        const tx = new DBTransaction(this, tripTx, copyHooks(this.hooks), {
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
            case 'set_attribute_optional':
              await tx.setAttributeOptional(operation[1]);
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

  async getCollectionStats(): Promise<Map<string, number>> {
    // Each entity has a hidden _collection attribute which the value
    // is just the name of the collection it belongs to
    // e.g. { id: '123', name: 'alice', _collection: 'users'}
    const collectionMetaTriples = await genToArr(
      this.tripleStore.findByAttribute(['_collection'])
    );

    const stats = new Map();
    for (let trip of collectionMetaTriples) {
      // TODO handle expired indexes e.g. where there are multiple _collection triples
      // for the same entity
      if (trip.expired) continue; // Skip expired/deleted entities
      const collectionName = trip.value as string;
      stats.set(collectionName, (stats.get(collectionName) ?? 0) + 1);
    }

    return stats;
  }

  async clear(options: ClearOptions = {}) {
    return this.tripleStore.clear(options);
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
  const sessionVars = { global: db.systemVars.global, session: vars };
  return new Proxy<T>(db, {
    get(target, prop, receiver) {
      if (prop === 'systemVars') {
        return sessionVars;
      }
      return Reflect.get(target, prop, receiver);
    },
    set: Reflect.set,
    deleteProperty: Reflect.deleteProperty,
  });
}
