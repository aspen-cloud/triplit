import { CollectionNameFromModels, Models } from './schema/index.js';
import {
  Change,
  DBChanges,
  DBEntity,
  Insert,
  PreparedQuery,
  PreparedWhere,
} from './types.js';
import {
  filterStatementIteratorFlat,
  isBooleanFilter,
  isFilterGroup,
  isFilterStatement,
  isSubQueryFilter,
  satisfiesNonRelationalFilter,
  someFilterStatementsFlat,
} from './filters.js';
import { DB } from './db.js';
import { deepObjectAssign } from './utils/deep-merge.js';
import { isEmpty, SimpleMemoryWriteBuffer } from './memory-write-buffer.js';
import { EntityDataStore } from './entity-data-store.js';
import { BTreeKVStore } from './kv-store/storage/memory-btree.js';
import { satisfiesAfter } from './after.js';
import { logger } from '@triplit/logger';
import { ValuePointer } from './utils/value-pointer.js';
import { KVDoubleBuffer } from './double-buffer.js';
import {
  createViewEntity,
  flattenViews,
  sortViewEntities,
  ViewEntity,
} from './query-engine.js';
import { bindVariablesInFilters } from './variables.js';
import {
  getCollectionsReferencedInSubqueries,
  getReferencedRelationalVariables,
  hasSubqueryFilterAtAnyLevel,
  hasSubqueryOrderAtAnyLevel,
} from './ivm-utils.js';
import { hashFilters, hashPreparedQuery } from './query/hash-query.js';
import {
  extractViews,
  statementHasViewReference,
} from './query-planner/query-compiler.js';

interface QueryNode {
  id: number;
  usedBy: Set<number>;
  dependsOn: Map<string, number>;
  cachedWhereClause: PreparedWhere | undefined;
  results?: ViewEntity[];
  query: PreparedQuery;
  shouldRefetch: boolean;
  subscribeInfo: SubscribedQueryInfo | undefined;
  hasChanged: boolean;
  collectionsReferencedInSubqueries: Map<number, Set<string>>;
  referencedRelationalVariables: Map<number, Set<string>>;
}

interface SubscribedQueryInfo {
  ogQuery: PreparedQuery; // Original query
  query: PreparedQuery; // Modified query with exists added to includes
  listeners: Set<SubscriptionCallback>;
  errorCallbacks: Set<(error: Error) => void>;
  uninitializedListeners: WeakSet<SubscriptionCallback>;
  rootNode: QueryNode;
}

type SubscriptionCallback = (update: { results: ViewEntity[] }) => void;

