import { Models } from '../schema/index.js';
import {
  Change,
  DBChanges,
  DBEntity,
  Insert,
  PreparedQuery,
  PreparedWhere,
} from '../types.js';
import {
  isBooleanFilter,
  isFilterGroup,
  isSubQueryFilter,
  satisfiesNonRelationalFilter,
} from '../filters.js';
import { DB } from '../db.js';
import { deepObjectAssign } from '../utils/deep-merge.js';
import { isEmpty, SimpleMemoryWriteBuffer } from '../memory-write-buffer.js';
import { EntityDataStore } from '../entity-data-store.js';
import { BTreeKVStore } from '../kv-store/storage/memory-btree.js';
import { satisfiesAfter } from '../after.js';
import { logger } from '@triplit/logger';
import { ValuePointer } from '../utils/value-pointer.js';
import { KVDoubleBuffer } from '../double-buffer.js';
import {
  createViewEntity,
  flattenViews,
  sortViewEntities,
  ViewEntity,
} from '../query-engine.js';
import { bindVariablesInFilters } from '../variables.js';
import { bindViewReferencesInQuery } from './utils.js';
import { hashFilters, hashPreparedQuery } from '../query/hash-query.js';
import {
  addQueryToViewGraph,
  potentiallyRemoveNodeSubtreeFromViewGraph,
  ViewNode,
} from './view-graph.js';

export interface SubscribedQueryInfo {
  query: PreparedQuery; // Original query
  listeners: Set<SubscriptionCallback>;
  errorCallbacks: Set<(error: Error) => void>;
  uninitializedListeners: WeakSet<SubscriptionCallback>;
  rootNode: ViewNode;
}

