import { schemaEntityToSchemaObject } from './schema/schema.js';
import { schemaToJSON } from './schema/export/index.js';
import {
  UpdateTypeFromModel,
  Models,
  InsertTypeFromModel,
  StoreSchema,
  CollectionRules,
  Rule,
} from './schema/types/index.js';
import { AsyncTupleStorageApi, TupleStorageApi } from '@triplit/tuple-database';
import CollectionQueryBuilder, {
  fetch,
  initialFetchExecutionContext,
  subscribe,
  subscribeTriples,
  loadQuery,
  getTriplesAfterStateVector,
  fetchDeltaTriples,
  generateQueryRootPermutations,
  getEntitiesBeforeAndAfterNewTriples,
  isQueryRelational,
  applyTriplesToSubscribedQuery,
  FetchFromStorageOptions,
  fetchSyncTriplesRequeryArr,
  fetchSyncTriplesReplay,
} from './collection-query.js';
import { COLLECTION_ATTRIBUTE, Entity, updateEntity } from './entity.js';
import { MemoryBTreeStorage } from './storage/memory-btree.js';
import { DBOptionsError, TriplitError } from './errors.js';
import { Clock } from './clocks/clock.js';

import { DBTransaction } from './db-transaction.js';
import {
  appendCollectionToId,
  overrideStoredSchema,
  getSchemaTriples,
  fetchResultToJS,
  logSchemaChangeViolations,
  splitIdParts,
} from './db-helpers.js';
import { VariableAwareCache } from './variable-aware-cache.js';
import { copyDBHooks } from './utils.js';
import { EAV, indexToTriple, TripleRow } from './triple-store-utils.js';
import { ClearOptions, TripleStore } from './triple-store.js';
import { Logger } from '@triplit/types/logger';
import {
  Unalias,
  FetchResult,
  FetchResultEntity,
  CollectionQuery,
  SchemaQueries,
  ToQuery,
  CollectionQueryDefault,
  SubQueryFilter,
} from './query/types/index.js';
import { prepareQuery } from './query/prepare.js';
import {
  getRolesFromSession,
  normalizeSessionVars,
} from './schema/permissions.js';
import { diffSchemas } from './schema/diff.js';
import { genToArr } from './utils/generator.js';
import {
  AddAttributePayload,
  AddRulePayload,
  AlterAttributeOptionPayload,
  CreateCollectionPayload,
  DropAttributeOptionPayload,
  DropAttributePayload,
  DropCollectionPayload,
  DropRulePayload,
  SetAttributeOptionalPayload,
} from './db/types/operations.js';
import { generatePsuedoRandomId } from './utils/random.js';
import {
  getEntitiesFromContext,
  getResultTriplesFromContext,
  getSyncTriplesFromContext,
} from './query/result-parsers.js';
import {
  assignEntityCacheToStore,
  createEntityCache,
} from './db/entity-cache.js';
import { EntityCache, EntityCacheOptions } from './db/types/entity-cache.js';
import { hashQuery } from './index.js';
import { isSubQueryFilter } from './query.js';
import { getFilterPriorityOrder, satisfiesFilter } from './query/filters.js';

const DEFAULT_CACHE_DISABLED = true;
export interface TransactOptions {
  storeScope?: { read: string[]; write: string[] };
  skipRules?: boolean;
  dangerouslyBypassSchemaInitialization?: boolean;
  manualSchemaRefresh?: boolean;
}

type StorageSource = AsyncTupleStorageApi | TupleStorageApi;

export interface DBConfig<M extends Models = Models> {
  schema?: { collections: M; version?: number; roles?: Record<string, any> };
  source?: StorageSource;
  sources?: Record<string, StorageSource>;
  tenantId?: string;
  clock?: Clock;
  variables?: Record<string, any>;
  logger?: Logger;
  experimental?: {
    entityCache?: EntityCacheOptions;
  };
}

export const DEFAULT_STORE_KEY = 'default';

export type CollectionFromModels<
  M extends Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
> = M[CN];

export type ModelFromModels<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
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

