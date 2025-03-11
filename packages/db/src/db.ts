import { DBSerializationError, WritePermissionError } from './errors.js';
import { EntityStoreKV } from './entity-store.js';
import {
  DBChanges,
  Triple,
  EntityId,
  CollectionName,
  KVStore,
  EntitySyncStore,
  KVStoreOrTransaction,
  Change,
  Timestamp,
} from './types.js';
import { HybridLogicalClock } from './hybrid-clock.js';
import { EntityStoreQueryEngine, ViewEntity } from './query-engine.js';
import { BTreeKVStore } from './kv-store/storage/memory-btree.js';
import {
  createQueryWithExistsAddedToIncludes,
  createQueryWithRelationalOrderAddedToIncludes,
  IVM,
  queryResultsToChanges,
} from './ivm.js';
import { DBTransaction } from './db-transaction.js';
import {
  getSchemaDiffIssues,
  logSchemaChangeViolations,
  diffSchemas,
} from './schema/diff-issues.js';
import { prepareQuery } from './prepare-query.js';
import { createSession, DBSession, normalizeSessionVars } from './session.js';
import {
  getTypeConvertersFromSchema,
  TypeConverters,
} from './schema/converters.js';
import { isEmpty } from './memory-write-buffer.js';
import { isSubQueryFilter, satisfiesNonRelationalFilter } from './filters.js';
import { ValuePointer } from './utils/value-pointer.js';
import { logger as LOGGER, Logger } from '@triplit/logger';
import { Type } from './schema/data-types/type.js';
import { getCollectionPermissions } from './permissions.js';
import {
  CollectionNameFromModels,
  Models,
  PermissionWriteOperations,
  PossibleDataViolation,
  Roles,
  SchemaChange,
} from './schema/index.js';
import {
  CollectionQuery,
  FetchResult,
  QueryResultCardinality,
  SchemaQuery,
} from './query.js';
import { QueryBuilder } from './query-builder.js';
import {
  ClearOptions,
  DBOptions,
  EntityWriteOptions,
  FetchOptions,
  OnCommitCallback,
  SchemaChangeListener,
  SubscriptionResultsCallback,
  TransactCallback,
  TransactOptions,
  UpdatePayload,
  WriteModel,
} from './types/db.js';
import { validateSchema } from './schema/validation.js';

export type DBSchema<M extends Models<M> = Models> = {
  collections: M;
  roles?: Roles;
};

export class DB<
  M extends Models<M> = Models,
  E extends EntitySyncStore = EntitySyncStore,
