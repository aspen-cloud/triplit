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
  PreparedQuery,
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
import { prepareQuery } from './query/prepare-query.js';
import { createSession, DBSession, normalizeSessionVars } from './session.js';
import {
  getTypeConvertersFromSchema,
  TypeConverters,
} from './schema/converters.js';
import { isEmpty } from './memory-write-buffer.js';
import { satisfiesFilters } from './filters.js';
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
} from './query/types/index.js';
import { QueryBuilder } from './query/query-builder.js';
import {
  ClearOptions,
  DBOptions,
  EntityWriteOptions,
  FetchOptions,
  OnCommitCallback,
  ReadModel,
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
    options: FetchOptions & {
      queryState?: {
        timestamp: Timestamp;
        entityIds: Record<string, string[]>;
      };
      queryKey?: string;
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
    const callback = ({ results }: any) => {
      onResults(
        applyProjectionsAndConversions(
          results,
          preparedQuery,
          'many',
          this.typeConverters
        ),
        options.queryKey
      );
    };
    return this.ivm.subscribe(preparedQuery, callback, onError);
  }

  subscribeRaw(
    query: PreparedQuery,
    onResults: SubscriptionResultsCallback,
    onError?: (error: Error) => void,
    options: {
      queryState?: {
        timestamp: Timestamp;
        entityIds: Record<string, string[]>;
      };
      queryKey?: string;
    } = {}
  ): () => void {
    const callback = ({ results }: any) => {
      onResults(results, options.queryKey);
    };
    return this.ivm.subscribe(query, callback, onError);
  }

  /**
   * @deprecated TODO remove
   */
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
  /**
   * @deprecated TODO remove
   */
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
    return this.ivm.subscribe(
      preparedQuery,
      // @ts-expect-error - Ignoring because method is deprecated
      callback,
      options.errorCallback
    );
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

    const queryEngine = new EntityStoreQueryEngine(this.kv, this.entityStore);
    let results = await queryEngine.fetch(preparedQuery);

    return applyProjectionsAndConversions(
      results,
      preparedQuery,
      'many',
      this.typeConverters
    );
  }

  async rawFetch(query: PreparedQuery): Promise<ViewEntity[]> {
    const queryEngine = new EntityStoreQueryEngine(this.kv, this.entityStore);
    return queryEngine.fetch(query);
  }

  /**
   * @deprecated
   * @param query
   * @param options
   * @returns
   */
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
    const results = (await this.rawFetch(preparedQuery)) as ViewEntity[];
    const changes = queryResultsToChanges(results, preparedQuery);
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
  ): Promise<ReadModel<M, CN>> {
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
  ): Promise<void> {
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
  ): Promise<void> {
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
      schema[collection as CollectionNameFromModels<M>]?.schema;
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
    const queryEngine = new EntityStoreQueryEngine(storage, this.entityStore);
    const isSatisfied = await satisfiesFilters(
      entity,
      preparedPermissions,
      queryEngine
    );
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
    await db
      // @ts-expect-error - updateSchema is private
      .updateSchema(savedSchema);
  }

  return db;
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
  results: ViewEntity[] | ViewEntity | null,
  query: PreparedQuery,
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

  const projectAndConvertEntity = (entity: ViewEntity) => {
    const convertedData = convertEntity(projectEntity(entity.data));
    const convertedInclusions =
      query.include &&
      Object.entries(query.include).reduce<any>((acc, [key, inclusion]) => {
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
    ? projectAndConvertEntity(results as ViewEntity)
    : (results as ViewEntity[]).map(projectAndConvertEntity);
}