type SubscriptionCallback = (update: { results: ViewEntity[] }) => void;

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

  // This is a graph of all views extracted from the queries
  // in some cases me way have just one view node per
  // query, in other cases many
  // keyed by the hash of the view
  private viewGraph = new Map<number, ViewNode>();

  constructor(readonly db: DB) {}

  subscribe(
    query: PreparedQuery,
    callback: SubscriptionCallback,
    errorCallback?: (error: Error) => void
  ) {
    const rootQueryId = hashPreparedQuery(query);
    if (!this.subscribedQueries.has(rootQueryId)) {
      const rootNode = addQueryToViewGraph(query, this.viewGraph);
      const subInfo: SubscribedQueryInfo = {
        query: query,
        listeners: new Set(),
        errorCallbacks: new Set(),
        uninitializedListeners: new WeakSet(),
        rootNode,
      };
      this.subscribedQueries.set(rootQueryId, subInfo);
      this.uninitializedQueries.add(rootQueryId);
    }
    const subInfo = this.subscribedQueries.get(rootQueryId)!;

    subInfo.listeners.add(callback);
    subInfo.uninitializedListeners.add(callback);
    if (errorCallback) {
      subInfo.errorCallbacks.add(errorCallback);
    }

    return () => {
      const subToRemove = this.subscribedQueries.get(rootQueryId);
      if (!subToRemove) {
        logger.warn('Query not found', { rootQueryId });
        return;
      }
      potentiallyRemoveNodeSubtreeFromViewGraph(
        subToRemove.rootNode,
        this.viewGraph
      );
      subToRemove.listeners.delete(callback);
      subToRemove.uninitializedListeners.delete(callback);
      if (errorCallback) {
        subToRemove.errorCallbacks.delete(errorCallback);
      }

      if (subToRemove.listeners.size === 0) {
        this.subscribedQueries.delete(rootQueryId);
      }
    };
  }

  private async initializeQueryResults(node: ViewNode): Promise<ViewEntity[]> {
    if (node.results) {
      return node.results;
    }

    let query = node.query;
    // if this query has child views, we need to make sure they've been initialized
    // and then replace the filters that reference them with the values themselves
    if (node.dependsOn.size > 0) {
      if (node.cachedBoundQuery) {
        query = node.cachedBoundQuery;
      } else {
        const views: Record<string, ViewEntity[]> = {};
        for (const [viewReference, relatedNode] of node.dependsOn.entries()) {
          const results = await this.initializeQueryResults(relatedNode);
          // extract the 'view_0' from '$view_0.attribute'
          // TODO: can getVariableComponents work here?
          views[viewReference.split('.')[0].slice(1)] = results;
        }
        // TODO: remove flattenViews, eventually
        query = bindViewReferencesInQuery(query, flattenViews(views));
        node.cachedBoundQuery = query;
      }
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
    const handledRootNodes = new Set<ViewNode>();
    // Iterate through queries and get initial results for ones that don't have any
    for (const queryId of this.uninitializedQueries) {
      const subInfo = this.subscribedQueries.get(queryId);
      // the subInfo may have been removed by the time we call updateViews...
      // usually a fast subscribe/unsubscribe e.g. like you might see
      // with a react effect
      if (subInfo) {
        if (subInfo.rootNode.results == null) {
          await this.initializeQueryResults(subInfo.rootNode);
          handledRootNodes.add(subInfo.rootNode);
        }
      }
      // delete in the loop to .clear() api which is dangerous with async
      this.uninitializedQueries.delete(queryId);
    }

    const affectedQueries =
      this.getAffectedViewsInTopologicalOrder(storeChanges);
    for (const [viewNode, changes] of affectedQueries) {
      // this node was handled during initialization
      if (handledRootNodes.has(viewNode)) {
        continue;
      }

      // if this has an exists subquery or a relational order, hard refetch
      if (viewNode.shouldRefetch) {
        viewNode.results = await this.db.rawFetch(viewNode.query);
        viewNode.hasChanged = true;
        continue;
        // if it has no views, we can just update the results in place
      }
      let haveAnyViewsChanged = false;
      for (const dependsOn of viewNode.dependsOn.values()) {
        if (dependsOn.hasChanged) {
          haveAnyViewsChanged = true;
          break;
        }
      }
      // if the view node has no dependencies or none of them have changed
      // we can do fast in-place updates
      if (!haveAnyViewsChanged) {
        // we have an invariant that except for initialization, a viewNode
        // should always have a cached bound query
        if (viewNode.dependsOn.size > 0 && !viewNode.cachedBoundQuery) {
          throw new Error(
            'View node has dependencies but no cached bound query'
          );
        }
        const { updatedResults, hasChanged } =
          await this.updateQueryResultsInPlace(
            viewNode.results,
            changes,
            viewNode.cachedBoundQuery ?? viewNode.query,
            viewNode.query,
            viewNode
          );
        viewNode.results = updatedResults;
        viewNode.hasChanged = hasChanged;
        continue;
      }

      const views: Record<string, ViewEntity[]> = {};
      for (const [varPath, subNode] of viewNode.dependsOn.entries()) {
        if (!subNode.results) {
          throw new Error(
            'view results not found during update: ' + subNode.results
          );
        }
        // extract the 'view_0' from '$view_0.attribute'
        // TODO: can getVariableComponents work here?
        views[varPath.split('.')[0].slice(1)] = subNode.results;
      }
      const refetchQuery = bindViewReferencesInQuery(
        viewNode.query,
        flattenViews(views)
      );
      viewNode.cachedBoundQuery = refetchQuery;
      viewNode.results = await this.db.rawFetch(refetchQuery);
      viewNode.hasChanged = true;
    }

    const kvTx = this.storage.transact();
    this.doubleBuffer.inactiveBuffer.clear(kvTx);
    await kvTx.commit();
  }

  private async updateQueryResultsInPlace(
    results: ViewEntity[] | undefined,
    changes: DBChanges,
    query: PreparedQuery,
    originalQuery: PreparedQuery,
    node: ViewNode,
    entityStack: DBEntity[] = []
  ): Promise<{ updatedResults: ViewEntity[]; hasChanged: boolean }> {
    const collectionChanges = changes[query.collectionName];
    let filteredResults = results ?? [];
    const evictedEntities = new Map<string, DBEntity>();
    const addedEntities = new Map<string, DBEntity>();
    const handledUpdates = new Map<string, DBEntity>();
    const updatesAppliedInPlace = new Map<string, Change>();

    const { collectionName, where, order, after, limit, include } = query;
    if (collectionChanges) {
      const inlineUpdatedEntitiesWithOrderRelevantChanges = new Set<string>();
      const deletes = collectionChanges.deletes;
      const sets = collectionChanges.sets;
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
              updatesAppliedInPlace.set(entity.data.id, update);
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

      // if we have inserts, we're going to check if they should be added
      // const potentialAdditions: DBEntity[] =
      //   inserts.size > 0 ? Array.from(inserts.values()) : [];

      // any unhandled updates are those that aren't already in the results
      // should also be included in the potential additions
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
      // TODO: figure out more elegant way to pass in this information
      const referencedRelationalVariables =
        node.referencedRelationalVariables.get(
          hashPreparedQuery(originalQuery)
        );
      // only refetch an updated entities if the updated affected
      // the relevant variables
      if (referencedRelationalVariables) {
        updatesAppliedInPlace.entries().forEach(([id, update]) => {
          for (const refdVar of referencedRelationalVariables) {
            if (ValuePointer.Get(update, refdVar) !== undefined) {
              entitiesToRefetchInclusions.add(id);
              break;
            }
          }
        });
      }
      if (filteredResults.length > 0) {
        for (const inclusion in include) {
          const { subquery, cardinality } = include[inclusion];
          const unmodifiedInclusion = originalQuery.include?.[inclusion];
          if (!unmodifiedInclusion) {
            throw new Error(
              'Inclusion is transformed query not found in original query: ' +
                inclusion
            );
          }

          const { subquery: originalSubquery } = unmodifiedInclusion;
          // we can skip the fanout if the subquery or its subqueries doesn't have any relevant changes
          // to process
          const collectionsReferencedInSubqueries =
            node.collectionsReferencedInSubqueries.get(
              hashPreparedQuery(originalSubquery)
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
            const hashedFilters = boundFilters
              ? hashFilters(boundFilters)
              : null;
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
                // TODO: potentially bind these lazily, inside the recursive call
                // perhaps using a filter evaluation utility from the queryEngine
                // there's no guarantee that they will be used (e.g. if we're just
                // process deletes or skipping to the next depth of inclusions)
                // BUT it is helpful for keying the cache of subquery results,
                // though that could be done with a hash of the variables
                where: subquery.where
                  ? bindVariablesInFilters(subquery.where, {
                      entityStack: updatedEntityStack,
                    })
                  : undefined,
              },
              originalSubquery,
              node,
              updatedEntityStack
            );
            const resultsWithCardinalityApplied =
              cardinality === 'one'
                ? (resultsInfo.updatedResults?.[0] ?? null)
                : resultsInfo.updatedResults;
            cachedResults.set(hashedFilters, resultsWithCardinalityApplied);
            entity.subqueries[inclusion] = resultsWithCardinalityApplied;

            if (resultsInfo.hasChanged) {
              inclusionHasUpdated = true;
            }
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

  private getAffectedViewsInTopologicalOrder(
    changes: DBChanges
  ): Map<ViewNode, DBChanges> {
    // TODO  we should probably organize queries by touched collections to make this faster
    const affectedQueries = new Map<ViewNode, DBChanges>();
    for (const node of this.viewGraph.values()) {
      const queryChanges = {} as DBChanges;
      for (const collection in changes) {
        if (
          node.collectionsReferencedInSubqueries.get(node.id)?.has(collection)
        ) {
          queryChanges[collection] = changes[collection];
        }
      }
      if (!isEmpty(queryChanges)) {
        affectedQueries.set(node, queryChanges);
      }
    }
    let nodesToTraverseDependents = new Set(Array.from(affectedQueries.keys()));
    // BFS search of the graph to find all nodes that depend on the affected queries
    while (nodesToTraverseDependents.size > 0) {
      const nextNodes = new Set<ViewNode>();
      for (const dependentNode of nodesToTraverseDependents) {
        for (const reliantNode of dependentNode.usedBy) {
          if (!affectedQueries.has(reliantNode)) {
            affectedQueries.set(reliantNode, {});
            nextNodes.add(reliantNode);
          }
        }
      }
      nodesToTraverseDependents = nextNodes;
    }

    // TODO: use explicitly ordered data structure as opposed to map and set?
    let viewNodesInOrder = new Map<ViewNode, DBChanges>();
    let nodesToPush = new Set<ViewNode>(Array.from(affectedQueries.keys()));
    // topo sort the nodes to push
    while (nodesToPush.size > 0) {
      const nextNodes = new Set<ViewNode>();
      for (const node of nodesToPush) {
        if (node.dependsOn.size === 0) {
          viewNodesInOrder.set(node, affectedQueries.get(node)!);
          continue;
        } else {
          // check if all usedBy nodes are in the final map or not
          // yet to processed
          let allUsedByInFinalMap = true;
          for (const dependentId of node.dependsOn.values()) {
            if (nodesToPush.has(dependentId)) {
              allUsedByInFinalMap = false;
              break;
            }
          }
          if (allUsedByInFinalMap) {
            viewNodesInOrder.set(node, affectedQueries.get(node)!);
            continue;
          }
          nextNodes.add(node);
        }
      }
      nodesToPush = nextNodes;
    }

    return viewNodesInOrder;
  }

  async clear() {
    await this.storage.clear();
    this.subscribedQueries.clear();
    this.uninitializedQueries.clear();
    this.viewGraph.clear();
  }
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
