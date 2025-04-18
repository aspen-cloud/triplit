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
  isSubQueryFilter,
  satisfiesNonRelationalFilter,
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
  sortViewEntities,
  ViewEntity,
} from './query-engine.js';
import { bindVariablesInFilters } from './variables.js';
import {
  getCollectionsReferencedInSubqueries,
  hasSubqueryFilterAtAnyLevel,
  hasSubqueryOrderAtAnyLevel,
} from './ivm-utils.js';
import { hashPreparedQuery } from './query/hash-query.js';

interface QueryNode {
  // TODO support multiple root queries (essentially subqueries could be shared between root queries)
  rootQuery: string;
  query: PreparedQuery;
  queryType: 'root' | 'exists' | 'include' | 'order';
}

interface SubscribedQueryInfo {
  ogQuery: PreparedQuery; // Original query
  query: PreparedQuery; // Modified query with exists added to includes
  listeners: Set<SubscriptionCallback>;
  errorCallbacks: Set<(error: Error) => void>;
  uninitializedListeners: WeakSet<SubscriptionCallback>;
  results?: ViewEntity[];
  hasChanged?: boolean;
  collections: Set<string>;
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

  // Individual queries that make up the subscribed queries
  // Each query represents either a root query or a subquery of a subscribed query
  private queryNodes: Record<CollectionNameFromModels<M>, QueryNode[]> =
    {} as any;

  constructor(
    readonly db: DB,
    readonly options: IVMOptions
  ) {}

  subscribe(
    query: PreparedQuery,
    callback: SubscriptionCallback,
    errorCallback?: (error: Error) => void
  ) {
    const rootQueryId = hashPreparedQuery(query);
    if (!this.subscribedQueries.has(rootQueryId)) {
      // Get all collections that are referenced by this root query
      // or one of its subqueries
      this.subscribedQueries.set(rootQueryId, {
        ogQuery: query,
        query,
        listeners: new Set(),
        errorCallbacks: new Set(),
        uninitializedListeners: new WeakSet(),
        results: undefined,
        collections: new Set(
          getCollectionsReferencedInSubqueries(query).get(rootQueryId)!
        ).add(query.collectionName),
      });
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
      }
    };
  }

  private async initializeQueryResults(rootQueryId: number) {
    const query = this.subscribedQueries.get(rootQueryId)!.query;
    const results = (await this.db.rawFetch(query)) as ViewEntity[];
    // So the subscribedQuery might get deleted during the async fetch
    // so we have to check it still exists. We could alternatively just
    // save the query state to a variable before the fetch but I think
    // it's better to leave this as a reminder that this is a potential
    // issue
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
          !rootQueryInfo.hasChanged
        ) {
          continue;
        }
        const results = rootQueryInfo.results;

        rootQueryInfo.uninitializedListeners.delete(listener);
        if (results != null) {
          listener({ results });
        }
      }
      rootQueryInfo.hasChanged = false;
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
      if (!this.subscribedQueries.has(queryId)) {
        logger.warn('Subscribed query not found during update', { queryId });
        continue;
      }
      const queryState = this.subscribedQueries.get(queryId)!;
      const { results, query: rootQuery } = queryState;
      if (
        hasSubqueryFilterAtAnyLevel(rootQuery) ||
        hasSubqueryOrderAtAnyLevel(rootQuery)
      ) {
        const refetchedResults = await this.db.rawFetch(rootQuery);
        queryState.results = refetchedResults as ViewEntity[];
        queryState.hasChanged = true;
      } else {
        const { updatedResults, hasChanged } =
          await this.updateQueryResultsInPlace(results, changes, rootQuery);
        queryState.results = updatedResults;
        queryState.hasChanged = hasChanged;
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
    entityStack: DBEntity[] = []
  ): Promise<{ updatedResults: ViewEntity[]; hasChanged: boolean }> {
    const { collectionName, order, after, limit, where, include } = query;
    // console.dir({ query, results, changes }, { depth: null });
    const collectionChanges = changes[collectionName];
    // console.dir({ collectionChanges, results }, { depth: null });
    let filteredResults = results ?? [];
    const evictedEntities = new Set<string>();
    const addedEntities = new Map<string, DBEntity>();
    // console.log({ inserts, updates, deletes });
    const handledUpdates = new Set<string>();
    const inlineUpdatedEntities = new Set<string>();
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
            handledUpdates.add(entity.data.id);
            deepObjectAssign(entity.data, update);
            matches = matchesWhereOrAfterIfRelevant(entity.data);
            if (matches) {
              inlineUpdatedEntities.add(entity.data.id);
              updateAffectsOrder(update) &&
                inlineUpdatedEntitiesWithOrderRelevantChanges.add(
                  entity.data.id
                );
            }
          }
          if (!matches) {
            evictedEntities.add(entity.data.id);
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
            updatedResults: (await this.db.rawFetch(query)) as ViewEntity[],
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
      for (const entity of filteredResults) {
        // TODO: this should check updated entities too
        // but only updated entities with changes that affect the inclusion
        if (
          addedEntities.has(entity.data.id) ||
          inlineUpdatedEntities.has(entity.data.id)
        ) {
          entitiesToRefetchInclusions.add(entity.data.id);
          continue;
        }
        for (const inclusion in include) {
          // we should be able to skip this if
          // 1. we know the inclusion is a leaf AND
          //    (there are no changes for that collection
          //    OR the changes are just inserts that fail on simple filters)
          // 2. if the inclusion is not a leaf but there are no remaining collection changes
          //    for any subquery
          const { subquery, cardinality } = include[inclusion];
          const updatedEntityStack = entityStack.concat(entity.data);
          const existingInclusion = entity.subqueries[inclusion];
          const { hasChanged, updatedResults } =
            await this.updateQueryResultsInPlace(
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
              updatedEntityStack
            );
          if (hasChanged) {
            inclusionHasUpdated = true;
            entity.subqueries[inclusion] =
              cardinality === 'one'
                ? (updatedResults?.[0] ?? null)
                : updatedResults;
          }
        }
      }
      // instead of fetching here we could first check for memoized subqueries
      if (entitiesToRefetchInclusions.size > 0) {
        const idFilter: PreparedWhere = [
          ['id', 'in', entitiesToRefetchInclusions],
        ];
        const resultsToMerge = await this.db.rawFetch({
          ...query,
          where: where ? where.concat(idFilter) : idFilter,
        });
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

  private getAffectedQueries(changes: DBChanges): Map<number, DBChanges> {
    // TODO  we should probably organize queries by touched collections to make this faster
    const affectedQueries = new Map<number, DBChanges>();
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
