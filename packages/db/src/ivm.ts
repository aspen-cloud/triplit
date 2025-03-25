import { CollectionNameFromModels, Models } from './schema/index.js';
import { CollectionQuery, QueryOrder, WhereFilter } from './query.js';
import { Change, DBChanges, DBEntity, QueryAfter } from './types.js';
import {
  isFilterGroup,
  isSubQueryFilter,
  satisfiesNonRelationalFilter,
  someFilterStatements,
} from './filters.js';
import { DB, DBSchema } from './db.js';
import { deepObjectAssign } from './utils/deep-merge.js';
import {
  areChangesEmpty,
  mergeDBChanges,
  SimpleMemoryWriteBuffer,
} from './memory-write-buffer.js';
import { EntityDataStore } from './entity-data-store.js';
import { BTreeKVStore } from './kv-store/storage/memory-btree.js';
import { performanceTrace } from './utils/performance-trace.js';
import { satisfiesAfter } from './after.js';
import { logger } from '@triplit/logger';
import { ValuePointer } from './utils/value-pointer.js';
import { KVDoubleBuffer } from './double-buffer.js';
import { DurableWriteBuffer } from './durable-write-buffer.js';
import { setImmediate } from 'node:timers/promises';
import { yieldToEventLoop } from './utils/timers.js';
import {
  createViewEntity,
  flattenViewEntity,
  ViewEntity,
} from './query-engine.js';

interface QueryNode {
  // TODO support multiple root queries (essentially subqueries could be shared between root queries)
  rootQuery: string;
  query: CollectionQuery;
  queryType: 'root' | 'exists' | 'include' | 'order';
}

interface SubscribedQueryInfo {
  ogQuery: CollectionQuery; // Original query
  query: CollectionQuery; // Modified query with exists added to includes
  listeners: Set<SubscriptionCallback>;
  errorCallbacks: Set<(error: Error) => void>;
  uninitializedListeners: WeakSet<SubscriptionCallback>;
  results?: ViewEntity[];
  capturedChanges?: DBChanges;
  hasChanged?: boolean;
  collections: Set<string>;
}

type SubscriptionCallback = (update: {
  results: ViewEntity[];
  changes: DBChanges;
}) => void;

export interface IVMOptions {
  shouldTrackChanges?: boolean;
}

export class IVM<M extends Models<M> = Models> {
  storage = new BTreeKVStore();
  entityStore: EntityDataStore = new EntityDataStore(['entities']);
  doubleBuffer: KVDoubleBuffer = new KVDoubleBuffer(
    // @ts-expect-error change buffer doesn't fully comply with WriteBuffer
    new SimpleMemoryWriteBuffer(),
    new SimpleMemoryWriteBuffer()
  );
  private runningLock:
    | ReturnType<typeof Promise.withResolvers<void>>
    | undefined;

  // These represent what subscribers are actually interested in
  readonly subscribedQueries: Map<string, SubscribedQueryInfo> = new Map();

  // Individual queries that make up the subscribed queries
  // Each query represents either a root query or a subquery of a subscribed query
  private queryNodes: Record<CollectionNameFromModels<M>, QueryNode[]> =
    {} as any;

  constructor(
    readonly db: DB,
    readonly options: IVMOptions
  ) {}

  subscribe(
    query: CollectionQuery,
    callback: SubscriptionCallback,
    errorCallback?: (error: Error) => void
  ) {
    const rootQueryId = JSON.stringify(query);
    if (!this.subscribedQueries.has(rootQueryId)) {
      this.subscribedQueries.set(rootQueryId, {
        ogQuery: query,
        query: this.options.shouldTrackChanges
          ? createQueryWithRelationalOrderAddedToIncludes(
              createQueryWithExistsAddedToIncludes(query)
            )
          : query,
        listeners: new Set(),
        errorCallbacks: new Set(),
        uninitializedListeners: new WeakSet(),
        results: undefined,
        collections: new Set(),
      });
      this.createQueryNodesForRootQuery(rootQueryId, query, 'root');
    }

    this.subscribedQueries.get(rootQueryId)!.listeners.add(callback);
    if (errorCallback) {
      this.subscribedQueries
        .get(rootQueryId)!
        .errorCallbacks.add(errorCallback);
    }
    this.subscribedQueries
      .get(rootQueryId)!
      .uninitializedListeners.add(callback);

    return () => {
      if (!this.subscribedQueries.has(rootQueryId)) {
        logger.warn('Query not found', { rootQueryId });
        return;
      }
      this.subscribedQueries.get(rootQueryId)!.listeners.delete(callback);
      this.subscribedQueries
        .get(rootQueryId)!
        .uninitializedListeners.delete(callback);
      if (errorCallback) {
        this.subscribedQueries
          .get(rootQueryId)!
          .errorCallbacks.delete(errorCallback);
      }

      if (this.subscribedQueries.get(rootQueryId)!.listeners.size === 0) {
        this.subscribedQueries.delete(rootQueryId);
        // TODO make this more efficient
        this.queryNodes = Object.fromEntries(
          Object.entries(this.queryNodes).map(([collection, nodes]) => [
            collection,
            nodes.filter((n) => n.rootQuery !== rootQueryId),
          ])
        ) as typeof this.queryNodes;
      }
    };
  }