> {
  entityStore: E;
  clock: HybridLogicalClock;
  session: DBSession | undefined;
  globalVars: Record<string, any>;
  logger: Logger;
  subscribedQueries: Map<
    string,
    {
      query: CollectionQuery;
      resultsListeners: Set<SubscriptionResultsCallback>;
      lastResult?: any[];
    }
  > = new Map();
  readonly clientId: string;
  ivm: IVM;
  schema: DBSchema<M> | undefined = undefined;
  onCommitListeners: Set<OnCommitCallback> = new Set();
  readonly kv: KVStore;
  private typeConverters?: TypeConverters;

  constructor(options: DBOptions<M, E> = {}) {
    this.logger = LOGGER;
    this.globalVars = options.variables ?? {};

    this.kv = options.kv ?? new BTreeKVStore();
    // @ts-expect-error - check how this works with new generic pattern
    this.entityStore = options.entityStore ?? new EntityStoreKV();
    this.clientId = options.clientId || 'test-client';

    // TODO: initialize from storage if necessary
    this.clock = new HybridLogicalClock({
      clientId: this.clientId,
    });
    this.ivm =
      options.ivm ??
      new IVM(
        // @ts-expect-error - TODO: handle more generalized internal typings
        this,
        options.ivmOptions ?? {
          shouldTrackChanges: true,
        }
      );

    this.schema = options.schema;
    this.typeConverters = getTypeConvertersFromSchema(
      this.schema as DBSchema | undefined
    );
  }

  static async getSchemaFromStorage(
    kv: KVStore
  ): Promise<DBSchema | undefined> {
    const entityStore = new EntityStoreKV();
    const schema = await entityStore.getEntity(kv, '_metadata', '_schema');
    if (isEmpty(schema)) return undefined;
    // Making a copy, just in case for memory store
    const cpy = { ...schema };
    // Drop storage id
    delete cpy.id;
    return cpy as any;
  }

  getSchema() {
    return this.schema;
  }

  subscribe<Q extends SchemaQuery<M>>(
    query: Q,
    onResults: SubscriptionResultsCallback<M, Q>,
    onError?: (error: Error) => void,
    // TODO: will we need this?
    options: FetchOptions = {}
  ): () => void {
    const preparedQuery = prepareQuery(
      query,
      this.schema?.collections,
      this.systemVars,
      this.session,
      {
        applyPermission: options.skipRules ? undefined : 'read',
      }
    );
    const callback = ({ results }: any) => {
      onResults(
        applyProjectionsAndConversions(
          results,
          preparedQuery,
          'many',
          this.typeConverters
        )
      );
    };
    return this.ivm.subscribe(preparedQuery, callback, onError);
  }

  subscribeWithChanges<Q extends SchemaQuery<M>>(
    query: Q,
    onResults: (args: {
      results: FetchResult<M, Q, 'many'>;
      changes: DBChanges;
    }) => void,
    onError?: (error: Error) => void,
    options: FetchOptions = {}
  ): () => void {
    const preparedQuery = prepareQuery(
      query,
      this.schema?.collections,
      this.systemVars,
      this.session,
      {
        applyPermission: options.skipRules ? undefined : 'read',
      }
    );
    const callback = ({ results, changes }: any) => {
      onResults({
        results: applyProjectionsAndConversions(
          results,
          preparedQuery,
          'many',
          this.typeConverters
        ),
        changes,
      });
    };
    return this.ivm.subscribe(preparedQuery, callback, onError);
  }

  subscribeChanges<Q extends SchemaQuery<M>>(
    query: Q,
    onResults: (results: DBChanges, queryId?: string) => void | Promise<void>,
    options: FetchOptions & {
      queryState?: {
        timestamp: Timestamp;
        entityIds: Record<string, string[]>;
      };
    } & {
      // TODO we should maybe rely on prepareQuery creating a stableId or something
      // along those lines rather than passing this in
      queryKey?: string;
      errorCallback?: (error: Error) => void;
    } = {}
  ): () => void {
    const preparedQuery = prepareQuery(
      query,
      this.schema?.collections,
      this.systemVars,
      this.session,
      {
        applyPermission: options.skipRules ? undefined : 'read',
      }
    );
    let isInitialResponse = true;
    const callback = async ({ changes }: { changes: DBChanges }) => {
      let relevantChanges = changes;
      if (options.queryState && isInitialResponse) {
        // step 1: iterate through the client's query state and identify
        // a) which entities are still in the new result set and are unchanged
        // b) which entities are no longer in the result set and we
        //    need to send updates for
        const entitiesThatHaveNotChanged: Record<string, Set<string>> = {};
        const entitiesThatAreNoLongerInTheResultSet: Record<
          string,
          Set<string>
        > = {};

        for (const [collection, entityIds] of Object.entries(
          options.queryState.entityIds
        )) {
          for (const entityId of entityIds) {
            if (!entityIsInChangeset(changes, collection, entityId)) {
              if (!entitiesThatAreNoLongerInTheResultSet[collection]) {
                entitiesThatAreNoLongerInTheResultSet[collection] = new Set();
              }
              entitiesThatAreNoLongerInTheResultSet[collection].add(entityId);
              // out of the results and in the results but unchanged
              // are mutually exclusive categories so we can skip
              // timestamp checking
              continue;
            }
            const timestamp =
              await this.entityStore.metadataStore.getTimestampForEntity(
                this.kv,
                collection,
                entityId
              );
            if (
              // TODO: determine if timestamp can ever be undefined
              // I think the only case could be if the entity was optimistically inserted
              // on the client but never synced to the server
              // assuming that we don't delete metadata when we delete entities
              timestamp &&
              HybridLogicalClock.compare(
                timestamp,
                options.queryState.timestamp
              ) < 0
            ) {
              if (!entitiesThatHaveNotChanged[collection]) {
                entitiesThatHaveNotChanged[collection] = new Set();
              }
              entitiesThatHaveNotChanged[collection].add(entityId);
            }
          }
        }

        // step 2: filter out unchanged entities from the new changeset
        relevantChanges = {};
        for (const collection in changes) {
          relevantChanges[collection] = {
            sets: new Map(),
            deletes: changes[collection].deletes,
          };
          for (const [id, patch] of changes[collection].sets) {
            if (entitiesThatHaveNotChanged[collection]?.has(id)) {
              continue;
            }
            relevantChanges[collection].sets.set(id, patch);
          }
        }

        // step 3: for any entities that are no longer in the result set,
        // get any updates or deletes and add them to the changeset
        for (const [collectionName, entityIds] of Object.entries(
          entitiesThatAreNoLongerInTheResultSet
        )) {
          const stillMissingEntityIds = new Set(entityIds);
          if (!relevantChanges[collectionName]) {
            relevantChanges[collectionName] = {
              sets: new Map(),
              deletes: new Set(),
            };
          }
          const addedChanges = await this.fetchChanges({
            collectionName: collectionName as CollectionNameFromModels<M>,
            where: [
              // @ts-expect-error collection too broad
              ['id', 'in', Array.from(entityIds)],
            ],
          });
          for (const [id, addedChange] of addedChanges[collectionName].sets) {
            stillMissingEntityIds.delete(id);
            relevantChanges[collectionName].sets.set(id, addedChange);
          }
          for (const entityId of stillMissingEntityIds) {
            relevantChanges[collectionName].deletes.add(entityId);
          }
        }
      }
      onResults(relevantChanges, options.queryKey);
      isInitialResponse = false;
    };
    return this.ivm.subscribe(preparedQuery, callback, options.errorCallback);
  }

  async fetch<Q extends SchemaQuery<M>>(
    query: Q,
    options?: FetchOptions
  ): Promise<FetchResult<M, Q, 'many'>> {
    const preparedQuery = prepareQuery(
      query,
      this.schema?.collections,
      this.systemVars,
      this.session,
      {
        applyPermission: options?.skipRules ? undefined : 'read',
      }
    );

    const queryEngine = new EntityStoreQueryEngine(
      this.kv,
      this.entityStore,
      this.schema as DBSchema | undefined
    );
    let results = await queryEngine.fetch(preparedQuery);

    results = applyProjectionsAndConversions(
      results,
      preparedQuery,
      'many',
      this.typeConverters
    );
    return results;
  }

  async rawFetch(query: CollectionQuery) {
    const queryEngine = new EntityStoreQueryEngine(
      this.kv,
      this.entityStore,
      this.schema as DBSchema | undefined
    );
    return queryEngine.fetch(query);
  }

  applyProjectionsAndConversions(
    results: ViewEntity[] | ViewEntity,
    query: CollectionQuery,
    cardinality: QueryResultCardinality
  ): any[] | any {
    const dataConverter = this.typeConverters?.get(query.collectionName);

    const convertEntity = (entityData: ViewEntity['data']) => {
      return dataConverter?.fromDB(entityData) ?? entityData;
    };

    const projectEntity = (entity: ViewEntity['data']) => {
      if (!query.select) return entity;
      const projectedEntity: any = {};
      for (const key of query.select) {
        const path = key.split('.');
        ValuePointer.Set(projectedEntity, path, ValuePointer.Get(entity, path));
      }
      return projectedEntity;
    };

    const projectAndConvertEntity = (entity) => {
      const convertedData = convertEntity(projectEntity(entity.data));
      const convertedInclusions =
        query.include &&
        Object.entries(query.include).reduce((acc, [key, { subquery }]) => {
          if (entity.subqueries[key]) {
            acc[key] = this.applyProjectionsAndConversions(
              entity.subqueries[key],
              subquery,
              subquery.cardinality
            );
          }
          return acc;
        }, {});
      return {
        ...convertedData,
        ...convertedInclusions,
      };
    };

    return cardinality === 'one'
      ? [projectAndConvertEntity(results)]
      : (results as ViewEntity[]).map(projectAndConvertEntity);
  }

  async fetchChanges(query: CollectionQuery<M>, options?: FetchOptions) {
    const preparedQuery = prepareQuery(
      query,
      this.schema?.collections,
      this.systemVars,
      this.session,
      {
        applyPermission: options?.skipRules ? undefined : 'read',
      }
    );
    const queryToGetChanges = createQueryWithRelationalOrderAddedToIncludes(
      createQueryWithExistsAddedToIncludes(preparedQuery)
    );
    const results = await this.rawFetch(queryToGetChanges);
    const changes = queryResultsToChanges(results, queryToGetChanges);
    return changes;
  }

  async fetchOne<Q extends SchemaQuery<M>>(
    query: Q,
    options?: FetchOptions
  ): Promise<FetchResult<M, Q, 'one'>> {
    query = { ...query, limit: 1 };
    const result = await this.fetch(query, options);
    const entity = result[0];
    if (!entity) return null;
    return entity;
  }

  async fetchById<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    options?: FetchOptions
  ): Promise<FetchResult<M, { collectionName: CN }, 'one'>> {
    const query = this.query(collectionName).Id(id);
    return this.fetchOne<{ collectionName: CN }>(query, options);
  }

  async insert<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    data: WriteModel<M, CN>,
    options?: EntityWriteOptions
  ) {
    // TODO: for insert, update, delete, can we do this without creating garbage
    // for the changes map and array?
    // e.g. more semantic API for the entityStore
    // OR
    // a singular "applyChange" method that takes (collection, id, change)
    return this.transact(
      async (tx) => {
        return await tx.insert(collectionName, data);
      },
      {
        skipRules: options?.skipRules ?? false,
      }
    );
  }

  async update<CN extends CollectionNameFromModels<M>>(
    collectionName: CN,
    id: string,
    data: UpdatePayload<M, CN>,
    options?: EntityWriteOptions
  ) {
    return this.transact(
      async (tx) => {
        await tx.update(collectionName, id, data);
      },
      {
        skipRules: options?.skipRules ?? false,
      }
    );
  }

  async delete(
    collectionName: string,
    id: string,
    options?: EntityWriteOptions
  ) {
    return this.transact(
      async (tx) => {
        await tx.delete(collectionName, id);
      },
      {
        skipRules: options?.skipRules ?? false,
      }
    );
  }

  onCommit(callback: OnCommitCallback) {
    this.onCommitListeners.add(callback);
    return () => {
      this.onCommitListeners.delete(callback);
    };
  }

  updateQueryViews() {
    return this.ivm.updateViews();
  }

  broadcastToQuerySubscribers() {
    return this.ivm.flushChangesToListeners();
  }

  async transact<Output>(
    callback: TransactCallback<M, Output>,
    options?: TransactOptions
  ): Promise<Output> {
    let changes: DBChanges;
    let output: Output;
    const kvTx = this.kv.transact();
    try {
      const dbTx = new DBTransaction({
        schema: this.schema,
        kvTx,
        entityStore: this.entityStore,
        systemVars: this.systemVars,
        session: this.session,
        typeConverters: this.typeConverters,
        skipRules: !!options?.skipRules,
      });
      // Accumulate changes
      output = await callback(dbTx);
      // Apply the changes to the store
      changes = await this.entityStore.applyChanges(kvTx, dbTx.changes, {
        checkWritePermission: options?.skipRules
          ? undefined
          : this.checkWritePermission.bind(this),
        entityChangeValidator: this.validateEntityChange.bind(this),
      });
      // Commit changes
      await kvTx.commit();
    } catch (error) {
      // Cancel the storage tx to be safe
      kvTx.cancel();
      throw error;
    }
    // Call on change listeners
    // TODO call the listeners in the entity store

    // Trigger subscription updates
    await this.ivm.bufferChanges(changes);
    for (const listener of this.onCommitListeners) {
      listener(changes);
    }
    return output;
  }

  async applyChanges(changes: DBChanges, options: EntityWriteOptions) {
    const kvTx = this.kv.transact();
    const appliedChanges = await this.entityStore.applyChanges(kvTx, changes, {
      checkWritePermission: options?.skipRules
        ? undefined
        : this.checkWritePermission.bind(this),
      entityChangeValidator: this.validateEntityChange.bind(this),
    });
    await kvTx.commit();

    await this.ivm.bufferChanges(appliedChanges);
  }

  async applyChangesWithTimestamp(
    changes: DBChanges,
    timestamp: Timestamp,
    options: EntityWriteOptions
  ) {
    const kvTx = this.kv.transact();
    const appliedChanges = await this.entityStore.applyChangesWithTimestamp(
      kvTx,
      changes,
      timestamp,
      {
        checkWritePermission: options?.skipRules
          ? undefined
          : this.checkWritePermission.bind(this),
        entityChangeValidator: this.validateEntityChange.bind(this),
      }
    );
    await kvTx.commit();
    await this.ivm.bufferChanges(appliedChanges);
  }

  async getCollectionStats(): Promise<Map<string, number>> {
    return this.entityStore.getCollectionStats(
      this.kv,
      this.schema ? Object.keys(this.schema.collections) : undefined
    );
  }

  async overrideSchema(
    newSchema: DBSchema,
    options?: { failOnBackwardsIncompatibleChange?: boolean }
  ): Promise<SchemaChange> {
    const change = await this._overrideSchema(newSchema, options);
    for (const listener of this.schemaChangeListeners) {
      await listener(change);
    }
    return change;
  }

  private async _overrideSchema(
    newSchema: DBSchema,
    { failOnBackwardsIncompatibleChange = false } = {}
  ): Promise<SchemaChange> {
    let currentSchema: any = this.schema;

    // Check new schema validity
    const invalid = validateSchema(newSchema);
    if (invalid) {
      return {
        successful: false,
        invalid,
        issues: [],
        diff: [],
        oldSchema: currentSchema,
        newSchema,
      };
    }

    if (!currentSchema) {
      await this.updateSchema(newSchema);
      return {
        successful: true,
        invalid: undefined,
        issues: [],
        diff: [],
        oldSchema: currentSchema,
        newSchema,
      };
    }

    let issues: PossibleDataViolation[] = [];

    const diff = diffSchemas(currentSchema, newSchema);
    // If no differences, return early
    if (diff.length === 0)
      return {
        successful: true,
        invalid: undefined,
        issues,
        diff,
        oldSchema: currentSchema,
        newSchema,
      };

    issues = await getSchemaDiffIssues(this.fetch.bind(this), diff);

    // TODO if `failOnBackwardsIncompatibleChange` is true, we should skip
    // data checks for faster performance
    if (failOnBackwardsIncompatibleChange && issues.length > 0) {
      return {
        successful: false,
        invalid: undefined,
        issues,
        diff,
        oldSchema: currentSchema,
        newSchema,
      };
    }
    if (issues.length > 0 && issues.some((issue) => issue.violatesExistingData))
      return {
        successful: false,
        invalid: undefined,
        issues,
        diff,
        oldSchema: currentSchema,
        newSchema,
      };

    diff.length > 0 &&
      this.logger.info(`applying ${diff.length} changes to schema`);

    await this.updateSchema(newSchema);

    return {
      successful: true,
      invalid: undefined,
      issues,
      diff,
      oldSchema: currentSchema,
      newSchema,
    };
  }

  async setMetadata(key: string[], value: any) {
    const scopedStorage = this.kv.scope(['_metadata']);
    const kvTx = this.kv.transact();
    await scopedStorage.set(key, value);
    await kvTx.commit();
  }

  async getMetadata<T = any>(key: string[]): Promise<T | undefined> {
    const scopedStorage = this.kv.scope(['_metadata']);
    return await scopedStorage.get(key);
  }

  /**
   * Runs a transaction on the kv store that updates the schema
   * This WILL NOT perform any validation or compatibility checks, so ensure the update is valid beforehand
   */
  private async updateSchema(schema: DBSchema) {
    const storageTx = this.kv.transact();
    /**
     * NOTE: this applies the schema directly to the data store
     * No metadata checking
     * No outbox
     *
     * TODO: evaluate syncing needs
     */
    await this.entityStore.dataStore.applyChanges(
      storageTx,
      {
        _metadata: {
          sets: new Map([['_schema', { id: '_schema', ...schema } as any]]),
          deletes: new Set(),
        },
      },
      {
        checkWritePermission: undefined,
        entityChangeValidator: undefined,
      }
    );
    await storageTx.commit();
    // @ts-expect-error - This is actually okay, we are updating the schema and the type may not match the instance
    this.schema = schema;
    this.typeConverters = getTypeConvertersFromSchema(
      this.schema as DBSchema | undefined
    );
  }

  /**
   * WARNING: (I think) using `this` in the constructor will not pick up the proxy information created here
   * Example: new IVM(this) // db.session will be undefined
   */
  withSessionVars(variables: Record<string, any>): DB<M, E> {
    return createSession(this, normalizeSessionVars(variables));
  }

  schemaChangeListeners: SchemaChangeListener[] = [];
  onSchemaChange(callback: SchemaChangeListener) {
    this.schemaChangeListeners.push(callback);
    return () => {
      this.schemaChangeListeners = this.schemaChangeListeners.filter(
        (listener) => listener !== callback
      );
    };
  }

  query<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    return new QueryBuilder<M, CN>(collectionName);
  }

  Query<CN extends CollectionNameFromModels<M>>(collectionName: CN) {
    return this.query(collectionName);
  }

  async clear(options?: ClearOptions) {
    await Promise.all([this.kv.clear(), this.ivm.clear()]);
    if (options?.full) {
      this.schema = undefined;
      return;
    }
    this.schema &&
      (await this.updateSchema(this.schema as unknown as DBSchema));
  }

  updateGlobalVariables(vars: Record<string, any>) {
    this.globalVars = vars;
  }

  get systemVars() {
    return {
      $global: this.globalVars,
      $session: this.session?.vars ?? {},
    };
  }

  private validateEntityChange(
    collection: string,
    change: Change,
    { ignoreRequiredProperties = false }
  ) {
    const schema = this.schema?.collections;
    if (!schema) return;
    const collectionSchema =
      schema[collection as CollectionNameFromModels<M>].schema;
    if (!collectionSchema) return;
    const validation = Type.validateEncoded(collectionSchema, change, {
      partial: ignoreRequiredProperties,
    });
    if (!validation.valid) {
      throw new DBSerializationError(
        `record`,
        JSON.stringify(change),
        validation.error
      );
    }
  }

  // NOTE: we run this many times when writing, we can probably precalculate the filters / save them for re-use ({ [collection+operation]: filters})
  private async checkWritePermission(
    storage: KVStoreOrTransaction,
    collection: string,
    entity: any,
    operation: PermissionWriteOperations
  ) {
    const permissions = getCollectionPermissions(
      this.schema?.collections as Models | undefined,
      collection
    );
    // If no permissions for collection, its exempt from rules
    if (!permissions) return;

    // Prepare filters for fetch
    const preparedQuery = prepareQuery(
      {
        collectionName: collection,
      },
      this.schema?.collections as Models | undefined,
      this.systemVars,
      this.session,
      {
        applyPermission: operation,
      }
    );
    const preparedPermissions = preparedQuery.where;

    // We expect access denial filter to be present if should deny access
    // Otherwise the permission may be optional and we can skip the check
    if (!preparedPermissions || preparedPermissions.length === 0) return;

    // Run a pseudo-fetch, checking if the entity satisfies the permissions filters
    const queryEngine = new EntityStoreQueryEngine(
      storage,
      this.entityStore,
      this.schema as DBSchema | undefined
    );
    let isSatisfied = true;
    for (const filter of preparedPermissions) {
      if (isSubQueryFilter(filter)) {
        const result = await queryEngine.executeRelationalQuery(filter.exists, {
          entityStack: [entity],
        });
        if (result.length === 0) {
          isSatisfied = false;
          break;
        }
      } else {
        if (
          !satisfiesNonRelationalFilter(collection, entity, filter, this.schema)
        ) {
          isSatisfied = false;
          break;
        }
      }
    }
    if (!isSatisfied) {
      throw new WritePermissionError(
        collection,
        entity.id,
        operation,
        this.session?.roles ?? []
      );
    }
  }
}

