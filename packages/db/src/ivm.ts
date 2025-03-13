import { CollectionNameFromModels, Models } from './schema/index.js';
import { CollectionQuery, QueryOrder, WhereFilter } from './query.js';
import { DBChanges, DBEntity } from './types.js';
import {
  isSubQueryFilter,
  satisfiesNonRelationalFilter,
  someFilterStatements,
} from './filters.js';
import { DB, DBSchema } from './db.js';
import { deepObjectAssign } from './utils/deep-merge.js';
import {
  areChangesEmpty,
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
        query: createQueryWithRelationalOrderAddedToIncludes(
          createQueryWithExistsAddedToIncludes(query)
        ),
        listeners: new Set(),
        errorCallbacks: new Set(),
        uninitializedListeners: new WeakSet(),
        results: undefined,
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
    const tx = this.storage.transact();
    await this.entityStore.applyChanges(
      tx,
      queryResultsToChanges(results, query),
      {
        checkWritePermission: undefined,
        entityChangeValidator: undefined,
      }
    );
    await tx.commit();
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
    // Iterate through queries and get initial results for ones that don't have any
    for (const queryId of this.subscribedQueries.keys()) {
      if (this.subscribedQueries.get(queryId)!.results == null) {
        await this.initializeQueryResults(queryId);
      }
    }
    const schema = this.db.getSchema();

    // Map from queryId to a set of changes
    // let capturedChanges: Map<string, Record<C, Map<string, any>>> = {} as any;
    const handledRootQueries = new Set<string>();
    for (const collection in storeChanges) {
      const allSetEntities = new Set(storeChanges[collection].sets.keys());
      const allChangedEntities = new Set([
        ...allSetEntities,
        ...storeChanges[collection].deletes,
      ]);
      for (const queryNode of this.queryNodes[collection] ?? []) {
        try {
          // using _mark = performanceTrace('updateViews-query', {
          //   track: 'IVM',
          //   properties: {
          //     collection,
          //     query: JSON.stringify(queryNode.query),
          //     allSetEntities: allSetEntities.size,
          //     allChangedEntities: allChangedEntities.size,
          //   },
          // });
          const rootQueryId = queryNode.rootQuery;
          if (handledRootQueries.has(rootQueryId)) {
            continue;
          }

          // If it's a simple, non-relational query and there are only inserts
          // then we can just update the results directly with all of the changes
          // at once
          if (
            queryNode.queryType === 'root' &&
            !isQueryRelational(queryNode.query) &&
            allSetEntities.size > 0 &&
            storeChanges[collection].deletes.size === 0 &&
            // only inserts
            Array.from(allSetEntities).every((id) =>
              Object.hasOwn(storeChanges[collection].sets.get(id), 'id')
            )
          ) {
            this.handleSimpleInserts({
              allSetEntities,
              queryNode,
              storeChanges,
              schema: schema,
            });
            continue;
          }

          const rootResults = this.subscribedQueries.get(rootQueryId)!.results;
          if (
            !this.options.shouldTrackChanges &&
            (!rootResults || allChangedEntities.size >= rootResults.length)
          ) {
            await this.initializeQueryResults(rootQueryId);
            handledRootQueries.add(rootQueryId);
            this.subscribedQueries.get(rootQueryId)!.hasChanged = true;
            continue;
          }
          let entitiesProcessed = 0;
          for (const entityId of allChangedEntities) {
            if (entitiesProcessed++ % 100 === 0) {
              await yieldToEventLoop();
            }
            const entityBefore = await this.entityStore.getEntity(
              this.storage,
              collection,
              entityId
            );
            const isSet = storeChanges[collection].sets.has(entityId);
            const isDeleted = storeChanges[collection].deletes.has(entityId);
            let entityAfter: DBEntity | undefined = entityBefore;
            if (isDeleted) {
              entityAfter = isSet
                ? (storeChanges[collection].sets.get(entityId)! as DBEntity)
                : undefined;
            } else if (isSet) {
              entityAfter = entityBefore
                ? deepObjectAssign(
                    {},
                    entityBefore,
                    storeChanges[collection].sets.get(entityId)
                  )
                : (storeChanges[collection].sets.get(entityId) as DBEntity);
            }
            const rootQueryState = this.subscribedQueries.get(
              queryNode.rootQuery
            )!;
            if (!rootQueryState) {
              logger.error('Root query state not found', queryNode);
              continue;
            }
            if (!rootQueryState.capturedChanges) {
              rootQueryState.capturedChanges = {} as any;
            }
            const rootQueryChanges = rootQueryState.capturedChanges!;
            if (!(collection in rootQueryChanges)) {
              rootQueryChanges[collection] = {
                sets: new Map(),
                deletes: new Set(),
              };
            }
            const collectionChanges = rootQueryChanges[collection];

            const filtersWithoutVars = queryNode.query.where?.filter(
              (filter) =>
                !(
                  Array.isArray(filter) &&
                  typeof filter[2] === 'string' &&
                  filter[2].startsWith('$')
                )
            ) ?? [true];
            // TODO incorporate possible 'delete' changes
            const entityMatchesBefore =
              entityBefore == null
                ? false
                : doesEntityMatchBasicWhere(
                    collection,
                    entityBefore,
                    filtersWithoutVars,
                    schema
                  ) &&
                  (!queryNode.query.after ||
                    satisfiesAfter(
                      entityBefore,
                      queryNode.query.after,
                      queryNode.query.order
                    ));
            const entityMatchesAfter =
              entityAfter == null
                ? false
                : doesEntityMatchBasicWhere(
                    collection,
                    entityAfter,
                    filtersWithoutVars,
                    schema
                  ) &&
                  (!queryNode.query.after ||
                    satisfiesAfter(
                      entityAfter,
                      queryNode.query.after,
                      queryNode.query.order
                    ));
            const rootQuery = this.subscribedQueries.get(
              queryNode.rootQuery
            )!.query;
            const queryIsRoot = queryNode.queryType === 'root';

            // console.dir(
            //   {
            //     storeChanges,
            //     entityMatchesBefore,
            //     entityMatchesAfter,
            //     entityBefore,
            //     entityAfter,
            //     queryIsRoot,
            //   },
            //   { depth: null }
            // );

            if (!entityMatchesBefore && !entityMatchesAfter) {
              // Do nothing
              continue;
            }

            if (rootQuery.limit != null) {
              // The heuristic here is that a limit query is
              // a. relatively cheap to compute (smaller)
              // b. nearly as expensive to calculate incrementally (backfill) than it
              //    is to calculate the whole thing
              // Therefore we just recalculate the whole thing
              // and diff with the previous results to get the changes
              const newResults = await this.db.rawFetch(rootQuery);
              const currentResults = rootQueryState.results ?? [];
              const currentResultIds = new Set(currentResults.map((r) => r.id));
              const addedResults = newResults.filter(
                (r) => !currentResultIds.has(r.data.id)
              );
              rootQueryState.results = newResults;

              queryResultsToChanges(addedResults, rootQuery, rootQueryChanges);
              if (isDeleted) {
                collectionChanges.deletes.add(entityId);
              } else {
                collectionChanges.sets.set(entityId, entityAfter!);
              }
              continue;
            }

            // Below is a basic truth table for the different cases of matchesBefore and matchesAfter
            if (entityMatchesBefore && entityMatchesAfter) {
              await this.handlePotentialResultUpdate(
                rootQueryState,
                queryNode,
                entityAfter as DBEntity
              );
              continue;
            }

            if (entityMatchesBefore && !entityMatchesAfter) {
              await this.handlePotentialResultEviction(
                rootQueryState,
                queryNode,
                entityBefore as DBEntity | null | undefined,
                entityAfter as DBEntity | null | undefined
              );
              continue;
            }

            if (!entityMatchesBefore && entityMatchesAfter) {
              await this.handlePotentialResultAdditions(
                rootQueryState,
                queryNode,
                entityAfter as DBEntity
              );
              continue;
            }
          }
        } catch (e) {
          logger.error('Error updating views', {
            error: e,
            queryNode,
            collection,
          });
          const errorCallbacks = this.subscribedQueries.get(
            queryNode.rootQuery
          )?.errorCallbacks;
          if (!errorCallbacks) return;
          for (const errorCallback of errorCallbacks) {
            errorCallback(e as Error);
          }
        }
      }
    }
    const kvTx = this.storage.transact();
    await this.entityStore.applyChanges(kvTx, storeChanges, {
      checkWritePermission: undefined,
      entityChangeValidator: undefined,
    });
    await this.doubleBuffer.inactiveBuffer.clear(kvTx);
    await kvTx.commit();
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
    subscribedQueryInfo.capturedChanges![
      queryNode.query.collectionName
    ].sets.set(entityId, entityAfter);

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
          if (Array.isArray(leafValue)) {
            current.subqueries[leaf] = current.subqueries[leaf].filter(
              (r: any) => r.data.id !== entityId
            );
          } else {
            current[leaf] = null;
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
  // TODO support group filters (and, or)
  // TODO: support filters on set/record attributes
  return filters
    .filter(Array.isArray)
    .every((filter) =>
      satisfiesNonRelationalFilter(collectionName, entity, filter, schema)
    );
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
        if (additional == null) {
          return [prop, existing];
        }
        if (existing == null) {
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

/**
 * # Notes and TODOS
 * 1. Initial fetch [DONE!]
 *    - This is tricky because we want subscribers that subscribe to an existing query
 *    - after it's been initialized to get the initial results as changes, however, the
 *    - results themselves are not
 * 2. Batch optimizations
 *    - There's probably a good deal of work we can cut out by observing that a bunch of changes
 *    - can be processed together e.g. inserts are guaranteed to be not match "before" and more so
 *    - if a matching query is a root query with no subqueries they can be added directly to
 *    - the results and even more so if they query has no limit or order it can just be
 *    - quickly appended
 * 3. Stateful fetch [DONE!]
 *    - Our current idea here is to send entityIds that the client has for a given query
 *    - which actually could be quite efficient because we can check to see if those entityIds
 *    - are still in the result set and, for the ones that aren't, we can fetch them for the client
 *    - to invalidate. Effectively this is doing a diff between the client's state and
 *    - the server's state
 */