  private async initializeQueryResults(rootQueryId: string) {
    const query = this.subscribedQueries.get(rootQueryId)!.query;
    const results = (await this.db.rawFetch(query)) as ViewEntity[];
    // So the subscribedQuery might get deleted during the async fetch
    // so we have to check it still exists. We could alternatively just
    // save the query state to a variable before the fetch but I think
    // it's better to leave this as a reminder that this is a potential
    // issue
    // const tx = this.storage.transact();
    // await this.entityStore.applyChanges(
    //   tx,
    //   queryResultsToChanges(results, query),
    //   {
    //     checkWritePermission: undefined,
    //     entityChangeValidator: undefined,
    //   }
    // );
    // await tx.commit();
    if (this.subscribedQueries.get(rootQueryId)) {
      this.subscribedQueries.get(rootQueryId)!.results = results;
    }
  }

  flushChangesToListeners() {
    for (const queryId of this.subscribedQueries.keys()) {
      const rootQueryInfo = this.subscribedQueries.get(queryId)!;
      for (const listener of rootQueryInfo.listeners) {
        if (!rootQueryInfo.results) {
          logger.error('Results not found for query', { queryId });
          continue;
        }
        if (
          !rootQueryInfo.uninitializedListeners.has(listener) &&
          !rootQueryInfo.hasChanged &&
          areChangesEmpty(rootQueryInfo.capturedChanges!)
        ) {
          console.log('Skipping listener');
          // console.dir({ rootQueryInfo }, { depth: 10 });
          continue;
        }
        const results =
          rootQueryInfo.results &&
          removeInternalIncludesFromResults(rootQueryInfo.results);
        const changes = rootQueryInfo.uninitializedListeners.has(listener)
          ? queryResultsToChanges(rootQueryInfo.results, rootQueryInfo.query)
          : rootQueryInfo.capturedChanges!;

        rootQueryInfo.uninitializedListeners.delete(listener);
        if (results != null || changes != null) {
          listener({ results, changes });
        }
      }
      rootQueryInfo.hasChanged = false;
      rootQueryInfo.capturedChanges = undefined;
    }
  }

  private createQueryNodesForRootQuery(
    queryId: string,
    query: CollectionQuery,
    type: QueryNode['queryType']
  ) {
    const collection = query.collectionName;
    this.subscribedQueries.get(queryId)!.collections?.add(collection);
    if (!this.queryNodes[collection]) {
      this.queryNodes[collection] = [];
    }
    this.queryNodes[collection].push({
      rootQuery: queryId,
      query,
      queryType: type,
    });
    for (const subquery of query.where?.filter(isSubQueryFilter) ?? []) {
      this.createQueryNodesForRootQuery(queryId, subquery.exists, 'exists');
    }
    for (const [relName, { subquery }] of Object.entries(query.include ?? [])) {
      this.createQueryNodesForRootQuery(queryId, subquery, 'include');
    }
    for (const [attribute, _direction, rel] of query.order ?? []) {
      if (rel) {
        this.createQueryNodesForRootQuery(queryId, rel.subquery, 'order');
      }
    }
  }

  async bufferChanges(newChanges: DBChanges) {
    // TODO evaluate best way to avoid mutation here
    // without doing a potentially expensive clone
    const changes = structuredClone(newChanges);
    const tx = this.storage.transact();
    try {
      if (this.subscribedQueries.size === 0) {
        // This is to keep the internal entity store up to date
        await this.entityStore.applyChanges(tx, changes, {
          checkWritePermission: undefined,
          entityChangeValidator: undefined,
        });
      } else {
        // TODO / WARNING this basically needs to be synchronous otherwise there will be
        // a race condition between the changes being applied and the views being updated
        // which can cause the TX that updates the buffer to commit while updateViews is running
        // then get cleared before it's actually processed leading to subscriptions missing data

        // @ts-expect-error this doubleBuffer uses simple MemoryWriteBuffer so don't use
        // transactions or KV store at all
        this.doubleBuffer.write(undefined, changes);
      }
    } finally {
      await tx.commit();
    }
  }

  private async acquireRunningLock() {
    while (this.runningLock !== undefined) {
      await this.runningLock?.promise;
    }
    this.runningLock = Promise.withResolvers<void>();
    const resolve = this.runningLock.resolve;

    return {
      [Symbol.dispose]: () => {
        // This ensure the next queued call will run and then immediately set the lock to
        // a new promise which will ensure mutual exclusion
        this.runningLock = undefined;
        resolve();
      },
    };
  }