type Timer = ReturnType<typeof setTimeout>;
function throttle(fn: () => void, ms: number) {
  let last = 0;
  let timeout: Timer | null = null;

  return () => {
    const now = Date.now();
    const remaining = ms - (now - last);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      fn();
      last = now;
    } else if (!timeout) {
      timeout = setTimeout(() => {
        fn();
        last = Date.now();
        timeout = null;
      }, remaining);
    }
  };
}

export function changesToTriples(
  changes: DBChanges,
  timestamp: Timestamp
): Triple[] {
  let triples: Triple[] = [];
  for (const [collectionName, collectionChanges] of Object.entries(changes)) {
    for (const [entityId, change] of collectionChanges.sets) {
      triples = triples.concat(
        recursivelyGetTriplesFromObj(
          change,
          entityId,
          collectionName,
          [],
          timestamp
        )
      );
    }
  }
  return triples;
}

function recursivelyGetTriplesFromObj(
  obj: any,
  id: EntityId,
  collection: CollectionName,
  attribute: string[],
  timestamp: Timestamp
): Triple[] {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [{ id, attribute, collection, value: obj, timestamp }];
  }
  const triples: Triple[] = [];
  for (const [key, value] of Object.entries(obj)) {
    triples.push(
      ...recursivelyGetTriplesFromObj(
        value,
        id,
        collection,
        [...attribute, key],
        timestamp
      )
    );
  }
  return triples;
}