interface TriplesFetchOptions extends DBFetchOptions {
  sync?: boolean;
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
  CN extends CollectionNameFromModels<M>,
> = Pick<CollectionQuery<M, CN>, 'include'>;

type SchemaChangeCallback<M extends Models> = (
  schema: StoreSchema<M> | undefined
) => void;

type TxOutput<Output> = {
  txId: string | undefined;
  output: Output | undefined;
};

const TRIGGER_WHEN = [
  'afterCommit',
  'afterDelete',
  'afterInsert',
  'afterUpdate',
  'beforeCommit',
  'beforeDelete',
  'beforeInsert',
  'beforeUpdate',
] as const;

type TriggerWhen = (typeof TRIGGER_WHEN)[number];
// TODO: type this better

export type EntityOpSet = OpSet<[string, { oldEntity: any; entity: any }]>;

export type OpSet<T> = {
  inserts: T[];
  updates: T[];
  deletes: T[];
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
  CN extends CollectionNameFromModels<M>,
> {
  when: 'afterInsert';
  collectionName: CN;
}
type AfterInsertCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface AfterUpdateOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> {
  when: 'afterUpdate';
  collectionName: CN;
}
type AfterUpdateCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = (args: {
  oldEntity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface AfterDeleteOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> {
  when: 'afterDelete';
  collectionName: CN;
}
type AfterDeleteCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = (args: {
  oldEntity: FetchResultEntity<M, CollectionQuery<M, CN>>;
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
  CN extends CollectionNameFromModels<M>,
> {
  when: 'beforeInsert';
  collectionName: CN;
}
type BeforeInsertCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = (args: {
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface BeforeUpdateOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> {
  when: 'beforeUpdate';
  collectionName: CN;
}
type BeforeUpdateCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = (args: {
  oldEntity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  entity: FetchResultEntity<M, CollectionQuery<M, CN>>;
  tx: DBTransaction<M>;
  db: DB<M>;
}) => void | Promise<void>;
interface BeforeDeleteOptions<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> {
  when: 'beforeDelete';
  collectionName: CN;
}
type BeforeDeleteCallback<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = (args: {
  oldEntity: FetchResultEntity<M, CollectionQuery<M, CN>>;
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

export type TriggerMap<
  C extends TriggerCallback,
  O extends TriggerOptions,
> = Map<string, [C, O]>;

export type DBHooks<M extends Models> = {
  afterCommit: TriggerMap<AfterCommitCallback<M>, AfterCommitOptions<M>>;
  afterInsert: TriggerMap<
    AfterInsertCallback<M, CollectionNameFromModels<M>>,
    AfterInsertOptions<M, CollectionNameFromModels<M>>
  >;
  afterUpdate: TriggerMap<
    AfterUpdateCallback<M, CollectionNameFromModels<M>>,
    AfterUpdateOptions<M, CollectionNameFromModels<M>>
  >;
  afterDelete: TriggerMap<
    AfterDeleteCallback<M, CollectionNameFromModels<M>>,
    AfterDeleteOptions<M, CollectionNameFromModels<M>>
  >;
  beforeCommit: TriggerMap<BeforeCommitCallback<M>, BeforeCommitOptions<M>>;
  beforeInsert: TriggerMap<
    BeforeInsertCallback<M, CollectionNameFromModels<M>>,
    BeforeInsertOptions<M, CollectionNameFromModels<M>>
  >;
  beforeUpdate: TriggerMap<
    BeforeUpdateCallback<M, CollectionNameFromModels<M>>,
    BeforeUpdateOptions<M, CollectionNameFromModels<M>>
  >;
  beforeDelete: TriggerMap<
    BeforeDeleteCallback<M, CollectionNameFromModels<M>>,
    BeforeDeleteOptions<M, CollectionNameFromModels<M>>
  >;
};

export type SystemVariables = {
  global: Record<string, any>;
  session: Record<string, any>;
};

export default class DB<M extends Models = Models> {
  tripleStore: TripleStore;
  systemVars: SystemVariables;
  cache: VariableAwareCache<M>;
  entityCache: EntityCache | undefined;

  // DB setup
  private storageReady: Promise<void>;
  private schemaInitialized: Promise<void>;
  private isSchemaInitialized: boolean = false;
  ready: Promise<void>;

  _schema?: Entity;
  schema?: StoreSchema<M>;
  private onSchemaChangeCallbacks: Set<SchemaChangeCallback<M>>;

  private hooks: DBHooks<M> = {
    afterCommit: new Map(),
    afterInsert: new Map(),
    afterUpdate: new Map(),
    afterDelete: new Map(),
    beforeCommit: new Map(),
    beforeInsert: new Map(),
    beforeUpdate: new Map(),
    beforeDelete: new Map(),
  };
  private _pendingSchemaRequest: Promise<void> | null;
  private syncQueries: Map<
    string,
    {
      connectionIds: Set<string>;
      options: FetchFromStorageOptions;
      query: CollectionQuery<any, any>;
      queryPermutations: CollectionQuery<any, any>[];
    } & (
      | { type: 'fetch-delta-triples' }
      | {
          type: 'ivm';
          results: Map<string, Entity>;
        }
    )
  > = new Map();
  private connectionCallbacks: Map<
    string,
    {
      onResults: (results: any, forQueries: string[]) => void;
      onError: (error: any) => void;
    }
  > = new Map();
  logger: Logger;
  public activeSubscriptions: Map<
    string,
    {
      query: CollectionQuery<M>;
      unsubscribe: () => Promise<void>;
      updateVariables: () => Promise<void>;
    }
  > = new Map();

  constructor({
    schema,
    source,
    sources,
    tenantId,
    clock,
    variables,
    logger,
    experimental,
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

    // If a schema is provided, assume using schema but no migrations (keep at version 0)
    // TODO: drop `version` from schema
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
    if (experimental?.entityCache) {
      this.entityCache = createEntityCache(experimental?.entityCache);
      assignEntityCacheToStore(this.tripleStore, this.entityCache);
    }

    // Add listener to update in memory schema
    const updateCachedSchemaOnChange: SchemaChangeCallback<M> = (schema) =>
      (this.schema = schema);
    this.onSchemaChangeCallbacks = new Set([updateCachedSchemaOnChange]);

    this.logger.debug('Initializing', {
      //@ts-expect-error
      schema: schema && schemaToJSON(schema),
      tripleStoreSchema: tripleStoreSchema && schemaToJSON(tripleStoreSchema),
    });

    this.storageReady = this.tripleStore
      .ensureStorageIsMigrated()
      .then(() => this.tripleStore.clock.clockReady);
    this.schemaInitialized = !!tripleStoreSchema
      ? this.storageReady
          // Setup schema subscription
          .then(() => {
            this.setupSchemaListener();
          })
          .then(() => this.initializeDBWithSchema(tripleStoreSchema))
      : this.storageReady.then(() => {
          this.setupSchemaListener();
        });

    this.schemaInitialized
      .then(() => (this.isSchemaInitialized = true))
      .catch(() => {});

    this.ready = Promise.all([this.storageReady, this.schemaInitialized]).then(
      () => this.logger.debug('Ready')
    );

    this.ready
      .catch(() => {})
      .then(() => {
        this.tripleStore.onWrite(async (storeWrites) => {
          if (this.syncQueries.size === 0) return;
          const newTriples = Object.values(storeWrites).flatMap(
            (ops) => ops.inserts
          );
          await this.updateSubscriptionsWithNewTriples(newTriples);
          // currently handle IVM queries separately
          for (const [queryId, syncQueryMetadata] of this.syncQueries) {
            if (syncQueryMetadata.type !== 'ivm') continue;
            const { results, connectionIds } = syncQueryMetadata;
            const update = await applyTriplesToSubscribedQuery(
              this.tripleStore,
              {
                schema: this.getSchemaSync(true)?.collections,
                session: {
                  systemVars: this.systemVars,
                  roles: this.sessionRoles,
                },
              },
              results,
              storeWrites,
              syncQueryMetadata.query
            );
            syncQueryMetadata.results = update.results;
            const deltaTriples = Array.from(
              update.deltaTriples.values()
            ).flat();
            if (deltaTriples.length > 0) {
              for (const connectionId of connectionIds) {
                const connection = this.connectionCallbacks.get(connectionId);
                if (!connection) continue;
                connection.onResults(deltaTriples, [queryId]);
              }
            }
          }
        });
      });
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
        const newSchema = schemaEntityToSchemaObject(
          this._schema!.data
        ) as StoreSchema<M>;

        // Call any listeners
        for (const cb of this.onSchemaChangeCallbacks) {
          cb(newSchema);
        }
      }
    );
  }

  addTrigger(
    on: AfterCommitOptions<M>,
    callback: AfterCommitCallback<M>
  ): string;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: AfterInsertOptions<M, CN>,
    callback: AfterInsertCallback<M, CN>
  ): string;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: AfterUpdateOptions<M, CN>,
    callback: AfterUpdateCallback<M, CN>
  ): string;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: AfterDeleteOptions<M, CN>,
    callback: AfterDeleteCallback<M, CN>
  ): string;
  addTrigger(
    on: BeforeCommitOptions<M>,
    callback: BeforeCommitCallback<M>
  ): string;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: BeforeInsertOptions<M, CN>,
    callback: BeforeInsertCallback<M, CN>
  ): string;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: BeforeUpdateOptions<M, CN>,
    callback: BeforeUpdateCallback<M, CN>
  ): string;
  addTrigger<CN extends CollectionNameFromModels<M>>(
    on: BeforeDeleteOptions<M, CN>,
    callback: BeforeDeleteCallback<M, CN>
  ): string;
  addTrigger(on: TriggerOptions, callback: TriggerCallback): string {
    if (!TRIGGER_WHEN.includes(on.when)) {
      throw new Error(`Invalid trigger when: ${on.when}`);
    }
    const id = generatePsuedoRandomId();
    // @ts-expect-error
    this.hooks[on.when].set(id, [callback, on]);
    return id;
  }

  removeTrigger(id: string): boolean {
    for (const when of TRIGGER_WHEN) {
      if (this.hooks[when].delete(id)) {
        return true;
      }
    }
    return false;
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
    this._schema = new Entity(triples);
    // Schema should remain undefined if no triples
    if (triples.length) {
      this.schema = schemaEntityToSchemaObject(
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
        const tx = new DBTransaction<M>(this, tripTx, copyDBHooks(this.hooks), {
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
    this.activeSubscriptions.forEach((sub) => sub.updateVariables());
    this.systemVars.global = { ...this.systemVars.global, ...variables };
  }

  async overrideSchema(schema: StoreSchema<M> | undefined) {
    const { successful, issues } = await overrideStoredSchema(this, schema);
    logSchemaChangeViolations(successful, issues, this.logger);
    return { successful, issues };
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

    const executionContext = initialFetchExecutionContext();
    const results = await fetch<M, Q>(
      options.scope
        ? this.tripleStore.setStorageScope(options.scope)
        : this.tripleStore,
      fetchQuery,
      executionContext,
      {
        schema,
        cache: noCache ? undefined : this.cache,
        entityCache: this.entityCache,
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
    options: TriplesFetchOptions = {}
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
    const executionContext = initialFetchExecutionContext();
    const entityOrder = await loadQuery<M, Q>(
      options.scope
        ? this.tripleStore.setStorageScope(options.scope)
        : this.tripleStore,
      fetchQuery,
      executionContext,
      {
        schema: schema,
        stateVector: options.stateVector,
        skipRules: options.skipRules,
        session: {
          systemVars: this.systemVars,
          roles: this.sessionRoles,
        },
      }
    );

    if (options.sync) {
      return Array.from(
        getSyncTriplesFromContext<M, Q>(
          fetchQuery,
          entityOrder,
          executionContext
        ).values()
      ).flat();
    }
    return Array.from(
      getResultTriplesFromContext<M, Q>(
        fetchQuery,
        entityOrder,
        executionContext
      ).values()
    ).flat();
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
      const subscriptionQuery = prepareQuery(
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
      const subscription = subscribe<M, Q>(
        options.scope
          ? this.tripleStore.setStorageScope(options.scope)
          : this.tripleStore,
        subscriptionQuery,
        {
          schema,
          cache: noCache ? undefined : this.cache,
          entityCache: this.entityCache,
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
      return subscription;
    };

    const subscriptionPromise = startSubscription().catch(onError);

    // @ts-expect-error
    const queryId = query.traceId ?? generatePsuedoRandomId();
    this.activeSubscriptions.set(queryId, {
      query,
      unsubscribe: async () => {
        // Immediately set unsubscribed to true to prevent any new results from being processed
        unsubscribed = true;
        this.logger.debug('subscribe END', { query });
        const subscription = await subscriptionPromise;
        this.activeSubscriptions.delete(queryId);
        return subscription && subscription.unsubscribe();
      },
      updateVariables: async () => {
        const subscription = await subscriptionPromise;
        return subscription && (await subscription.updateVars(this.systemVars));
      },
    });

    // Maybe return an object like { unsubscribe: () => void, updateVariables: () => void } but for now
    // keep API backwards compatible
    return async () => {
      return this.activeSubscriptions.get(queryId)?.unsubscribe();
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
          entityCache: this.entityCache,
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

  async createCollection(params: CreateCollectionPayload) {
    await this.transact(async (tx) => {
      await tx.createCollection(params);
    });
  }

  async dropCollection(params: DropCollectionPayload) {
    await this.transact(async (tx) => {
      await tx.dropCollection(params);
    });
  }

  async addAttribute(params: AddAttributePayload) {
    await this.transact(async (tx) => {
      await tx.addAttribute(params);
    });
  }

  async dropAttribute(params: DropAttributePayload) {
    await this.transact(async (tx) => {
      await tx.dropAttribute(params);
    });
  }

  async alterAttributeOption(params: AlterAttributeOptionPayload) {
    await this.transact(async (tx) => {
      await tx.alterAttributeOption(params);
    });
  }

  async dropAttributeOption(params: DropAttributeOptionPayload) {
    await this.transact(async (tx) => {
      await tx.dropAttributeOption(params);
    });
  }

  async addRule(params: AddRulePayload) {
    await this.transact(async (tx) => {
      await tx.addRule(params);
    });
  }

  async dropRule(params: DropRulePayload) {
    await this.transact(async (tx) => {
      await tx.dropRule(params);
    });
  }

  async setAttributeOptional(params: SetAttributeOptionalPayload) {
    await this.transact(async (tx) => {
      await tx.setAttributeOptional(params);
    });
  }

  async getCollectionStats(): Promise<Map<string, number>> {
    // Each entity has a hidden _collection attribute which the value
    // is just the name of the collection it belongs to
    // e.g. { id: '123', name: 'alice', _collection: 'users'}
    const collectionMetaTriples = await genToArr(
      this.tripleStore.findByAttribute(COLLECTION_ATTRIBUTE)
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

  createQuerySyncer(
    connectionId: string,
    onResults: (results: TripleRow[], forQueries: string[]) => void,
    onError: (error: any, queryId?: string) => void
  ) {
    this.connectionCallbacks.set(connectionId, { onResults, onError });

    const registerQuery = async (
      query: CollectionQuery<M>,
      options: DBFetchOptions = {}
    ) => {
      await this.storageReady;
      const schema = (await this.getSchema())?.collections as M;
      const subscriptionQuery = prepareQuery(
        query,
        schema,
        // systemVars (specifically session) is used by legacy rule system
        { roles: this.sessionRoles, ...this.systemVars },
        {
          skipRules: options.skipRules,
          bindSessionVariables: true,
        }
      );
      const noCache =
        options.noCache === undefined
          ? DEFAULT_CACHE_DISABLED
          : options.noCache;
      const subscribeTriplesOptions = {
        schema,
        skipRules: options.skipRules,
        stateVector: options.stateVector,
        cache: noCache ? undefined : this.cache,
        entityCache: this.entityCache,
        skipIndex: options.skipIndex,
        session: {
          systemVars: this.systemVars,
          roles: this.sessionRoles,
        },
      };

      const queryId = hashQuery(subscriptionQuery as any);
      if (this.syncQueries.has(queryId)) {
        const syncQuery = this.syncQueries.get(queryId)!;
        syncQuery.connectionIds.add(connectionId);
      } else {
        const queryPermutations =
          generateQueryRootPermutations(subscriptionQuery);
        const shouldUseIVM =
          query.limit != undefined &&
          !isQueryRelational(query, {
            schema: schema,
          });
        this.syncQueries.set(queryId, {
          connectionIds: new Set([connectionId]),
          options: subscribeTriplesOptions,
          query: subscriptionQuery,
          queryPermutations,
          ...(shouldUseIVM
            ? {
                results: new Map(),
                type: 'ivm',
              }
            : {
                type: 'fetch-delta-triples',
              }),
        });
      }
      (async () => {
        // Make initial fetch
        let triples: TripleRow[] = [];
        try {
          if (options.stateVector && options.stateVector.size > 0) {
            const deltaTriples = await fetchSyncTriplesRequeryArr<
              M,
              typeof subscriptionQuery
            >(
              this.tripleStore,
              subscriptionQuery,
              initialFetchExecutionContext(),
              subscribeTriplesOptions
            );
            triples = deltaTriples;
          } else {
            const executionContext = initialFetchExecutionContext();
            // const resultOrder = await loadQuery<M, Q>(
            const resultOrder = await loadQuery<M, any>(
              this.tripleStore,
              subscriptionQuery,
              executionContext,
              {
                schema: subscribeTriplesOptions.schema,
                // stateVector: subscribeTriplesOptions.stateVector,
                cache: subscribeTriplesOptions.cache,
                entityCache: subscribeTriplesOptions.entityCache,
                session: subscribeTriplesOptions.session,
              }
            );
            triples = Array.from(
              // getSyncTriplesFromContext<M, Q>(
              getSyncTriplesFromContext<M, any>(
                subscriptionQuery,
                resultOrder,
                executionContext
              ).values()
            ).flat();

            if (this.syncQueries.get(queryId)?.type === 'ivm') {
              // @ts-expect-error
              this.syncQueries.get(queryId)!.results = getEntitiesFromContext(
                resultOrder,
                executionContext
              );
            }
          }
        } catch (e) {
          console.error(e);
          onError && (await onError(e, queryId));
        }
        onResults(triples, [queryId]);
      })();
      return queryId;
    };

    const unregisterQuery = async (id: string) => {
      await this.storageReady;

      const queryId = id;
      if (this.syncQueries.has(queryId)) {
        const syncQuery = this.syncQueries.get(queryId)!;
        syncQuery.connectionIds.delete(connectionId);
        if (syncQuery.connectionIds.size === 0) {
          this.syncQueries.delete(queryId);
        }
      }
    };

    const close = () => {
      for (const [queryId, syncQuery] of this.syncQueries.entries()) {
        syncQuery.connectionIds.delete(connectionId);
        if (syncQuery.connectionIds.size === 0) {
          this.syncQueries.delete(queryId);
        }
      }
      this.connectionCallbacks.delete(connectionId);
    };

    return {
      registerQuery,
      unregisterQuery,
      close,
    };
  }

  private async updateSubscriptionsWithNewTriples(newTriples: TripleRow[]) {
    const schema = (await this.getSchema())?.collections;
    const tx = this.tripleStore;
    try {
      const deltaTriplesPerConnection: Map<
        string,
        { triples: TripleRow[]; forQueries: Set<string> }
      > = new Map();
      const beforeAndAfterEntities = await getEntitiesBeforeAndAfterNewTriples(
        tx,
        newTriples
      );
      const beforeContext = initialFetchExecutionContext();
      const afterContext = initialFetchExecutionContext();
      for (const [
        changedEntityId,
        { oldEntity: beforeData, entity: afterData, changedTriples },
      ] of beforeAndAfterEntities) {
        const entityBeforeStateVector = beforeData;
        if (beforeData) {
          beforeContext.executionCache.setEntity(changedEntityId, {
            entity: beforeData,
            tripleHistory: [...beforeData.triples],
          });
          beforeContext.executionCache.setComponent(changedEntityId, {
            entityId: changedEntityId,
            relationships: {},
          });
        }
        const entityAfterStateVector = afterData;
        if (afterData) {
          afterContext.executionCache.setEntity(changedEntityId, {
            entity: afterData,
            tripleHistory: [...afterData.triples],
          });
          afterContext.executionCache.setComponent(changedEntityId, {
            entityId: changedEntityId,
            relationships: {},
          });
        }
        for (const [
          id,
          { query, connectionIds, queryPermutations, type, options },
        ] of this.syncQueries) {
          if (type !== 'fetch-delta-triples') continue;
          for (const queryPermutation of queryPermutations) {
            if (
              queryPermutation.collectionName !==
              splitIdParts(changedEntityId)[0]
            ) {
              continue;
            }

            // Check that entity matches filters:
            // Start with the checking that the entity exists, assume it matches the query
            // Then check for unsatisfied filters
            let matchesBefore =
              !!entityBeforeStateVector && !entityBeforeStateVector.isDeleted;
            let matchesAfter =
              !!entityAfterStateVector && !entityAfterStateVector.isDeleted;
            if (queryPermutation.where) {
              const where = queryPermutation.where;
              const filterPriorityOrder = getFilterPriorityOrder(
                queryPermutation.where
              );
              if (matchesBefore) {
                for (const filterIdx of filterPriorityOrder) {
                  const filter = where[filterIdx];
                  const satisfied = await satisfiesFilter(
                    tx,
                    queryPermutation,
                    beforeContext,
                    options,
                    [changedEntityId, entityBeforeStateVector!],
                    filter
                  );
                  if (!satisfied) {
                    matchesBefore = false;
                    break;
                  }
                }
              }

              if (matchesAfter) {
                for (const filterIdx of filterPriorityOrder) {
                  const filter = where[filterIdx];
                  const satisfied = await satisfiesFilter(
                    tx,
                    queryPermutation,
                    afterContext,
                    options,
                    [changedEntityId, entityAfterStateVector!],
                    filter
                  );
                  if (!satisfied) {
                    matchesAfter = false;
                    break;
                  }
                }
              }
            }

            if (!matchesBefore && !matchesAfter) {
              continue;
            }

            if (!matchesBefore) {
              const afterTriplesMatch = [];
              for (const fulfillmentEntityId of afterContext.fulfillmentEntities) {
                const entity =
                  afterContext.executionCache.getData(
                    fulfillmentEntityId
                  )?.entity;
                if (!entity) continue;
                for (const triple of entity.triples) {
                  afterTriplesMatch.push(triple);
                }
              }
              // Basically we're including the whole entity if it is new to the result set
              // but we also want to filter any triples that will be included in the
              // final step of adding changed triples for the given entity
              // An example is if we insert a net new entity it will not match before
              // so it need's the whole entity to be sent but that will fully overlap
              // with the last step.
              const alreadyIncludedTriples = changedTriples;
              const tripleKeys = new Set(
                alreadyIncludedTriples.map(
                  (t) =>
                    t.id +
                    JSON.stringify(t.attribute) +
                    JSON.stringify(t.timestamp)
                )
              );
              const trips = Object.values(afterData!.triples).filter(
                (t) =>
                  !tripleKeys.has(
                    t.id +
                      JSON.stringify(t.attribute) +
                      JSON.stringify(t.timestamp)
                  )
              );
              for (const triple of trips) {
                afterTriplesMatch.push(triple);
              }
              for (const triple of afterTriplesMatch) {
                for (const connectionId of connectionIds) {
                  if (!deltaTriplesPerConnection.has(connectionId)) {
                    deltaTriplesPerConnection.set(connectionId, {
                      triples: [],
                      forQueries: new Set(),
                    });
                  }
                  const connectionResults =
                    deltaTriplesPerConnection.get(connectionId)!;
                  connectionResults.triples.push(triple);
                  connectionResults.forQueries.add(id);
                }
              }
            }
            for (const triple of changedTriples) {
              for (const connectionId of connectionIds) {
                if (!deltaTriplesPerConnection.has(connectionId)) {
                  deltaTriplesPerConnection.set(connectionId, {
                    triples: [],
                    forQueries: new Set(),
                  });
                }
                const connectionResults =
                  deltaTriplesPerConnection.get(connectionId)!;
                connectionResults.triples.push(triple);
                connectionResults.forQueries.add(id);
              }
            }
          }
        }
      }
      for (const [
        connectionId,
        { triples, forQueries },
      ] of deltaTriplesPerConnection) {
        const connection = this.connectionCallbacks.get(connectionId);
        if (!(connection && triples.length)) continue;
        connection.onResults(triples, [...forQueries]);
      }
    } catch (error) {
      console.error(error);
      // onError && (await onError(error));
    }
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