  async updateViews(): Promise<void> {
    using _runningLock = await this.acquireRunningLock();
    this.doubleBuffer.lockAndSwitchBuffers();
    const storeChanges = await this.doubleBuffer.inactiveBuffer.getChanges(
      this.storage
    );
    // using _mark = performanceTrace('updateViews', {
    //   track: 'IVM',
    //   properties: {
    //     numQueries: this.subscribedQueries.size,
    //     numChangedCollections: Object.keys(storeChanges).length,
    //   },
    // });
    const handledRootQueries = new Set<string>();
    // Iterate through queries and get initial results for ones that don't have any
    for (const queryId of this.subscribedQueries.keys()) {
      if (this.subscribedQueries.get(queryId)!.results == null) {
        await this.initializeQueryResults(queryId);
        handledRootQueries.add(queryId);
      }
    }

    const affectedQueries = this.getAffectedQueries(storeChanges);
    for (const [queryId, changes] of affectedQueries) {
      if (handledRootQueries.has(queryId)) {
        continue;
      }
      const subscribedQueryInfo = this.subscribedQueries.get(queryId)!;
      if (this.options.shouldTrackChanges) {
        await this.processChangesForTracking(subscribedQueryInfo, changes);
      } else {
        await this.updateQueryResults(subscribedQueryInfo, changes);
      }
    }
    const kvTx = this.storage.transact();
    this.doubleBuffer.inactiveBuffer.clear(kvTx);
    await kvTx.commit();
  }

  private async updateQueryResults(
    rootQueryInfo: SubscribedQueryInfo,
    changes: DBChanges
  ) {
    const rootQuery = rootQueryInfo.query;
    const rootCollection = rootQuery.collectionName;
    let onlyChangesToRootCollection = true;
    for (const collection in changes) {
      if (rootCollection !== collection) {
        onlyChangesToRootCollection = false;
        break;
      }
    }
    // TODO: short circuit if this is a big server initialization
    if (isQueryRelational(rootQuery)) {
      const freshResults = await this.db.rawFetch(rootQuery);
      rootQueryInfo.results = freshResults as ViewEntity[];
      rootQueryInfo.hasChanged = true;
      return;
    }
    const rootCollectionChanges = changes[rootCollection];
    const deletes = rootCollectionChanges.deletes;
    const inserts = new Map<string, DBEntity>();
    const updates = new Map<string, Change>();
    for (const [id, entity] of rootCollectionChanges.sets) {
      if (entity.id) {
        inserts.set(id, entity as DBEntity);
      } else {
        updates.set(id, entity as Change);
      }
    }
    const evictedEntities = new Set<string>();
    const addedEntities = new Set<string>();
    // console.dir({ rootQuery, deletes, inserts, updates }, { depth: null });
    // console.log({ inserts, updates, deletes });
    const handledUpdates = new Set<string>();
    const matchesWhereOrAfterIfRelevant = (e: DBEntity) =>
      (!rootQuery.where ||
        doesEntityMatchBasicWhere(
          rootCollection,
          e,
          rootQuery.where,
          this.db.schema
        )) &&
      (!rootQuery.after || satisfiesAfter(e, rootQuery.after, rootQuery.order));

    let filteredResults = rootQueryInfo.results!;
    // console.dir({ before: filteredResults }, { depth: null });
    if (deletes.size > 0 || updates.size > 0) {
      filteredResults = rootQueryInfo.results!.filter((entity) => {
        let matches = true;
        if (deletes.has(entity.data.id)) {
          matches = false;
        }
        if (updates.has(entity.data.id)) {
          handledUpdates.add(entity.data.id);
          deepObjectAssign(entity.data, updates.get(entity.data.id));
          matches = matchesWhereOrAfterIfRelevant(entity.data);
        }
        if (!matches) {
          evictedEntities.add(entity.data.id);
        }
        return matches;
      });
    }
    // console.dir({ after: filteredResults }, { depth: null });
    const potentialAdditions: DBEntity[] = Array.from(inserts.values());

    // console.dir({ afterInserts: filteredResults }, { depth: null });
    for (const [id, update] of updates) {
      if (handledUpdates.has(id)) {
        continue;
      }
      if (
        rootQuery.where &&
        !doesUpdateImpactSimpleFilters(update, rootQuery.where)
      ) {
        continue;
      }
      const sourceEntity = await this.db.entityStore.getEntity(
        this.db.kv,
        rootCollection,
        id
      );
      if (sourceEntity == null) {
        continue;
      }
      potentialAdditions.push(sourceEntity);
    }

    for (const entity of potentialAdditions) {
      if (matchesWhereOrAfterIfRelevant(entity)) {
        addedEntities.add(entity.id);
        filteredResults.push(createViewEntity(entity));
      }
    }

    if (rootQuery?.order != null) {
      filteredResults.sort((a, b) =>
        compare(flattenViewEntity(a), flattenViewEntity(b), rootQuery.order!)
      );
    }
    if (rootQuery?.limit != null) {
      if (
        evictedEntities.size > 0 &&
        filteredResults.length < rootQuery.limit
      ) {
        if (rootQuery.order && filteredResults.length > 0) {
          const backfillQuery = {
            ...rootQuery,
            limit: rootQuery.limit - filteredResults.length,
          };
          const after: QueryAfter = [
            // @ts-expect-error
            rootQuery.order.map(([attr]) => {
              return ValuePointer.Get(
                filteredResults[filteredResults.length - 1].data,
                attr
              );
            }),
            // TODO: hard to reason about inclusive vs exclusive here
            // maybe shouldn't be doing this if you'll end up with duplicate entities.
            // unless you add an id to the order and after to tiebreak
            false,
          ];
          backfillQuery.after = after;

          filteredResults = filteredResults.concat(
            await this.db.rawFetch(backfillQuery)
          );
        } else {
          // this could be better handled higher up
          filteredResults = (await this.db.rawFetch(rootQuery)) as ViewEntity[];
        }
      } else {
        filteredResults = filteredResults.slice(0, rootQuery.limit);
      }
    }
    rootQueryInfo.results = filteredResults;
    rootQueryInfo.hasChanged =
      evictedEntities.size > 0 ||
      addedEntities.size > 0 ||
      handledUpdates.size > 0;
  }