export async function createDB<M extends Models<M> = Models>(
  options: DBOptions<M>
) {
  let savedSchema = undefined;
  if (options.kv) {
    savedSchema = await DB.getSchemaFromStorage(options.kv);
  }
  const db = new DB({ ...options, schema: savedSchema });

  if (options.schema) {
    const change = await db.overrideSchema(
      options.schema as unknown as DBSchema,
      {
        failOnBackwardsIncompatibleChange: true,
      }
    );
    // TODO: integrate these into the error somehow?
    logSchemaChangeViolations(change, { logger: db.logger });
    if (!change.successful) {
      throw new Error(
        `Schema change failed. Review the issues above for more information.`
      );
    }
  } else if (savedSchema) {
    // override schema implicitly handles persisting
    // but if we don't have a new schema, we need to
    // persist the old one
    await db.updateSchema(savedSchema);
  }

  return db;
}

function applySelect<M>(
  rawEntities: ViewEntity[],
  select?: string[],
  include?: any
) {
  if (!include && !select) return rawEntities;
  if (rawEntities.length === 0) return rawEntities;
  return rawEntities.map((rawEnt) => {
    let entity = rawEnt;
    if (include) {
      for (const inclusion in include) {
        const { subquery, cardinality } = include[inclusion] as any;
        if (cardinality === 'one' && entity[inclusion] === null) {
          entity[inclusion] = null;
          continue;
        }
        const selection = applySelect(
          cardinality === 'one' ? [entity[inclusion]] : entity[inclusion],
          subquery.select,
          subquery.include
        );
        entity[inclusion] =
          cardinality === 'one' ? (selection[0] ?? null) : selection;
      }
    }
    if (select) {
      const selectPaths = select.map((attribute) => attribute.split('.'));
      const entityCopy = {} as any;
      for (const path of selectPaths) {
        ValuePointer.Set(entityCopy, path, ValuePointer.Get(entity, path));
      }
      if (include) {
        for (const inclusion in include) {
          entityCopy[inclusion] = entity[inclusion];
        }
      }
      entity = entityCopy;
    }
    return entity;
  });
}