export interface IVMOptions {}

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
  readonly subscribedQueries: Map<number, SubscribedQueryInfo> = new Map();
  readonly uninitializedQueries: Set<number> = new Set();

  // Individual queries that make up the subscribed queries
  // Each query represents either a root query or a subquery of a subscribed query
  private viewNodes = new Map<number, QueryNode>();

  constructor(
    readonly db: DB,
    readonly options: IVMOptions
  ) {}

  createQueryNode(query: PreparedQuery): QueryNode {
    const hashId = hashPreparedQuery(query);
    return {
      id: hashId,
      usedBy: new Set(),
      dependsOn: new Map(),
      results: undefined,
      query,
      shouldRefetch:
        hasSubqueryFilterAtAnyLevel(query) || hasSubqueryOrderAtAnyLevel(query),
      subscribeInfo: undefined,
      hasChanged: false,
      cachedWhereClause: undefined,
      referencedRelationalVariables: getReferencedRelationalVariables(query),
      collectionsReferencedInSubqueries:
        getCollectionsReferencedInSubqueries(query),
    };
  }

  linkFilterReferences(
    parentNode: QueryNode,
    filters: PreparedWhere | undefined,
    lookup: Record<string, QueryNode>
  ) {
    if (!filters) return;
    for (const filter of filterStatementIteratorFlat(filters)) {
      if (isFilterStatement(filter) && statementHasViewReference(filter)) {
        const referencedId = (filter[2] as string).split('.')[0].split('_')[1];
        if (lookup[referencedId]) {
          parentNode.dependsOn.set(
            filter[2] as string,
            lookup[referencedId].id
          );
          lookup[referencedId].usedBy.add(parentNode.id);
        }
      }
    }
  }
  // TODO: handle query hashing collisions
  // we should only hash the query after we've hashed any of its dependsOn
  // because a reference like $view0 could be shared across queries but refer to different views
  createNodesForQuery(query: PreparedQuery) {
    let nextViewId = 0;
    const generateViewId = (): string => `${nextViewId++}`;
    let rootNode = null;
    // try and setup multiple view nodes iff we have a subquery filter
    // that can be inverted
    if (
      query.where &&
      someFilterStatementsFlat(query.where, isSubQueryFilter) &&
      !query.include
    ) {
      const { views, rootQuery } = extractViews(
        structuredClone(query),
        generateViewId
      );
      if (
        rootQuery.where &&
        // check that all subquery filters have been removed
        !someFilterStatementsFlat(rootQuery.where, isSubQueryFilter)
      ) {
        const viewIdMappings = new Map<string, number>();
        rootNode = this.createQueryNode(rootQuery);
        // TODO: cleanup iding
        const viewNodes: Record<string, QueryNode> = {};

        for (const viewId in views) {
          const viewHash = hashPreparedQuery(views[viewId]);
          viewIdMappings.set(viewId, viewHash);
          // we may be able to use the same view node for multiple queries
          if (this.viewNodes.has(viewHash)) {
            viewNodes[viewId] = this.viewNodes.get(viewHash)!;
            continue;
          }
          viewNodes[viewId] = this.createQueryNode(views[viewId]);
          this.viewNodes.set(viewHash, viewNodes[viewId]);
        }

        this.linkFilterReferences(rootNode, rootQuery.where, viewNodes);
        for (const viewId in viewNodes) {
          const viewNode = viewNodes[viewId];
          this.linkFilterReferences(viewNode, viewNode.query.where, viewNodes);
        }
      }
    }
    if (!rootNode) {
      rootNode = this.createQueryNode(query);
    }
    this.viewNodes.set(rootNode.id, rootNode);

    return rootNode;
  }

  subscribe(
    query: PreparedQuery,
    callback: SubscriptionCallback,
    errorCallback?: (error: Error) => void
  ) {
    const rootQueryId = hashPreparedQuery(query);
    if (!this.subscribedQueries.has(rootQueryId)) {
      const rootNode = this.createNodesForQuery(query);
      // Get all collections that are referenced by this root query
      // or one of its subqueries
      const subInfo: SubscribedQueryInfo = {
        ogQuery: query,
        query: query,
        listeners: new Set(),
        errorCallbacks: new Set(),
        uninitializedListeners: new WeakSet(),
        rootNode,
      };
      this.subscribedQueries.set(rootQueryId, subInfo);
      rootNode.subscribeInfo = subInfo;
      this.uninitializedQueries.add(rootQueryId);
      // console.dir(this.viewNodes, { depth: null });
      // console.dir(subInfo, { depth: null });
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
    // console.dir(this.viewNodes, { depth: null });
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
        // TODO: figure out how to cleanup the graph
      }
    };
  }

  private async initializeQueryResults(
    rootQueryId: number
  ): Promise<ViewEntity[]> {
    const node = this.viewNodes.get(rootQueryId);
    if (!node) {
      throw new Error('Root query node not found during initialization');
    }
    if (node.results) {
      return node.results;
    }
    // console.dir(node.query, { depth: null });
    let query = { ...node.query };
    // if this query has child views, we need to make sure they've been initialized
    // and then replace the filters that reference them with the values themselves
    if (node.dependsOn.size > 0 && query.where) {
      const views: Record<string, ViewEntity[]> = {};
      for (const [key, childId] of node.dependsOn.entries()) {
        const results = await this.initializeQueryResults(childId);
        // extract the 'view_0' from '$view_0.attribute'
        // TODO: can getVariableComponents work here?
        views[key.split('.')[0].slice(1)] = results;
      }
      // TODO: remove flattenViews, eventually
      query.where = bindVariablesInFilters(query.where, flattenViews(views));
      node.cachedWhereClause = query.where;
    }
    const results = await this.db.rawFetch(query);
    node.results = results as ViewEntity[];
    return results;
  }

  flushChangesToListeners() {
    for (const queryId of this.subscribedQueries.keys()) {
      const rootQueryInfo = this.subscribedQueries.get(queryId)!;
      for (const listener of rootQueryInfo.listeners) {
        if (!rootQueryInfo.rootNode.results) {
          logger.error('Results not found for query', { queryId });
          continue;
        }
        if (
          !rootQueryInfo.uninitializedListeners.has(listener) &&
          !rootQueryInfo.rootNode.hasChanged
        ) {
          continue;
        }
        const results = rootQueryInfo.rootNode.results;

        rootQueryInfo.uninitializedListeners.delete(listener);
        if (results != null) {
          listener({ results });
        }
      }
      rootQueryInfo.rootNode.hasChanged = false;
    }
  }

  async bufferChanges(newChanges: DBChanges) {
    // TODO evaluate best way to avoid mutation here
    // without doing a potentially expensive clone
    const changes = structuredClone(newChanges);

    // prune empty collection changesets
    for (const collection in changes) {
      if (
        changes[collection].sets.size === 0 &&
        changes[collection].deletes.size === 0
      ) {
        delete changes[collection];
      }
    }
    if (isEmpty(changes)) {
      return;
    }

    const tx = this.storage.transact();
    try {
      if (this.subscribedQueries.size > 0) {
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
    const handledRootQueries = new Set<number>();
    // Iterate through queries and get initial results for ones that don't have any
    for (const queryId of this.uninitializedQueries) {
      const subInfo = this.subscribedQueries.get(queryId);
      if (!subInfo) {
        throw new Error('Subscribed query not found during initialization');
      }
      if (subInfo.rootNode.results == null) {
        await this.initializeQueryResults(subInfo.rootNode.id);
        handledRootQueries.add(subInfo.rootNode.id);
      }
    }
    this.uninitializedQueries.clear();

    const affectedQueries = this.getAffectedQueries(storeChanges);
    for (const [queryId, changes] of affectedQueries) {
      if (handledRootQueries.has(queryId)) {
        continue;
      }
      if (!this.viewNodes.has(queryId)) {
        logger.warn('Subscribed query not found during update', { queryId });
        continue;
      }
      const node = this.viewNodes.get(queryId)!;
      if (node.shouldRefetch) {
        const refetchedResults = await this.db.rawFetch(node.query);
        node.results = refetchedResults as ViewEntity[];
        node.hasChanged = true;
      } else {
        const { updatedResults, hasChanged } =
          await this.updateQueryResultsInPlace(
            node.results,
            changes,
            node.query,
            node
          );
        node.results = updatedResults;
        node.hasChanged = hasChanged;
      }
    }
    const kvTx = this.storage.transact();
    this.doubleBuffer.inactiveBuffer.clear(kvTx);
    await kvTx.commit();
  }

  private async updateQueryResultsInPlace(
    results: ViewEntity[] | undefined,
    changes: DBChanges,
    query: PreparedQuery,
    node: QueryNode,
    entityStack: DBEntity[] = []
  ): Promise<{ updatedResults: ViewEntity[]; hasChanged: boolean }> {
    const { collectionName, order, after, limit, include } = query;
    let where = query.where;
    // console.dir({ query, results, changes }, { depth: null });
    const collectionChanges = changes[collectionName];
    // console.dir({ collectionChanges, results }, { depth: null });
    let filteredResults = results ?? [];
    const evictedEntities = new Map<string, DBEntity>();
    const addedEntities = new Map<string, DBEntity>();
    // console.log({ inserts, updates, deletes });
    const handledUpdates = new Map<string, DBEntity>();
    const inlineUpdatedEntities = new Map<string, DBEntity>();
    if (where && node.dependsOn.size > 0) {
      let haveAnyViewsChanged = false;
      for (const dependsOn of node.dependsOn.values()) {
        if (this.viewNodes.get(dependsOn)?.hasChanged) {
          haveAnyViewsChanged = true;
          break;
        }
      }
      if (!haveAnyViewsChanged && node.cachedWhereClause) {
        where = node.cachedWhereClause;
      } else {
        const views: Record<string, ViewEntity[]> = {};
        for (const [varPath, hashedViewId] of node.dependsOn.entries()) {
          const subNode = this.viewNodes.get(hashedViewId);
          if (!subNode) {
            throw new Error(
              'view node not found during update: ' + hashedViewId
            );
          }
          if (!subNode.results) {
            throw new Error(
              'view results not found during update: ' + hashedViewId
            );
          }
          // extract the 'view_0' from '$view_0.attribute'
          // TODO: can getVariableComponents work here?
          views[varPath.split('.')[0].slice(1)] = subNode.results;
        }
        // TODO: remove flattenViews, eventually
        where = bindVariablesInFilters(where, flattenViews(views));
        node.cachedWhereClause = where;
        return {
          updatedResults: (await this.db.rawFetch({
            ...query,
            where,
          })) as ViewEntity[],
          hasChanged: true,
        };
      }
    }
    if (collectionChanges) {
      const inlineUpdatedEntitiesWithOrderRelevantChanges = new Set<string>();
      const deletes = collectionChanges.deletes;
      const sets = collectionChanges.sets;

      // TODO: bring back this nice inserts/updates delineation
      // when we know that IVM won't receive upserts
      // const inserts = new Map<string, DBEntity>();
      // const updates = new Map<string, Change>();
      // for (const [id, entity] of collectionChanges.sets) {
      //   if (entity.id) {
      //     inserts.set(id, entity as DBEntity);
      //   } else {
      //     updates.set(id, entity as Change);
      //   }
      // }
      const updateAffectsOrder = (update: Change) =>
        order &&
        order.some(
          ([attribute]) => ValuePointer.Get(update, attribute) !== undefined
        );
      const matchesWhereOrAfterIfRelevant = (e: DBEntity) =>
        (!where || doesEntityMatchBasicWhere(e, where)) &&
        (!after || satisfiesAfter(e, after, order));
      // if we have deletes or updates, we're going to check for evictions
      // to the current results
      if (deletes.size > 0 || sets.size > 0) {
        filteredResults = results!.filter((entity) => {
          let matches = true;
          if (deletes.has(entity.data.id)) {
            matches = false;
          }
          if (sets.has(entity.data.id)) {
            const update = sets.get(entity.data.id)!;
            deepObjectAssign(entity.data, update);
            handledUpdates.set(entity.data.id, entity.data);
            matches = matchesWhereOrAfterIfRelevant(entity.data);
            if (matches) {
              inlineUpdatedEntities.set(entity.data.id, entity.data);
              updateAffectsOrder(update) &&
                inlineUpdatedEntitiesWithOrderRelevantChanges.add(
                  entity.data.id
                );
            }
          }
          if (!matches) {
            evictedEntities.set(entity.data.id, entity.data);
          }
          return matches;
        });
        // if we have evictions and we were previously at the limit
        // we need to check if we need to backfill
        // TODO: this could be refined more in the case that we know the new entity is
        // to be ahead of or behind the current results
        // TODO: if this query is not the root, we should probably bubble this up as an indication to refetch
        if (
          limit &&
          results!.length === limit &&
          (evictedEntities.size > 0 ||
            (inlineUpdatedEntitiesWithOrderRelevantChanges.size > 0 && order))
        ) {
          return {
            updatedResults: (await this.db.rawFetch(query, {
              entityStack,
            })) as ViewEntity[],
            hasChanged: true,
          };
        }
      }
      // console.dir({ after: filteredResults }, { depth: null });
      // if we have inserts, we're going to check if they should be added
      // const potentialAdditions: DBEntity[] =
      //   inserts.size > 0 ? Array.from(inserts.values()) : [];

      // any unhandled updates are those that aren't already in the results
      // should also be included in the potential additions
      // console.dir({ handledUpdates, updates }, { depth: null });
      for (const [id, change] of sets) {
        if (handledUpdates.has(id)) {
          continue;
        }
        if (changeIsInsert(change)) {
          if (matchesWhereOrAfterIfRelevant(change)) {
            addedEntities.set(id, change);
            filteredResults.push(createViewEntity(change));
          }
          continue;
        }
        // if we know that the change is an update, we can say it's
        // been considered for this query previously. this clause essentially
        // says if the update doesn't give us a reason to reconsider
        // that decision, we can skip it
        if (
          where &&
          !doesUpdateImpactSimpleFilters(change, where) &&
          !updateAffectsOrder(change)
        ) {
          continue;
        }
        const sourceEntity = await this.db.entityStore.getEntity(
          this.db.kv,
          collectionName,
          id
        );
        if (sourceEntity == null) {
          continue;
        }
        if (matchesWhereOrAfterIfRelevant(sourceEntity)) {
          addedEntities.set(sourceEntity.id, sourceEntity);
          filteredResults.push(createViewEntity(sourceEntity));
        }
      }

      // TODO: if relational order, do this after updating inclusions
      // TODO: only sort if there are changes that affect the order
      if (
        order != null &&
        !(
          addedEntities.size === 0 &&
          inlineUpdatedEntitiesWithOrderRelevantChanges.size === 0
        )
      ) {
        sortViewEntities(filteredResults, order);
      }
      if (limit != null && filteredResults.length > limit) {
        for (let i = limit; i < filteredResults.length; i++) {
          const entity = filteredResults[i];
          // remove added entities that fell outside of the limit
          if (addedEntities.has(entity.data.id)) {
            addedEntities.delete(entity.data.id);
          }
        }
        filteredResults = filteredResults.slice(0, limit);
      }
    }
    let inclusionHasUpdated = false;

    if (include) {
      const entitiesToRefetchInclusions = new Set<string>();
      addedEntities.keys().forEach((id) => {
        entitiesToRefetchInclusions.add(id);
      });
      const referencedRelationalVariables =
        node.referencedRelationalVariables.get(hashPreparedQuery(query));
      // only refetch an updated entities if the updated affected
      // the relevant variables
      if (referencedRelationalVariables) {
        inlineUpdatedEntities.entries().forEach(([id, update]) => {
          for (const refdVar of referencedRelationalVariables) {
            if (ValuePointer.Get(update, refdVar) !== undefined) {
              entitiesToRefetchInclusions.add(id);
              break;
            }
          }
        });
      }
      for (const inclusion in include) {
        const { subquery, cardinality } = include[inclusion];
        // we can skip the fanout if the subquery or its subqueries doesn't have any relevant changes
        // to process
        const collectionsReferencedInSubqueries =
          node.collectionsReferencedInSubqueries.get(
            hashPreparedQuery(subquery)
          );
        if (!collectionsReferencedInSubqueries) {
          throw new Error(
            'Subquery not found in collectionsReferencedInSubqueries'
          );
        }
        let subqueryHasChangesToConsume = false;
        for (const collection of collectionsReferencedInSubqueries) {
          if (changes[collection]) {
            subqueryHasChangesToConsume = true;
            break;
          }
        }
        if (!subqueryHasChangesToConsume) {
          continue;
        }
        const cachedResults = new Map<number | null, any>();
        for (const entity of filteredResults) {
          // TODO: this should check updated entities too
          // but only updated entities with changes that affect the inclusion
          if (entitiesToRefetchInclusions.has(entity.data.id)) {
            continue;
          }
          const updatedEntityStack = entityStack.concat(entity.data);
          const existingInclusion = entity.subqueries[inclusion];
          const boundFilters = subquery.where
            ? bindVariablesInFilters(subquery.where, {
                entityStack: updatedEntityStack,
              })
            : null;
          const hashedFilters = boundFilters ? hashFilters(boundFilters) : null;
          if (cachedResults.has(hashedFilters)) {
            entity.subqueries[inclusion] = cachedResults.get(hashedFilters);
            continue;
          }
          const resultsInfo = await this.updateQueryResultsInPlace(
            Array.isArray(existingInclusion)
              ? existingInclusion
              : existingInclusion === null
                ? []
                : [existingInclusion],
            changes,
            {
              ...subquery,
              where: subquery.where
                ? bindVariablesInFilters(subquery.where, {
                    entityStack: updatedEntityStack,
                  })
                : undefined,
            },
            node,
            updatedEntityStack
          );
          const resultsWithCardinalityApplies =
            cardinality === 'one'
              ? (resultsInfo.updatedResults?.[0] ?? null)
              : resultsInfo.updatedResults;
          cachedResults.set(hashedFilters, resultsWithCardinalityApplies);
          entity.subqueries[inclusion] = resultsWithCardinalityApplies;

          if (resultsInfo.hasChanged) {
            inclusionHasUpdated = true;
          }
        }
      }
      // instead of fetching here we could first check for memoized subqueries
      if (entitiesToRefetchInclusions.size > 0) {
        const idFilter: PreparedWhere = [
          ['id', 'in', entitiesToRefetchInclusions],
        ];
        const resultsToMerge = await this.db.rawFetch(
          {
            ...query,
            where: where ? where.concat(idFilter) : idFilter,
          },
          { entityStack: entityStack }
        );
        for (const result of resultsToMerge) {
          const index = filteredResults.findIndex(
            (r) => r.data.id === result.data.id
          );
          filteredResults[index] = result;
        }
      }
    }
    /**
     * changeset is:
     * - evictedEntities ∩ deletes (would also be previously seen entities)
     * - handledUpdates ∩ sets (would also be previously seen entities)
     * - addedEntities (after limit applied?) -> changeset (add to previously seen)
     * - recursive changes
     */
    return {
      updatedResults: filteredResults,
      hasChanged:
        evictedEntities.size > 0 ||
        addedEntities.size > 0 ||
        handledUpdates.size > 0 ||
        inclusionHasUpdated,
    };
  }

  changeIsInsert(change: Change): change is Insert {
    return change.id !== undefined;
  }

  // TODO: this should produce an ordered array? map? of queries with a topological sort
  // where the nodes that depend on other nodes are after them
  private getAffectedQueries(changes: DBChanges): Map<number, DBChanges> {
    // TODO  we should probably organize queries by touched collections to make this faster
    const affectedQueries = new Map<number, DBChanges>();
    for (const queryId of this.viewNodes.keys()) {
      const queryState = this.viewNodes.get(queryId)!;
      const queryChanges = {} as DBChanges;
      for (const collection in changes) {
        if (
          queryState.collectionsReferencedInSubqueries
            .get(queryId)
            ?.has(collection)
        ) {
          queryChanges[collection] = changes[collection];
        }
      }
      if (!isEmpty(queryChanges)) {
        affectedQueries.set(queryId, queryChanges);
      }
      for (const usedByNodeId of queryState.usedBy) {
        if (!affectedQueries.has(usedByNodeId)) {
          affectedQueries.set(usedByNodeId, {});
        }
      }
    }
    return affectedQueries;
  }

  async clear() {
    await this.storage.clear();
    this.subscribedQueries.clear();
  }
}

export function queryResultsToChanges<C extends string>(
  results: ViewEntity[],
  query: PreparedQuery,
  changes: DBChanges = {}
) {
  const collection = query.collectionName as C;
  if (!changes[collection]) {
    changes[collection] = { sets: new Map(), deletes: new Set() };
  }
  const include = query.include ?? {};
  for (const result of results) {
    changes[collection].sets.set(result.data.id, result.data);
    for (const [key, { subquery }] of Object.entries(include)) {
      const subqueryResults = result.subqueries[key];
      if (subqueryResults == null) {
        continue;
      }
      queryResultsToChanges(
        Array.isArray(subqueryResults) ? subqueryResults : [subqueryResults],
        subquery,
        changes
      );
    }
  }
  return changes;
}

export function createQueryWithExistsAddedToIncludes(
  query: PreparedQuery
): PreparedQuery {
  const newQuery = structuredClone(query);
  let i = 0;
  if (newQuery.where) {
    for (const filter of filterStatementIteratorFlat(newQuery.where)) {
      if (isSubQueryFilter(filter)) {
        if (!newQuery.include) {
          newQuery.include = {};
        }
        newQuery.include[`_exists-${i}`] = {
          subquery: createQueryWithExistsAddedToIncludes(filter.exists),
          cardinality: 'one',
        };
        i++;
      }
    }
  }
  return newQuery;
}

export function createQueryWithRelationalOrderAddedToIncludes(
  query: PreparedQuery
) {
  if (!query.order) return query;
  const newQuery = structuredClone(query);
  // TODO: update QueryOrder type to include potential subquery
  for (const [attribute, _direction, subquery] of newQuery.order!) {
    if (!subquery) continue;
    newQuery.include = {
      ...newQuery.include,
      [attribute]: subquery,
    };
  }
  return newQuery;
}

function doesEntityMatchBasicWhere(entity: DBEntity, filters: PreparedWhere) {
  return filters.every((filter) =>
    satisfiesNonRelationalFilter(entity, filter, true)
  );
}

function doesUpdateImpactSimpleFilters(
  entity: Change,
  filters: PreparedWhere
): boolean {
  return filters.some((filter) => {
    if (isBooleanFilter(filter)) {
      return false;
    }
    if (isFilterGroup(filter)) {
      return doesUpdateImpactSimpleFilters(entity, filter.filters);
    }
    if (isSubQueryFilter(filter)) {
      throw new Error('Subquery filters are not supported in this context');
    }
    const attributePath = filter[0].split('.');
    // TODO handle nested attributes
    // e.g. some record assignment like entity.auth = {} could affect "entity.author.name"
    const value = ValuePointer.Get(entity, attributePath);
    return value !== undefined;
  });
}

function changeIsInsert(change: Change): change is Insert {
  return change.id !== undefined;
}

/**
 * This will take two sets of changes and return a set of changes that need to be applied
 * to the old changes to get the new changes which means modeling missing changes as
 * deletes
 * @param oldChanges
 * @param newChanges
 */
export function diffChanges(
  oldChanges: DBChanges,
  newChanges: DBChanges
): DBChanges {
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
        // safe because we are in the block where we know the id exists
        const newData = newSets.get(id)!;
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