  private async processChangesForTracking(
    rootQueryInfo: SubscribedQueryInfo,
    changes: DBChanges
  ) {
    const freshResults = await this.db.rawFetch(rootQueryInfo.query);
    const previousResultChanges = queryResultsToChanges(
      rootQueryInfo.results!,
      rootQueryInfo.query
    );
    const newResultChanges = queryResultsToChanges(
      freshResults as ViewEntity[],
      rootQueryInfo.query
    );
    const diff = diffChanges(previousResultChanges, newResultChanges);

    const filteredChanges = {} as DBChanges;
    for (const collection in diff) {
      // We only want to pass on deletes that were actually deleted
      // const actualDeletes = changes[collection]?.deletes
      //   ? diff[collection].deletes.intersection(changes[collection].deletes)
      //   : new Set<string>();

      filteredChanges[collection] = {
        sets: diff[collection].sets,
        // deletes: actualDeletes,
        deletes: diff[collection].deletes,
      };
      // We want to also capture sets that were treated as deletes by the diff
      if (changes[collection]?.sets) {
        const evictedSets = new Set(
          changes[collection].sets.keys()
        ).intersection(diff[collection].deletes);
        for (const evictedSet of evictedSets) {
          filteredChanges[collection].deletes.delete(evictedSet);
          filteredChanges[collection].sets.set(
            evictedSet,
            changes[collection].sets.get(evictedSet)!
          );
        }
      }
    }

    if (!areChangesEmpty(diff)) {
      rootQueryInfo.hasChanged = true;
    }
    rootQueryInfo.results = freshResults;
    rootQueryInfo.capturedChanges = mergeDBChanges(
      rootQueryInfo.capturedChanges ?? {},
      // filteredChanges
      diff
    );
  }

  private getAffectedQueries(changes: DBChanges): Map<string, DBChanges> {
    // TODO  we should probably organize queries by touched collections to make this faster
    const affectedQueries = new Map<string, DBChanges>();
    for (const queryId of this.subscribedQueries.keys()) {
      const queryState = this.subscribedQueries.get(queryId)!;
      const queryChanges = {} as DBChanges;
      for (const collection in changes) {
        if (queryState.collections.has(collection)) {
          queryChanges[collection] = changes[collection];
        }
      }
      if (Object.keys(queryChanges).length > 0) {
        affectedQueries.set(queryId, queryChanges);
      }
    }
    return affectedQueries;
  }