function filterChangesByTimestamp(
  changes: DBChanges,
  timestamps: Record<string, Map<string, Timestamp>>,
  afterTimestamp: Timestamp
): DBChanges {
  const filteredChanges: DBChanges = {};

  for (const [collectionName, collectionChanges] of Object.entries(changes)) {
    const filteredSets = new Map<string, any>();
    const filteredDeletes = new Set<string>();

    for (const [entityId, change] of collectionChanges.sets) {
      const entityTimestamp = timestamps[collectionName]?.get(entityId);
      if (entityTimestamp && entityTimestamp > afterTimestamp) {
        filteredSets.set(entityId, change);
      }
    }

    for (const entityId of collectionChanges.deletes) {
      const entityTimestamp = timestamps[collectionName]?.get(entityId);
      if (entityTimestamp && entityTimestamp > afterTimestamp) {
        filteredDeletes.add(entityId);
      }
    }

    if (filteredSets.size > 0 || filteredDeletes.size > 0) {
      filteredChanges[collectionName] = {
        sets: filteredSets,
        deletes: filteredDeletes,
      };
    }
  }

  return filteredChanges;
}

function entityIsInChangeset(
  changes: DBChanges,
  collection: string,
  entityId: string
) {
  return (
    changes[collection] &&
    (changes[collection].sets.has(entityId) ||
      changes[collection].deletes.has(entityId))
  );
}

export function applyProjectionsAndConversions(
  results: ViewEntity[] | ViewEntity,
  query: CollectionQuery,
  cardinality: QueryResultCardinality,
  typeConverters?: TypeConverters
): any[] | any {
  if (results === null) return null;
  const dataConverter = typeConverters?.get(query.collectionName);
  const convertEntity = (entityData: ViewEntity['data']) => {
    return dataConverter?.fromDB(entityData) ?? entityData;
  };

  const projectEntity = (entity: ViewEntity['data']) => {
    if (!query.select) return entity;
    const projectedEntity: any = {};
    for (const key of query.select) {
      ValuePointer.Set(projectedEntity, key, ValuePointer.Get(entity, key));
    }
    return projectedEntity;
  };

  const projectAndConvertEntity = (entity) => {
    const convertedData = convertEntity(projectEntity(entity.data));
    const convertedInclusions =
      query.include &&
      Object.entries(query.include).reduce((acc, [key, inclusion]) => {
        if (entity.subqueries[key] !== undefined) {
          acc[key] = applyProjectionsAndConversions(
            entity.subqueries[key],
            inclusion.subquery,
            inclusion.cardinality,
            typeConverters
          );
        }
        return acc;
      }, {});
    return {
      ...convertedData,
      ...convertedInclusions,
    };
  };
  return cardinality === 'one'
    ? projectAndConvertEntity(results)
    : (results as ViewEntity[]).map(projectAndConvertEntity);
}