  // This is used to get results that should be incorporated into the root query
  // when a change is deemed to be accretive (`matchesAfter` is true)
  private async handlePotentialResultAdditions(
    subscribedQueryInfo: SubscribedQueryInfo,
    queryNode: QueryNode,
    entityAfter: DBEntity
  ) {
    const queryIsRoot = queryNode.queryType === 'root';
    const rootQuery = this.subscribedQueries.get(queryNode.rootQuery)!.query;
    const entityId = entityAfter.id;
    if (queryNode.queryType === 'include') {
      const subqueryPath = getPathToIncludedSubquery(
        rootQuery,
        queryNode.query
      );
      if (subqueryPath == null) {
        throw new Error('Subquery path not found');
      }
      // We need to turn this inclusion (and all inclusions up to the root)
      //  into an `exists` filters on the parent query with variables bound
      const partialResultsQuery = structuredClone(rootQuery);
      let currentQuery = partialResultsQuery;
      for (let i = 0; i < subqueryPath.length; i++) {
        const relation = subqueryPath[i];
        const include = currentQuery.include![relation];

        if (i === subqueryPath.length - 1) {
          const boundSubQuery = {
            ...include.subquery,
            where: (include.subquery.where ?? []).concat([
              ['id', '=', entityId],
            ]),
          };
          currentQuery.where = (currentQuery.where ?? []).concat([
            {
              exists: boundSubQuery,
            },
          ]);
          currentQuery.include![relation].subquery = boundSubQuery;
        } else {
          currentQuery.where = (currentQuery.where ?? []).concat([
            {
              exists: include.subquery,
            },
          ]);
        }

        currentQuery = include.subquery;
      }
      const partialResults = (await this.db.rawFetch(
        partialResultsQuery
      )) as ViewEntity[];

      subscribedQueryInfo.results = mergeResults(
        subscribedQueryInfo.results ?? [],
        partialResults,
        partialResultsQuery
      );
      queryResultsToChanges(
        partialResults,
        partialResultsQuery,
        subscribedQueryInfo.capturedChanges!
      );

      return;
    }

    const validationQuery = queryIsRoot
      ? createQueryWithExistsAddedToIncludes({
          ...rootQuery,
          where: rootQuery.where
            ? rootQuery.where.concat([['id', '=', entityId]])
            : [['id', '=', entityId]],
        })
      : createQueryWithExistsAddedToIncludes(
          mapSubqueriesRecursive(
            rootQuery,
            (query) => {
              if (JSON.stringify(query) !== JSON.stringify(queryNode.query))
                return query;
              return {
                ...query,
                where: query.where
                  ?.filter(
                    (filter) =>
                      Array.isArray(filter) &&
                      typeof filter[2] == 'string' &&
                      filter[2].startsWith('$')
                  )
                  .concat([['id', '=', entityId]]),
              };
            },
            { traverseIncludes: false, traverseExists: true }
          )
        );

    // These results represent only a subset of the results that are part of the root query
    const partialResults = (await this.db.rawFetch(
      validationQuery
    )) as ViewEntity[];

    // TODO partialResults should be filtered to only include the results that are
    // are actually new
    queryResultsToChanges(
      partialResults,
      validationQuery,
      // implicitly mutating the root query state
      subscribedQueryInfo.capturedChanges!
    );

    subscribedQueryInfo.results = mergeResults(
      subscribedQueryInfo.results ?? [],
      partialResults,
      validationQuery
    );
  }

  private async handleSimpleInserts({
    allSetEntities,
    queryNode,
    storeChanges,
    schema,
  }: {
    allSetEntities: Set<string>;
    queryNode: QueryNode;
    storeChanges: DBChanges;
    schema?: DBSchema;
  }) {
    const rootQueryState = this.subscribedQueries.get(queryNode.rootQuery)!;
    const collection = queryNode.query.collectionName;
    const addedResults = Array.from(
      allSetEntities
        .values()
        .map((id) => storeChanges[collection].sets.get(id))
        .filter(
          (entSet) =>
            doesEntityMatchBasicWhere(
              collection,
              entSet,
              queryNode.query.where ?? [true],
              schema
            ) &&
            (!queryNode.query.after ||
              satisfiesAfter(
                entSet,
                queryNode.query.after,
                queryNode.query.order
              ))
        )
    ).map((ent) => ({ data: ent, subqueries: {} }));
    rootQueryState.results = mergeResults(
      rootQueryState.results ?? [],
      addedResults,
      queryNode.query
    );
    rootQueryState.capturedChanges = queryResultsToChanges(
      addedResults,
      queryNode.query
    );
  }

  // This is used to check and possible update a single result that is already
  // a part of the results but has changed
  private async handlePotentialResultUpdate(
    rootQueryState: SubscribedQueryInfo,
    queryNode: QueryNode,
    entityAfter: DBEntity
  ) {
    const rootQuery = this.subscribedQueries.get(queryNode.rootQuery)!.query;
    const entityId = entityAfter.id;
    const queryIsRoot = queryNode.queryType === 'root';
    if (queryIsRoot) {
      const currentResults = rootQueryState.results!;
      const index = currentResults.findIndex((r) => r.data.id === entityId);
      if (index === -1) {
        return;
      }
      rootQueryState.results = mergeResults(
        currentResults,
        [createViewEntity(entityAfter)],
        rootQuery
      );
      rootQueryState.capturedChanges![queryNode.query.collectionName].sets.set(
        entityId,
        entityAfter
      );
      return;
    }
    // Check if the result should be part of the result
    const confirmationQuery = mapSubqueriesRecursive(
      rootQuery,
      (query) => {
        if (JSON.stringify(query) !== JSON.stringify(queryNode.query))
          return query;
        return {
          ...query,
          where: query.where
            ? query.where.concat([['id', '=', entityId]])
            : [['id', '=', entityId]],
        };
      },
      { traverseExists: true, traverseIncludes: false }
    )!;

    const results = (await this.db.rawFetch(confirmationQuery)) as ViewEntity[];
    if (results.length === 0) {
      return;
    }

    rootQueryState.results = mergeResults(
      rootQueryState.results!,
      results,
      rootQuery
    );

    rootQueryState.capturedChanges![queryNode.query.collectionName].sets.set(
      entityId,
      entityAfter
    );
  }

  private async handlePotentialResultEviction(
    rootQueryState: SubscribedQueryInfo,
    queryNode: QueryNode,
    entityBefore: DBEntity | null | undefined,
    entityAfter: DBEntity | null | undefined
  ) {
    // It's not guaranteed that just because an change causes an entity to no longer match that it will necessarily cause a result
    // to be evicted from from the root query because some other entity might server as a substitute and satisfy the subquery.
    // So we need to check if the entity that was removed was the only entity that satisfied the subquery

    let resultsIdsToRemove: Set<string>;
    const queryIsRoot = queryNode.queryType === 'root';
    const isDeleted = entityAfter == null;
    const rootQuery = this.subscribedQueries.get(queryNode.rootQuery)!.query;
    const entityId: string = entityBefore?.id ?? entityAfter!.id;
    if (queryIsRoot) {
      let didRemoveItem = false;
      for (let i = 0; i < rootQueryState.results!.length; i++) {
        const result = rootQueryState.results![i];
        if (result.data.id === entityId) {
          rootQueryState.results!.splice(i, 1);
          didRemoveItem = true;
          break;
        }
      }
      if (didRemoveItem) {
        if (isDeleted) {
          rootQueryState.capturedChanges![
            queryNode.query.collectionName
          ].deletes.add(entityId);
        } else {
          const { id, ...rest } = entityAfter;
          rootQueryState.capturedChanges![
            queryNode.query.collectionName
          ].sets.set(entityId, rest);
        }
      }
    } else {
      // Query is not root
      const path = getPathToIncludedSubquery(rootQuery, queryNode.query);
      if (path == null) {
        throw new Error('Subquery path not found');
      }
      // Root results that contain the entity via includes
      const connectedRootResults = rootQueryState.results!.filter((result) => {
        let current = result;
        for (const relation of path) {
          current = current.subqueries[relation];
          if (!current) return false;
        }
        // Ideally we'd assert the queryType here
        // Because it should only be 'includes' at this point
        // Also it would be better to check the cardinality directly rather
        // than infer that by the underlying data type
        if (queryNode.queryType === 'include' && Array.isArray(current)) {
          return current.some((r: any) => r.data.id === entityId);
        } else {
          return current.data.id === entityId;
        }
      });

      if (connectedRootResults.length === 0) {
        return;
      }

      if (queryNode.queryType === 'include') {
        // Remove entity from any matching results
        for (const result of connectedRootResults) {
          let current = result;
          const subPath = path?.slice(0, -1);
          const leaf = path?.at(-1);
          for (const relation of subPath) {
            current = current.subqueries[relation];
          }
          const leafValue = current.subqueries[leaf];
          // TODO: if this query has a limit, this doesn't handle backfilling after the removal?
          if (Array.isArray(leafValue)) {
            current.subqueries[leaf] = current.subqueries[leaf].filter(
              (r: any) => r.data.id !== entityId
            );
          } else {
            current.subqueries[leaf] = null;
          }
        }
      } else {
        // Verify existing results
        const verificationQuery = {
          ...rootQuery,
          where: [
            ...(rootQuery.where ?? []),
            ['id', 'in', connectedRootResults.map((r) => r.data.id)],
          ] as CollectionQuery['where'],
        };
        const positiveEntities = (await this.db.rawFetch(
          verificationQuery
        )) as ViewEntity[];
        resultsIdsToRemove = new Set(
          connectedRootResults
            .filter(
              (r) => !positiveEntities.some((e) => e.data.id === r.data.id)
            )
            .map((r) => r.data.id)
        );
        if (resultsIdsToRemove.size > 0) {
          rootQueryState.results = rootQueryState.results!.filter(
            (r) => !resultsIdsToRemove.has(r.data.id)
          );
        }
      }
      // TODO I'm not sure why this is here vs actually checking that
      // this needs to be tracked
      if (isDeleted) {
        rootQueryState.capturedChanges![
          queryNode.query.collectionName
        ].deletes.add(entityId);
      }
    }
    return;
  }

  async clear() {
    await this.storage.clear();
    this.subscribedQueries.clear();
    this.queryNodes = {} as any;
  }
}

export function queryResultsToChanges<C extends string>(
  results: ViewEntity[],
  query: CollectionQuery,
  changes: DBChanges = {}
) {
  // removeInternalIncludesFromResults(results);
  const collection = query.collectionName as C;
  if (!changes[collection]) {
    changes[collection] = { sets: new Map(), deletes: new Set() };
  }
  const include = query.include ?? {};
  for (const result of results) {
    changes[collection].sets.set(result.data.id, result.data);
    for (const [key, { subquery, cardinality }] of Object.entries(include)) {
      const subqueryResults = result.subqueries[key];
      if (subqueryResults == null) {
        continue;
      }
      queryResultsToChanges(
        cardinality === 'one' ? [subqueryResults] : subqueryResults,
        subquery,
        changes
      );
    }
  }
  return changes;
}

function entityWithoutIncludes(entity: any, query: CollectionQuery) {
  if (query.include == null) {
    return entity;
  }
  const cleaned = { ...entity };
  for (const key in cleaned) {
    if (key in query.include) {
      delete cleaned[key];
    }
  }

  return cleaned;
}