/**
 * This takes a ViewEntity, query, typeConverters and creates getters for the inclusions
 * and select doing conversions lazily as necessary
 * NOTE: this is not used and still TBD if it's worth the complexity
 **/
export function createLazyEntity(
  entity: ViewEntity,
  query: CollectionQuery,
  typeConverters?: TypeConverters
) {
  // Single cache Map, no pre-computation
  const cache = new Map<string, any>();

  const handler: ProxyHandler<object> = {
    get(target, prop, receiver) {
      const propStr = String(prop);

      // Handle special methods
      if (
        prop === 'toJSON' ||
        prop === 'toString' ||
        prop === 'valueOf' ||
        prop === Symbol.toPrimitive
      ) {
        return () => {
          if (!cache.has('data')) {
            const dataConverter = typeConverters?.get(query.collectionName);
            cache.set(
              'data',
              dataConverter?.fromDB(entity.data) ?? entity.data
            );
          }
          const data = cache.get('data');
          return prop === 'toString' ? JSON.stringify(data) : data;
        };
      }

      // Return cached value if exists
      if (cache.has(propStr)) {
        return cache.get(propStr);
      }

      // Lazy computation only when accessed
      let value;
      if (propStr === 'data') {
        const dataConverter = typeConverters?.get(query.collectionName);
        value = dataConverter?.fromDB(entity.data) ?? entity.data;
      } else {
        const inclusion = query.include?.[propStr];
        if (inclusion) {
          const subquery = inclusion.subquery;
          const cardinality = inclusion.cardinality;
          const subEntities = entity.subqueries[propStr];
          if (cardinality === 'one') {
            value = subEntities?.[0]
              ? createLazyEntity(subEntities[0], subquery, typeConverters)
              : null;
          } else {
            value = (subEntities || []).map((v) =>
              createLazyEntity(v, subquery, typeConverters)
            );
          }
        } else {
          // Lazy compute dataKeys only when needed
          const dataKeys = query.select ?? Object.keys(entity.data);
          value = dataKeys.includes(propStr) ? entity.data[propStr] : undefined;
        }
      }

      cache.set(propStr, value);
      return value;
    },

    has(target, prop) {
      const propStr = String(prop);
      if (propStr === 'data') return true;
      if (cache.has(propStr)) return true;

      // Lazy check inclusion and data keys
      if (query.include?.[propStr]) return true;
      const dataKeys = query.select ?? Object.keys(entity.data);
      return dataKeys.includes(propStr);
    },

    ownKeys(target) {
      // Extremely lazy - only returns what's been accessed plus 'data'
      const cachedKeys = Array.from(cache.keys());
      return [
        'data',
        ...(query.include ? Object.keys(query.include) : []),
        ...cachedKeys,
      ].filter((key, idx, arr) => arr.indexOf(key) === idx);
    },

    getOwnPropertyDescriptor(target, prop) {
      const propStr = String(prop);
      // Lazy check if property exists
      const hasProp =
        propStr === 'data' ||
        query.include?.[propStr] !== undefined ||
        (query.select ?? Object.keys(entity.data)).includes(propStr) ||
        cache.has(propStr);

      if (hasProp) {
        return {
          enumerable: true,
          configurable: true,
          get: () => Reflect.get(target, prop, receiver),
        };
      }
      return undefined;
    },
  };

  return new Proxy({}, handler);
}