export function createQueryWithExistsAddedToIncludes(
  query: CollectionQuery
): CollectionQuery {
  const newQuery = structuredClone(query);
  const exists = query.where?.filter(isSubQueryFilter);
  if (exists && exists.length > 0) {
    newQuery.include = {
      ...newQuery.include,
      ...Object.fromEntries<Record<string, CollectionQuery>>(
        exists.map((subquery, i) => [
          `_exists-${i}`,
          {
            subquery: {
              ...createQueryWithExistsAddedToIncludes(subquery.exists),
            } as CollectionQuery,
            cardinality: 'one',
          },
        ])
      ),
    };
  }
  return newQuery;
}

export function createQueryWithRelationalOrderAddedToIncludes(
  query: CollectionQuery
) {
  if (!query.order) return query;
  const newQuery = structuredClone(query);
  // TODO: update QueryOrder type to include potential subquery
  // @ts-expect-error
  for (const [attribute, _direction, subquery] of newQuery.order!) {
    if (!subquery) continue;
    newQuery.include = {
      ...newQuery.include,
      [attribute]: subquery,
    };
  }
  return newQuery;
}

function removeInternalIncludesFromResults(results: any[]) {
  return results.map((viewEnt) => ({
    data: viewEnt.data,
    subqueries: Object.fromEntries(
      Object.entries(viewEnt.subqueries).filter(([key]) => !key.startsWith('_'))
    ),
  }));
}

function mapSubqueriesRecursive(
  query: CollectionQuery,
  mapFunc: (
    query: CollectionQuery,
    path?: string[]
  ) => (CollectionQuery | null) | [CollectionQuery | null],
  options: {
    traverseIncludes?: boolean;
    traverseExists?: boolean;
  } = { traverseIncludes: true, traverseExists: true },
  path: string[] = []
): CollectionQuery | null {
  const mappedQuery = mapFunc(query, path);
  if (mappedQuery == null) {
    return null;
  }
  return {
    ...mappedQuery,
    where: options.traverseExists
      ? (mappedQuery.where?.map((filter) => {
          if (isSubQueryFilter(filter)) {
            const mappedQuery = mapSubqueriesRecursive(
              filter.exists,
              mapFunc,
              options,
              path
            );
            // TODO figure out if it's better to return true or filter out the subquery
            if (mappedQuery == null) return true;
            return {
              ...filter,
              exists: mappedQuery,
            };
          }
          return filter;
        }) ?? [])
      : mappedQuery.where,
    include: options.traverseIncludes
      ? Object.fromEntries(
          Object.entries(mappedQuery.include ?? {})
            .map(([key, { subquery, cardinality }]) => {
              const mappedQuery = mapSubqueriesRecursive(
                subquery,
                mapFunc,
                options,
                path.concat(key)
              );
              if (mappedQuery == null) return null;
              return [
                key,
                {
                  subquery: mappedQuery,
                  cardinality,
                },
              ];
            })
            .filter((x) => x != null)
        )
      : mappedQuery.include,
  };
}

function doesEntityMatchBasicWhere(
  collectionName: string,
  entity: DBEntity,
  filters: WhereFilter<any, any>[],
  schema?: DBSchema
) {
  return filters.every((filter) =>
    satisfiesNonRelationalFilter(collectionName, entity, filter, schema, true)
  );
}

function doesUpdateImpactSimpleFilters(
  entity: Change,
  filters: WhereFilter<any, any>[]
) {
  // TODO check order statements as well
  return filters.some((filter) => {
    if (isFilterGroup(filter)) {
      return doesUpdateImpactSimpleFilters(entity, filter.filters);
    }
    const attributePath = filter[0].split('.');
    // TODO handle nested attributes
    // e.g. some record assignment like entity.auth = {} could affect "entity.author.name"
    const value = ValuePointer.Get(entity, attributePath);
    return value !== undefined;
  });
}

function getPathToIncludedSubquery(
  rootQuery: CollectionQuery,
  subquery: CollectionQuery
) {
  const queryStack: [CollectionQuery, string[]][] = [];
  queryStack.push([rootQuery, []]);
  const targetQueryString = JSON.stringify(subquery);
  while (queryStack.length > 0) {
    const [currentQuery, path] = queryStack.pop()!;
    if (JSON.stringify(currentQuery) === targetQueryString) {
      return path;
    }
    const inclusions = Object.entries(currentQuery.include ?? {});
    for (const [includeAlias, include] of inclusions) {
      queryStack.push([include.subquery, path.concat(includeAlias)]);
    }
  }
  return null;
}

// TODO use correct utility here
const compare = (a: DBEntity, b: DBEntity, order: QueryOrder<any, any>) => {
  for (const [field, direction, subquery] of order) {
    const isRelational = !!subquery;
    let aValue = a[field];
    let bValue = b[field];
    if (isRelational) {
      // this is basically to handle the fact that the relation on the
      // entity isnt a true relation but aliased using
      // dot notation based on the order clause e.g. 'author.name' instead of 'authorId'
      const pathWithoutParent = field.split('.').slice(1).join('.');
      aValue = ValuePointer.Get(aValue, pathWithoutParent);
      bValue = ValuePointer.Get(bValue, pathWithoutParent);
    }

    if (aValue < bValue) {
      return direction === 'ASC' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'ASC' ? 1 : -1;
    }
  }
  return 0;
};

function mergeResults(
  existingResults: ViewEntity[],
  additionalResults: ViewEntity[],
  query?: CollectionQuery
) {
  const newResultMap = new Map(additionalResults.map((r) => [r.data.id, r]));
  const mergedResultIds = new Set();
  const inclusions = query?.include ?? {};
  for (const result of existingResults) {
    if (!newResultMap.has(result.data.id)) {
      continue;
    }
    mergedResultIds.add(result.data.id);
    const updatedInclusions = Object.fromEntries(
      Object.entries(inclusions).map(([prop, { subquery, cardinality }]) => {
        const existing = result.subqueries[prop];
        const additional = newResultMap.get(result.data.id)!.subqueries[prop];
        if (additional == null || existing == null) {
          return [prop, additional];
        }
        if (cardinality === 'one') {
          return [prop, mergeResults([existing], [additional], subquery)[0]];
        }
        return [prop, mergeResults(existing, additional, subquery)];
      })
    );
    // TODO handle updating individual properties
    Object.assign(result.subqueries, updatedInclusions);
    const newResult = newResultMap.get(result.data.id)!;
    for (const key in newResult.data) {
      result.data[key] = newResult.data[key];
    }
  }
  const newResults = additionalResults.filter(
    (r) => !mergedResultIds.has(r.data.id)
  );
  const updatedResults = existingResults.concat(newResults);

  if (query?.order != null) {
    updatedResults.sort((a, b) =>
      compare(flattenViewEntity(a), flattenViewEntity(b), query.order!)
    );
  }
  if (query?.limit != null) {
    return updatedResults.slice(0, query.limit);
  } else {
    return updatedResults;
  }
}

function isQueryRelational(query: CollectionQuery<any, any>) {
  const { where, include, order } = query;
  return !!(
    (where &&
      someFilterStatements(where, (filter) => isSubQueryFilter(filter))) ||
    (include && Object.keys(include).length > 0) ||
    // @ts-expect-error
    (order && order.some((o) => !!o[2]))
  );
}

function getRelevantUpdatesAndInserts(
  collectionSets: Map<string, any>,
  // insertFilter: (change: DBEntity) => boolean
  queryContext: {
    query: CollectionQuery;
    schema?: DBSchema;
  }
) {
  const inserts = []; // Inserts that match the query
  const updates: Map<string, any> = new Map(); // all updates (unfiltered)
  for (const [entId, change] of collectionSets) {
    const isInsert = 'id' in change;
    if (isInsert) {
      if (
        doesEntityMatchBasicWhere(
          queryContext.query.collectionName,
          change as DBEntity,
          queryContext.query.where ?? [true],
          queryContext.schema
        )
      ) {
        inserts.push(change);
      }
    } else {
      updates.set(entId, change);
    }
  }

  return { updates, inserts };
}

// type ResultRelationalStructure = {
//   collectionName: string;
//   subqueries: Record<string, ResultRelationalStructure>;
// };

// function queryToRelationalStructure(
//   query: CollectionQuery
// ): ResultRelationalStructure {
//   const { include } = query;
//   const subqueries = {} as Record<string, ResultRelationalStructure>;
//   for (const [key, { subquery }] of Object.entries(include ?? {})) {
//     subqueries[key] = queryToRelationalStructure(subquery);
//   }
//   return {
//     collectionName: query.collectionName,
//     subqueries,
//   };
// }

/**
 * This will take two sets of changes and return a set of changes that need to be applied
 * to the old changes to get the new changes which means modeling missing changes as
 * deletes
 * @param oldChanges
 * @param newChanges
 */
function diffChanges(oldChanges: DBChanges, newChanges: DBChanges): DBChanges {
  const changes = {} as DBChanges;
  const collections = new Set([
    ...Object.keys(oldChanges),
    ...Object.keys(newChanges),
  ]);
  for (const collection of collections) {
    if (!oldChanges[collection]) {
      changes[collection] = newChanges[collection];
      continue;
    }
    if (!newChanges[collection]) {
      changes[collection] = {
        sets: new Map(),
        deletes: new Set(oldChanges[collection].sets.keys()),
      };
      continue;
    }
    const oldCollectionChanges = oldChanges[collection];
    const newCollectionChanges = newChanges[collection];
    const newSets = new Map(newCollectionChanges.sets);
    const newDeletes = new Set(newCollectionChanges.deletes);
    for (const [id, data] of oldCollectionChanges.sets) {
      if (!newSets.has(id)) {
        newDeletes.add(id);
      } else {
        const newData = newSets.get(id);
        if (JSON.stringify(data) !== JSON.stringify(newData)) {
          newSets.set(id, newData);
        } else {
          newSets.delete(id);
        }
      }
    }
    changes[collection] = {
      sets: newSets,
      deletes: newDeletes,
    };
  }
  return changes;
}
