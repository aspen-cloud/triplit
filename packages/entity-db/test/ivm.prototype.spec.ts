import { describe, test, expect, vi, beforeEach } from 'vitest';

type Operators = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'in';

/**
 * A query object that can be used to query the database
 * where statements are simple filters and treated as AND
 * exists statements are subqueries that act like where statements and are true if the subquery returns any results
 *
 * Operators can contain variables that refer to the parent query e.g. { collection: 'users', where: [['id', '=', '$ownerId']] }
 */
type Query = {
  collection: string;
  where: [string, Operators, any][];
  order?: [string, 'asc' | 'desc'][];
  limit?: number;
  // A relational filter that requires each query to return at least one result
  exists?: Query[];
  // An unconditional subquery that attaches the queries results to the return result
  include?: Record<string, Query>;
};

type StoreChanges<C extends string> = Record<
  C,
  Map<string, { before: any; after: any }>
>;

class SimpleDB<C extends string, T extends Record<C, { id: string }>> {
  collections: Record<keyof T, Map<string, T[C]>> = {} as any;
  changesBuffer: Record<keyof T, Map<string, T[C] | null>> = {} as any;

  constructor(public readonly schema: T) {
    for (const collection in schema) {
      this.collections[collection] = new Map();
      this.changesBuffer[collection] = new Map();
    }
  }

  static entityMatchesQueryFilters(entity: any, filters: Query['where']) {
    if (entity == null) {
      throw new Error('Entity is null');
    }
    if (filters.length === 0) return true;
    return filters.every(([field, operator, value]) => {
      if (operator === '=') {
        return entity[field] === value;
      } else if (operator === '!=') {
        return entity[field] !== value;
      } else if (operator === '<') {
        return entity[field] < value;
      } else if (operator === '<=') {
        return entity[field] <= value;
      } else if (operator === '>') {
        return entity[field] > value;
      } else if (operator === '>=') {
        return entity[field] >= value;
      } else if (operator === 'in') {
        return value.includes(entity[field]);
      }
      return false;
    });
  }

  fetch(query: Query) {
    const collection = this.collections[query.collection];
    if (!collection) {
      return [];
    }

    const results = this.getUnifiedViewOfCollection(query.collection);
    return results
      .filter((result: any) => {
        if (!SimpleDB.entityMatchesQueryFilters(result, query.where)) {
          return false;
        }

        for (const subquery of query.exists ?? []) {
          const queryWithBoundVariables: Query = {
            ...subquery,
            where: subquery.where.map(([field, operator, value]) => {
              if (typeof value === 'string' && value.startsWith('$')) {
                const propertyName = value.slice(1);
                // const parentValue = query.where.find(
                //   ([field]) => field === propertyName
                // );
                const parentValue = result[propertyName];
                if (!parentValue) {
                  throw new Error(
                    `Variable ${propertyName} not found in parent query`
                  );
                }
                return [field, operator, parentValue];
              }
              return [field, operator, value];
            }),
          };
          const subqueryResults = this.fetch(queryWithBoundVariables);
          if (subqueryResults.length === 0) {
            return false;
          }
        }
        return true;
      })
      .map((result) => {
        const include = query.include ?? {};
        const includedResults: Record<string, any> = Object.fromEntries(
          Object.entries(include).map(([key, subquery]) => [
            key,
            this.fetch({
              ...subquery,
              where: subquery.where.map(([field, operator, value]) => {
                if (typeof value === 'string' && value.startsWith('$')) {
                  const propertyName = value.slice(1);
                  return [field, operator, result[propertyName]];
                }
                return [field, operator, value];
              }),
            }),
          ])
        );
        return { ...result, ...includedResults };
      })
      .toSorted((a, b) =>
        query.order
          ? query.order.reduce((acc, [field, order]) => {
              if (acc !== 0) return acc;
              if (a[field] < b[field]) return order === 'asc' ? -1 : 1;
              if (a[field] > b[field]) return order === 'asc' ? 1 : -1;
              return 0;
            }, 0)
          : 0
      )
      .slice(0, query.limit);
  }

  private getUnifiedViewOfCollection(collection: string): T[C][] {
    const primaryCollection = this.collections[collection];
    const changesCollection = this.changesBuffer[collection];
    return Array.from(
      new Set([
        ...(primaryCollection?.keys() ?? []),
        ...(changesCollection?.keys() ?? []),
      ])
    ).reduce((acc: T[C][], curr: string) => {
      if (primaryCollection.has(curr) && changesCollection.has(curr)) {
        if (changesCollection.get(curr) === null) {
          return acc;
        } else {
          return [
            ...acc,
            { ...primaryCollection.get(curr), ...changesCollection.get(curr) },
          ];
        }
      }
      if (primaryCollection.has(curr)) {
        return [...acc, primaryCollection.get(curr)];
      }
      if (changesCollection.has(curr)) {
        if (changesCollection.get(curr) === null) {
          return acc;
        } else {
          return [...acc, changesCollection.get(curr)];
        }
      }
      throw new Error('This should never happen');
    }, []);
  }

  insert(collection: keyof T, data: T[C]) {
    if (!(collection in this.collections)) {
      this.collections[collection] = new Map();
    }
    this.changesBuffer[collection].set(data.id, data);
  }

  update(collection: keyof T, id: string, data: Partial<T[C]>) {
    if (!(collection in this.collections)) {
      this.collections[collection] = new Map();
    }
    const mergedData = {
      ...this.collections[collection].get(id),
      ...data,
      id,
    } as T[C];
    this.changesBuffer[collection].set(id, mergedData);
  }

  delete(collection: keyof T, id: string) {
    if (!(collection in this.collections)) {
      this.collections[collection] = new Map();
    }
    // this.collections[collection].delete(id);
    this.changesBuffer[collection].set(id, null);
  }

  flushChanges(): StoreChanges<C> {
    const changeReport = Object.fromEntries(
      Object.keys(this.changesBuffer).map((collection) => [
        collection,
        new Map(),
      ])
    ) as Record<
      keyof T,
      Map<string, { before: T[C] | null; after: T[C] | null }>
    >;
    for (const collection in this.changesBuffer) {
      for (const [id, change] of this.changesBuffer[collection]) {
        const before = !this.collections[collection].has(id)
          ? null
          : structuredClone(this.collections[collection].get(id) ?? null);

        const after = change === null ? null : { ...before, ...change };
        changeReport[collection].set(id, {
          before,
          after,
        });
        if (after === null) {
          this.collections[collection].delete(id);
        } else {
          this.collections[collection].set(id, after);
        }
      }
      this.changesBuffer[collection] = new Map();
    }
    return changeReport;
  }
}

function queryResultsToChanges<C extends string>(
  results: any[],
  query: Query,
  changes: Record<C, Map<string, any>> = {}
) {
  const collection = query.collection as C;
  if (!changes[collection]) {
    changes[collection] = new Map();
  }
  const include = query.include ?? {};
  for (const result of results) {
    changes[collection].set(result.id, entityWithoutIncludes(result, query));
    for (const [key, subquery] of Object.entries(include)) {
      queryResultsToChanges(result[key], subquery, changes);
    }
  }
  return changes;
}

function entityWithoutIncludes(entity: any, query: Query) {
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

function createQueryWithExistsAsIncludes(query: Query): Query {
  const newQuery = { ...query };
  if (newQuery.exists) {
    newQuery.include = Object.fromEntries(
      newQuery.exists.map((subquery, i) => [
        `_exists-${i}`,
        { ...createQueryWithExistsAsIncludes(subquery), limit: 1 },
      ])
    );
  }
  return newQuery;
}

function removeInternalIncludesFromResults(results: any[]) {
  return results.map((result) => {
    const cleaned = { ...result };
    for (const key in cleaned) {
      if (key.startsWith('_')) {
        delete cleaned[key];
      }
    }
    return cleaned;
  });
}

class IVM<C extends string, T extends Record<C, { id: string }>> {
  readonly subscribedQueries: Map<
    string,
    {
      query: Query;
      listeners: Set<(results: any) => void>;
      results?: any[];
      capturedChanges?: Record<C, Map<string, any>>;
    }
  > = new Map();
  private queryNodes: Record<
    C,
    {
      rootQuery: string;
      query: Query;
    }[]
  > = {} as any;
  // Map from query ID to query view/result
  // private queryViews: Map<string, any> = new Map();

  constructor(readonly entityStore: SimpleDB<C, T>) {}

  subscribe(query: Query, callback: (results: any) => void) {
    const rootQueryId = JSON.stringify(query);
    if (!this.subscribedQueries.has(rootQueryId)) {
      this.subscribedQueries.set(rootQueryId, {
        query,
        listeners: new Set(),
        results: [],
      });
      const queryWithSecretIncludes = createQueryWithExistsAsIncludes(query);
      const results = this.entityStore.fetch(queryWithSecretIncludes);
      const changes = queryResultsToChanges(results, queryWithSecretIncludes);

      // Remove the secret includes
      const cleanedResults = removeInternalIncludesFromResults(results);
      this.subscribedQueries.get(rootQueryId)!.results = cleanedResults;
      this.subscribedQueries.get(rootQueryId)!.capturedChanges = changes;
      this.createQueryNodesForRootQuery(rootQueryId, query);
      // this.createQueryNodesForRootQuery(rootQueryId, queryWithSecretIncludes);
    }

    this.subscribedQueries.get(rootQueryId)!.listeners.add(callback);

    return () => {
      this.subscribedQueries.get(rootQueryId)!.listeners.delete(callback);

      if (this.subscribedQueries.get(rootQueryId)!.listeners.size === 0) {
        this.subscribedQueries.delete(rootQueryId);
      }
    };
  }

  flushChangesToListeners() {
    for (const queryId of this.subscribedQueries.keys()) {
      const query = this.subscribedQueries.get(queryId)!;
      // TODO add optimization to skip queries that haven't changed
      // if (!query.capturedChanges) continue;
      for (const listener of query.listeners) {
        listener({ results: query.results, changes: query.capturedChanges });
      }
      query.capturedChanges = undefined;
    }
  }

  private createQueryNodesForRootQuery(queryId: string, query: Query) {
    const collection = query.collection as C;
    if (!this.queryNodes[collection]) {
      this.queryNodes[collection] = [];
    }
    this.queryNodes[collection].push({ rootQuery: queryId, query });
    for (const subquery of query.exists ?? []) {
      this.createQueryNodesForRootQuery(queryId, subquery);
    }
  }

  updateViews(storeChanges: StoreChanges<C>): void {
    // Map from queryId to a set of changes
    // let capturedChanges: Map<string, Record<C, Map<string, any>>> = {} as any;
    for (const collection in storeChanges) {
      for (const [entityId, change] of storeChanges[collection]) {
        for (const queryNode of this.queryNodes[collection] ?? []) {
          const rootQueryState = this.subscribedQueries.get(
            queryNode.rootQuery
          )!;
          if (!rootQueryState.capturedChanges) {
            rootQueryState.capturedChanges = {} as any;
          }
          const rootQueryChanges = rootQueryState.capturedChanges!;
          if (!(collection in rootQueryChanges)) {
            rootQueryChanges[collection] = new Map();
          }
          const collectionChanges = rootQueryChanges[collection];

          const filtersWithoutVars = queryNode.query.where.filter(
            (filter) =>
              !(typeof filter[2] === 'string' && filter[2].startsWith('$'))
          );
          const entityMatchesBefore =
            change.before === null
              ? false
              : SimpleDB.entityMatchesQueryFilters(
                  change.before,
                  filtersWithoutVars
                );
          const entityMatchesAfter =
            change.after === null
              ? false
              : SimpleDB.entityMatchesQueryFilters(
                  change.after,
                  filtersWithoutVars
                );

          // Below is a basic truth table for the different cases of matchesBefore and matchesAfter
          if (entityMatchesBefore && entityMatchesAfter) {
            // Do nothing (maybe update specific entity)
            continue;
          }
          if (!entityMatchesBefore && !entityMatchesAfter) {
            // Do nothing
            continue;
          }
          if (entityMatchesBefore || entityMatchesAfter) {
            // It's not guaranteed that just because an change causes an entity to no longer match that it will necessarily cause a result
            // to be evicted from from the root query because some other entity might server as a substitute and satisfy the subquery.
            // So we need to check if the entity that was removed was the only entity that satisfied the subquery
            const rootQuery = this.subscribedQueries.get(
              queryNode.rootQuery
            )!.query;

            let resultsIdsToRemove: Set<string>;
            const queryIsRoot = queryNode.query === rootQuery;
            if (rootQuery.limit != null) {
              // The heuristic here is that a limit query is
              // a. relatively cheap to compute (smaller)
              // b. nearly as expensive to calculate incrementally (backfill) than it
              //    is to calculate the whole thing
              // Therefore we just recalculate the whole thing
              // and diff with the previous results to get the changes
              const newResults = this.entityStore.fetch(rootQuery);
              const currentResults = rootQueryState.results ?? [];
              const addedResults = newResults.filter(
                (r) => !currentResults.includes(r)
              );
              rootQueryState.results = newResults;
              queryResultsToChanges(newResults, rootQuery, rootQueryChanges);
              collectionChanges.set(entityId, change.after);
              continue;
            }
            if (queryIsRoot) {
              resultsIdsToRemove = new Set([entityId]);
            } else {
              let queryWithBoundVariables =
                change.after === null
                  ? mapQueryRecursive(rootQuery, (query) => {
                      if (
                        JSON.stringify(query) ===
                        JSON.stringify(queryNode.query)
                      ) {
                        return null;
                      }
                      // In the case where the entity was deleted we want to basically bind any of it's variables to the parent query
                      const matchingSubQuery = query.exists?.find(
                        (subquery) =>
                          JSON.stringify(subquery) ===
                          JSON.stringify(queryNode.query)
                      );
                      if (!matchingSubQuery) return query;
                      const variablesInSubQuery = matchingSubQuery.where.filter(
                        (filter) =>
                          typeof filter[2] === 'string' &&
                          filter[2].startsWith('$')
                      );
                      // This currently assumes all relational variables are using equality operator
                      const reversedVariables: Query['where'] =
                        variablesInSubQuery.map(([field, operator, value]) => [
                          value.slice(1),
                          '=',
                          change.before[field],
                        ]);
                      return {
                        ...query,
                        where: query.where.concat(reversedVariables),
                      };
                    })
                  : mapQueryRecursive(rootQuery, (query, depth) => {
                      // Assumes that the query node has referential equality with the query in the subscribedQueries map
                      // if (query === queryNode.query) return query;
                      if (
                        JSON.stringify(query) !==
                        JSON.stringify(queryNode.query)
                      )
                        return query;
                      return {
                        ...query,
                        // We need to remove all non-variable filters and add the entityId filter
                        where: query.where
                          .filter(
                            (filter) =>
                              typeof filter[2] === 'string' &&
                              filter[2].startsWith('$')
                          )
                          .concat([['id', '=', entityId]]),
                      };
                    });

              // TODO I don't think a suspected result wouldn't be in the result set
              // but maybe it's a good idea to check
              const suspectResults = this.entityStore.fetch(
                queryWithBoundVariables!
              );

              // Now we need to check that the results are still part of the result set
              const verificationQuery = {
                ...rootQuery,
                where: [
                  ...rootQuery.where,
                  ['id', 'in', suspectResults.map((r) => r.id)],
                ] as Query['where'],
              };

              // These entities are still part of the result set and connected to the entity that was removed
              const positiveEntities =
                this.entityStore.fetch(verificationQuery);

              // Basically need to remove the entities from the result set that are in the suspectResults and not in the positiveEntities
              // and then emit a new result
              resultsIdsToRemove = new Set(
                suspectResults
                  .filter((r) => !positiveEntities.includes(r))
                  .map((r) => r.id)
              );
            }

            if (resultsIdsToRemove.size > 0) {
              collectionChanges.set(entityId, change.after);

              const currentResults = rootQueryState.results ?? [];
              const newResults = currentResults.filter(
                (r) => !resultsIdsToRemove.has(r.id)
              );
              rootQueryState.results = newResults;
            }
          }

          if (!entityMatchesBefore && entityMatchesAfter) {
            // Bind to value to query variables and then run root query and emit a new result
            const rootQuery = this.subscribedQueries.get(
              queryNode.rootQuery
            )!.query;
            const queryWithBoundVariables = mapQueryRecursive(
              rootQuery,
              (query) => {
                // Assumes that the query node has referential equality with the query in the subscribedQueries map
                // if (query !== queryNode.query) return query;
                if (JSON.stringify(query) !== JSON.stringify(queryNode.query))
                  return query;
                return {
                  ...query,
                  where: query.where
                    .filter(
                      (filter) =>
                        typeof filter[2] == 'string' &&
                        filter[2].startsWith('$')
                    )
                    .concat([['id', '=', entityId]]),
                };
              }
            );

            const queryWithSecretIncludes = createQueryWithExistsAsIncludes(
              queryWithBoundVariables
            );
            // These results represent only a subset of the results that are part of the root query
            const partialResults = this.entityStore.fetch(
              queryWithSecretIncludes
            );
            const currentResultIds = new Set(
              rootQueryState.results?.map((r) => r.id) ?? []
            );
            const addedResults = partialResults.filter(
              (r) => !currentResultIds.has(r.id)
            );
            if (addedResults.length === 0) {
              continue;
            }
            // implicitly mutating the root query state
            queryResultsToChanges(
              addedResults,
              queryWithSecretIncludes,
              rootQueryChanges
            );
            collectionChanges.set(entityId, change.after);
            // We need to merge the partial results with the current results
            // and ensure we don't have duplicates
            const newResults = [
              ...(rootQueryState.results ?? []),
              ...removeInternalIncludesFromResults(addedResults),
            ];
            rootQueryState.results = newResults;
          }
        }
      }
    }
  }
}

function mapQueryRecursive(
  query: Query,
  mapFunc: (query: Query, depth: number) => Query | null,
  depth = 0
): Query | null {
  const mappedQuery = mapFunc(query, depth);
  if (mappedQuery == null) {
    return null;
  }
  return {
    ...mappedQuery,
    exists: query.exists
      ?.map((subquery) => mapQueryRecursive(subquery, mapFunc, depth + 1))
      .filter((q) => q != null),
  };
}

describe('SimpleDB', () => {
  test('can insert data', () => {
    const db = new SimpleDB({
      users: { id: '' },
    });

    db.insert('users', { id: '1' });
    db.insert('users', { id: '2' });
    db.insert('users', { id: '3' });
    db.flushChanges();

    expect(db.collections.users.size).toBe(3);
    expect(db.collections.users.get('1')).toEqual({ id: '1' });
    expect(db.collections.users.get('2')).toEqual({ id: '2' });
    expect(db.collections.users.get('3')).toEqual({ id: '3' });
  });

  test('can update data', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });

    db.update('users', '1', { name: 'Charlie' });
    db.update('users', '2', { name: 'David' });
    db.flushChanges();

    expect(db.collections.users.size).toBe(2);
    expect(db.collections.users.get('1')).toEqual({ id: '1', name: 'Charlie' });
    expect(db.collections.users.get('2')).toEqual({ id: '2', name: 'David' });
  });

  test('can delete data', () => {
    const db = new SimpleDB({
      users: { id: '' },
    });

    db.insert('users', { id: '1' });
    db.insert('users', { id: '2' });
    db.insert('users', { id: '3' });

    db.delete('users', '2');

    db.flushChanges();

    expect(db.collections.users.size).toBe(2);
    expect(db.collections.users.get('1')).toEqual({ id: '1' });
    expect(db.collections.users.get('2')).toBeUndefined();
    expect(db.collections.users.get('3')).toEqual({ id: '3' });
  });

  test('can fetch data with simple where clause', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });
    db.insert('users', { id: '3', name: 'Charlie' });

    const results = db.fetch({
      collection: 'users',
      where: [['name', '=', 'Bob']],
      exists: [],
    });

    expect(results.length).toBe(1);
    expect(results[0]).toEqual({ id: '2', name: 'Bob' });
  });

  test('can fetch data with simple where clause and multiple results', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });
    db.insert('users', { id: '3', name: 'Charlie' });

    const results = db.fetch({
      collection: 'users',
      where: [['name', '!=', 'Alice']],
      exists: [],
    });

    expect(results.length).toBe(2);
    expect(results[0]).toEqual({ id: '2', name: 'Bob' });
    expect(results[1]).toEqual({ id: '3', name: 'Charlie' });
  });

  test('can fetch data with where clause with multiple operators', () => {
    const db = new SimpleDB({
      users: { id: '', age: 0 },
    });

    db.insert('users', { id: '1', age: 20 });
    db.insert('users', { id: '2', age: 30 });
    db.insert('users', { id: '3', age: 40 });

    const results = db.fetch({
      collection: 'users',
      where: [
        ['age', '>', 20],
        ['age', '<', 40],
      ],
      exists: [],
    });

    expect(results.length).toBe(1);
    expect(results[0]).toEqual({ id: '2', age: 30 });
  });

  describe('can fetch data with exists clause', () => {
    test('can fetch data with single level subquery', () => {
      const db = new SimpleDB({
        users: { id: '', name: '', age: 0 },
        posts: { id: '', userId: '' },
      });

      db.insert('users', { id: '1', name: 'Alice', age: 20 });
      db.insert('users', { id: '2', name: 'Bob', age: 30 });
      db.insert('users', { id: '3', name: 'Charlie', age: 40 });

      db.insert('posts', { id: '1', userId: '1' });
      db.insert('posts', { id: '2', userId: '2' });
      db.insert('posts', { id: '3', userId: '2' });

      // Find all users that have at least one post
      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [
          {
            collection: 'posts',
            where: [['userId', '=', '$id']],
            exists: [],
          },
        ],
      });

      expect(results.length).toBe(2);
      expect(results).toContainEqual(expect.objectContaining({ id: '1' }));
      expect(results).toContainEqual(expect.objectContaining({ id: '2' }));
    });

    test('can fetch data with multiple level subquery', () => {
      const db = new SimpleDB({
        users: { id: '', name: '', age: 0 },
        posts: { id: '', userId: '' },
        comments: { id: '', postId: '', text: '' },
      });

      db.insert('users', { id: '1', name: 'Alice', age: 20 });
      db.insert('users', { id: '2', name: 'Bob', age: 30 });
      db.insert('users', { id: '3', name: 'Charlie', age: 40 });

      db.insert('posts', { id: '1', userId: '1' });
      db.insert('posts', { id: '2', userId: '2' });
      db.insert('posts', { id: '3', userId: '3' });

      db.insert('comments', { id: '1', postId: '1', text: 'First' });
      db.insert('comments', { id: '2', postId: '2', text: 'Hi!' });
      db.insert('comments', { id: '3', postId: '3', text: 'looove' });

      // Find all users that have the comment "First" on on one of their posts
      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [
          {
            collection: 'posts',
            where: [['userId', '=', '$id']],
            exists: [
              {
                collection: 'comments',
                where: [
                  ['postId', '=', '$id'],
                  ['text', '=', 'First'],
                ],
                exists: [],
              },
            ],
          },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('id', '1');
    });
  });

  describe('change tracking', () => {
    test('can track changes', () => {
      const db = new SimpleDB({
        users: { id: '', name: '' },
      });

      db.insert('users', { id: '1', name: 'Alice' });
      db.insert('users', { id: '2', name: 'Bob' });
      db.flushChanges();

      db.update('users', '1', { name: 'Charlie' });
      db.update('users', '2', { name: 'David' });

      db.delete('users', '2');

      const changes = db.flushChanges();

      expect(changes).toEqual({
        users: new Map([
          [
            '1',
            {
              before: { id: '1', name: 'Alice' },
              after: { id: '1', name: 'Charlie' },
            },
          ],
          ['2', { before: { id: '2', name: 'Bob' }, after: null }],
        ]),
      });
      expect(Object.values(db.changesBuffer)).toEqual(
        expect.arrayContaining([new Map(), new Map()])
      );
    });

    test('store syncing', () => {
      // This test creates a fairly complex database, applies a series of changes to it, and then applies the changes to a another JS Map and checks that they are the same
      describe.each(['each', '3', 'all'])('Sync after %s ops', (syncType) => {
        // Contrived and simplified to make updates easier

        const NUM_ENTITIES = 15; // 5 each
        const NUM_OPS = 10;

        // Operations grouped by entity ID (5 ops each) to ensure that they are applied in the correct order
        // they will be applied in the correct order of by entity ID but will be interleaved in random order

        const seeds = new Array(10)
          .fill(0)
          .map((_, i) => Math.floor(Math.random() * 10000));
        const steps = new Array(NUM_ENTITIES)
          .fill(0)
          .flatMap((_, i) => new Array(NUM_OPS).fill(i)); // [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, ...]

        test.each(seeds)('with seed %i', (seed) => {
          const db = new SimpleDB({
            users: { id: '', value: '' },
            posts: { id: '', value: '' },
            comments: { id: '', value: '' },
          });
          const externalStore = {
            users: new Map<string, any>(),
            posts: new Map<string, any>(),
            comments: new Map<string, any>(),
          };

          const ops = Array.from({ length: NUM_ENTITIES }, (_, i) =>
            generateOps(i, seed, NUM_OPS)
          );

          const applyAndCheckChanges = () => {
            const changes = db.flushChanges();
            for (const [collection, collectionChanges] of Object.entries(
              changes
            )) {
              for (const [id, data] of collectionChanges) {
                // Using some heuristics if "id" is present in the data object then it's insert
                // if the value is null it's a delete, else it's an update
                // if (!data) {
                //   externalStore[
                //     collection as keyof typeof externalStore
                //   ].delete(id);
                // } else {
                //   const existingData =
                //     externalStore[collection as keyof typeof externalStore].get(
                //       id
                //     );
                //   externalStore[collection as keyof typeof externalStore].set(
                //     id,
                //     { ...existingData, ...data }
                //   );
                // }
                if (data.after === null) {
                  externalStore[
                    collection as keyof typeof externalStore
                  ].delete(id);
                } else {
                  externalStore[collection as keyof typeof externalStore].set(
                    id,
                    data.after
                  );
                }
              }
            }
            expect(externalStore).toEqual(db.collections);
          };

          const shuffledSteps = deterministicShuffle(steps, seed);
          let numSteps = 0;
          for (const step of shuffledSteps) {
            const op = ops[step].shift();
            if (op) {
              if (op.type === 'insert') {
                db.insert('users', { id: op.id, value: op.value });
              } else if (op.type === 'update') {
                db.update('users', op.id, { value: op.value });
              } else if (op.type === 'delete') {
                db.delete('users', op.id);
              }
            }
            numSteps++;

            if (syncType === '3' && numSteps % 3 === 0) {
              applyAndCheckChanges();
            }
            if (syncType === 'each') {
              applyAndCheckChanges();
            }
          }
          // Run for 'all' but also run at the end for '3' and 'each'
          applyAndCheckChanges();
        });
      });
    });
  });

  describe('Order and Limit', () => {
    let db: SimpleDB<'users', { users: { id: string; name: string } }>;
    beforeEach(() => {
      db = new SimpleDB({
        users: { id: '', name: '' },
      });

      db.insert('users', { id: '1', name: 'Charlie' });
      db.insert('users', { id: '2', name: 'Bob' });
      db.insert('users', { id: '3', name: 'Alice' });
      db.flushChanges();
    });

    test('can order results ASC', () => {
      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [],
        order: [['name', 'asc']],
      });

      expect(results.length).toBe(3);
      expect(results[0]).toEqual({ id: '3', name: 'Alice' });
      expect(results[1]).toEqual({ id: '2', name: 'Bob' });
      expect(results[2]).toEqual({ id: '1', name: 'Charlie' });
    });

    test('can order results DESC', () => {
      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [],
        order: [['name', 'desc']],
      });

      expect(results.length).toBe(3);
      expect(results[0]).toEqual({ id: '1', name: 'Charlie' });
      expect(results[1]).toEqual({ id: '2', name: 'Bob' });
      expect(results[2]).toEqual({ id: '3', name: 'Alice' });
    });

    test('can order results with multiple fields', () => {
      const db = new SimpleDB({
        users: { id: '', name: '', age: 0 },
      });

      db.insert('users', { id: '1', name: 'Alice', age: 20 });
      db.insert('users', { id: '2', name: 'Bob', age: 30 });
      db.insert('users', { id: '3', name: 'Charlie', age: 40 });

      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [],
        order: [
          ['age', 'asc'],
          ['name', 'desc'],
        ],
      });

      expect(results.length).toBe(3);
      expect(results[0]).toEqual({ id: '1', name: 'Alice', age: 20 });
      expect(results[1]).toEqual({ id: '2', name: 'Bob', age: 30 });
      expect(results[2]).toEqual({ id: '3', name: 'Charlie', age: 40 });
    });

    test('can limit results', () => {
      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [],
        order: [['name', 'asc']],
        limit: 2,
      });

      expect(results.length).toBe(2);
      expect(results[0]).toEqual({ id: '3', name: 'Alice' });
      expect(results[1]).toEqual({ id: '2', name: 'Bob' });
    });
  });

  describe('Include', () => {
    let db: SimpleDB<
      'users' | 'posts' | 'comments',
      {
        users: { id: string; name: string };
        posts: { id: string; userId: string; title: string };
        comments: { id: string; postId: string; text: string };
      }
    >;
    beforeEach(() => {
      db = new SimpleDB({
        users: { id: '', name: '' },
        posts: { id: '', userId: '', title: '' },
        comments: { id: '', postId: '', text: '' },
      });

      db.insert('users', { id: '1', name: 'Alice' });
      db.insert('users', { id: '2', name: 'Bob' });
      db.insert('users', { id: '3', name: 'Charlie' });

      db.insert('posts', { id: '1', userId: '1', title: 'Post 1' });
      db.insert('posts', { id: '2', userId: '2', title: 'Post 2' });
      db.insert('posts', { id: '3', userId: '2', title: 'Post 3' });

      db.flushChanges();
    });

    test('can include related data', () => {
      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [],
        include: {
          posts: {
            collection: 'posts',
            where: [['userId', '=', '$id']],
            exists: [],
          },
        },
      });

      expect(results.length).toBe(3);
      expect(results[0]).toEqual({
        id: '1',
        name: 'Alice',
        posts: [{ id: '1', userId: '1', title: 'Post 1' }],
      });
      expect(results[1]).toEqual({
        id: '2',
        name: 'Bob',
        posts: [
          { id: '2', userId: '2', title: 'Post 2' },
          { id: '3', userId: '2', title: 'Post 3' },
        ],
      });
      expect(results[2]).toEqual({
        id: '3',
        name: 'Charlie',
        posts: [],
      });
    });

    test('can include related data with multiple levels', () => {
      db.insert('comments', { id: '1', postId: '1', text: 'First' });
      db.insert('comments', { id: '2', postId: '2', text: 'Hi!' });
      db.insert('comments', { id: '3', postId: '3', text: 'looove' });

      db.flushChanges();

      const results = db.fetch({
        collection: 'users',
        where: [],
        exists: [],
        include: {
          posts: {
            collection: 'posts',
            where: [['userId', '=', '$id']],
            include: {
              comments: {
                collection: 'comments',
                where: [
                  ['postId', '=', '$id'],
                  ['text', '=', 'First'],
                ],
                exists: [],
              },
            },
          },
        },
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        id: '1',
        name: 'Alice',
        posts: [
          {
            id: '1',
            userId: '1',
            title: 'Post 1',
            comments: [{ id: '1', postId: '1', text: 'First' }],
          },
        ],
      });
      expect(results[1]).toEqual({
        id: '2',
        name: 'Bob',
        posts: [
          { id: '2', userId: '2', title: 'Post 2', comments: [] },
          { id: '3', userId: '2', title: 'Post 3', comments: [] },
        ],
      });
      expect(results[2]).toEqual({
        id: '3',
        name: 'Charlie',
        posts: [],
      });
    });
  });
});

describe('IVM', () => {
  test('can subscribe to query', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });
    db.insert('users', { id: '3', name: 'Charlie' });
    db.flushChanges();

    const ivm = new IVM(db);

    const spy = vi.fn();

    const unsubscribe = ivm.subscribe(
      {
        collection: 'users',
        where: [['name', '=', 'Bob']],
        exists: [],
      },
      ({ results }) => {
        spy();
        expect(results.length).toBe(1);
        expect(results[0]).toEqual({ id: '2', name: 'Bob' });
      }
    );

    ivm.flushChangesToListeners();
    expect(spy).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  test('can subscribe to query with exists clause', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
      posts: { id: '', userId: '' },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });
    db.insert('users', { id: '3', name: 'Charlie' });

    db.insert('posts', { id: '1', userId: '1' });
    db.insert('posts', { id: '2', userId: '2' });
    db.insert('posts', { id: '3', userId: '2' });

    db.flushChanges();

    const ivm = new IVM(db);

    const unsubscribe = ivm.subscribe(
      {
        collection: 'users',
        where: [],
        exists: [
          {
            collection: 'posts',
            where: [['userId', '=', '$id']],
            exists: [],
          },
        ],
      },
      ({ results }) => {
        expect(results.length).toBe(2);
        expect(results).toContainEqual(expect.objectContaining({ id: '1' }));
        expect(results).toContainEqual(expect.objectContaining({ id: '2' }));
      }
    );

    ivm.flushChangesToListeners();

    unsubscribe();
  });

  test('can subscribe to a non-relational query and get updates', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });
    db.insert('users', { id: '3', name: 'Charlie' });
    db.flushChanges();

    const ivm = new IVM(db);

    const spy = vi.fn();

    const unsubscribe = ivm.subscribe(
      {
        collection: 'users',
        where: [['name', '!=', 'Alice']],
        exists: [],
      },
      spy
    );
    ivm.flushChangesToListeners();

    db.update('users', '1', { name: 'Alicia' });
    const changes = db.flushChanges();
    ivm.updateViews(changes);
    ivm.flushChangesToListeners();

    expect(spy).toHaveBeenCalledTimes(2);

    expect(spy.mock.calls[0][0].results).toEqual([
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ]);

    expect(spy.mock.calls[1][0].results).toEqual([
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
      { id: '1', name: 'Alicia' },
    ]);

    unsubscribe();
  });

  test('can subscribe to a relational query and get updates', () => {
    const db = new SimpleDB({
      users: { id: '', name: '' },
      posts: { id: '', userId: '', public: false },
    });

    db.insert('users', { id: '1', name: 'Alice' });
    db.insert('users', { id: '2', name: 'Bob' });
    db.insert('users', { id: '3', name: 'Charlie' });

    db.insert('posts', { id: '1', userId: '1', public: true });
    db.insert('posts', { id: '2', userId: '2', public: false });
    db.insert('posts', { id: '3', userId: '2', public: false });

    db.flushChanges();

    const ivm = new IVM(db);

    const spy = vi.fn();

    const unsubscribe = ivm.subscribe(
      {
        collection: 'users',
        where: [],
        exists: [
          {
            collection: 'posts',
            where: [
              ['userId', '=', '$id'],
              ['public', '=', true],
            ],
            exists: [],
          },
        ],
      },
      spy
    );
    ivm.flushChangesToListeners();

    db.insert('posts', { id: '4', userId: '2', public: true });
    const dbChanges = db.flushChanges();
    ivm.updateViews(dbChanges);
    ivm.flushChangesToListeners();

    expect(spy).toHaveBeenCalledTimes(2);

    expect(spy.mock.calls[0][0].results).toEqual([{ id: '1', name: 'Alice' }]);

    expect(spy.mock.calls[1][0].results).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);

    unsubscribe();
  });

  /**
   * These tests are a bit more complex and test the IVM with a more complex dataset
   * In particular, they will take multi-level relational queries and test various cases
   * where tracking updates to these queries is slightly tricker.
   *
   * E.g. when a change invalidates an entity in a subquery but another entity can satisfy the subquery as a substitute
   * E.g. when a change invalidates an entity in a subquery and no other entity can satisfy the subquery
   *
   */
  describe('movie dataset', () => {
    let db = new SimpleDB({
      movies: { id: '', title: '', year: 0 },
      actors: { id: '', name: '' },
      roles: { id: '', movieId: '', actorId: '' },
    });
    beforeEach(() => {
      db = new SimpleDB({
        movies: { id: '', title: '', year: 0 },
        actors: { id: '', name: '' },
        roles: { id: '', movieId: '', actorId: '' },
      });

      db.insert('movies', { id: 'inception', title: 'Inception', year: 2010 });
      db.insert('movies', {
        id: 'dark_knight',
        title: 'The Dark Knight',
        year: 2008,
      });
      db.insert('movies', {
        id: 'interstellar',
        title: 'Interstellar',
        year: 2014,
      });

      db.insert('actors', { id: 'leo', name: 'Leonardo DiCaprio' });
      db.insert('actors', { id: 'tom', name: 'Tom Hardy' });
      db.insert('actors', { id: 'ellen', name: 'Ellen Page' });
      db.insert('actors', { id: 'christian', name: 'Christian Bale' });
      db.insert('actors', { id: 'joseph', name: 'Joseph Gordon-Levitt' });
      db.insert('actors', { id: 'anne', name: 'Anne Hathaway' });
      db.insert('actors', { id: 'matthew', name: 'Matthew McConaughey' });

      db.insert('roles', { id: 'role1', movieId: 'inception', actorId: 'leo' });
      db.insert('roles', { id: 'role2', movieId: 'inception', actorId: 'tom' });
      db.insert('roles', {
        id: 'role3',
        movieId: 'inception',
        actorId: 'ellen',
      });
      db.insert('roles', {
        id: 'role4',
        movieId: 'dark_knight',
        actorId: 'christian',
      });
      db.insert('roles', {
        id: 'role5',
        movieId: 'dark_knight',
        actorId: 'leo',
      });
      db.insert('roles', {
        id: 'role6',
        movieId: 'dark_knight',
        actorId: 'joseph',
      });
      db.insert('roles', {
        id: 'role7',
        movieId: 'interstellar',
        actorId: 'matthew',
      });

      db.flushChanges();
    });

    test('inserting a connection', () => {
      const ivm = new IVM(db);

      const spy = vi.fn();

      // Actors that acted in movies after 2009
      const query: Query = {
        collection: 'actors',
        where: [],
        exists: [
          {
            collection: 'roles',
            where: [['actorId', '=', '$id']],
            exists: [
              {
                collection: 'movies',
                where: [
                  ['id', '=', '$movieId'],
                  ['year', '>', 2009],
                ],
                exists: [],
              },
            ],
          },
        ],
      };

      const unsubscribe = ivm.subscribe(query, spy);
      ivm.flushChangesToListeners();

      db.insert('roles', {
        id: 'role8',
        movieId: 'interstellar',
        actorId: 'anne',
      });
      const changes = db.flushChanges();
      ivm.updateViews(changes);
      ivm.flushChangesToListeners();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[0][0].results).toEqual([
        { id: 'leo', name: 'Leonardo DiCaprio' },
        { id: 'tom', name: 'Tom Hardy' },
        { id: 'ellen', name: 'Ellen Page' },
        {
          id: 'matthew',
          name: 'Matthew McConaughey',
        },
      ]);

      expect(spy.mock.calls[1][0].results).toEqual([
        { id: 'leo', name: 'Leonardo DiCaprio' },
        { id: 'tom', name: 'Tom Hardy' },
        { id: 'ellen', name: 'Ellen Page' },
        {
          id: 'matthew',
          name: 'Matthew McConaughey',
        },
        {
          id: 'anne',
          name: 'Anne Hathaway',
        },
      ]);

      unsubscribe();
    });

    test('removing a connection', () => {
      const ivm = new IVM(db);

      const spy = vi.fn();

      // Actors that acted in movies after 2009
      const query: Query = {
        collection: 'actors',
        where: [],
        exists: [
          {
            collection: 'roles',
            where: [['actorId', '=', '$id']],
            exists: [
              {
                collection: 'movies',
                where: [
                  ['id', '=', '$movieId'],
                  ['year', '>', 2009],
                ],
                exists: [],
              },
            ],
          },
        ],
      };

      const unsubscribe = ivm.subscribe(query, spy);
      ivm.flushChangesToListeners();

      db.delete('roles', 'role5');
      const changes = db.flushChanges();
      ivm.updateViews(changes);
      ivm.flushChangesToListeners();

      expect(spy).toHaveBeenCalledTimes(2);

      expect(spy.mock.calls[0][0].results).toEqual([
        { id: 'leo', name: 'Leonardo DiCaprio' },
        { id: 'tom', name: 'Tom Hardy' },
        { id: 'ellen', name: 'Ellen Page' },
        {
          id: 'matthew',
          name: 'Matthew McConaughey',
        },
      ]);

      expect(spy.mock.calls[1][0].results).toEqual([
        { id: 'tom', name: 'Tom Hardy' },
        { id: 'ellen', name: 'Ellen Page' },
        {
          id: 'matthew',
          name: 'Matthew McConaughey',
        },
      ]);

      unsubscribe();
    });
  });

  describe('IVM | Messages App', () => {
    let db = new SimpleDB({
      users: { id: '', name: '' },
      conversations: { id: '' },
      conversationMembers: { id: '', conversationId: '', userId: '' },
      messages: { id: '', conversationId: '', text: '' },
    });

    beforeEach(() => {
      db = new SimpleDB({
        users: { id: '', name: '' },
        conversations: { id: '' },
        conversationMembers: { id: '', conversationId: '', userId: '' },
        messages: { id: '', conversationId: '', text: '' },
      });

      db.insert('users', { id: 'alice', name: 'Alice' });
      db.insert('users', { id: 'bob', name: 'Bob' });
      db.insert('users', { id: 'charlie', name: 'Charlie' });

      db.insert('conversations', { id: 'conv1' });
      db.insert('conversations', { id: 'conv2' });

      db.insert('conversationMembers', {
        id: 'member1',
        conversationId: 'conv1',
        userId: 'alice',
      });
      db.insert('conversationMembers', {
        id: 'member2',
        conversationId: 'conv1',
        userId: 'bob',
      });
      db.insert('conversationMembers', {
        id: 'member3',
        conversationId: 'conv2',
        userId: 'alice',
      });

      db.insert('messages', {
        id: 'msg1',
        conversationId: 'conv1',
        text: 'Hi Alice',
      });
      db.insert('messages', {
        id: 'msg2',
        conversationId: 'conv1',
        text: 'Hi Bob',
      });

      db.flushChanges();
    });

    describe('user viewing their messages', () => {
      const ALICE_MESSAGES_QUERY: Query = {
        collection: 'messages',
        where: [],
        exists: [
          {
            collection: 'conversationMembers',
            where: [
              ['conversationId', '=', '$conversationId'],
              ['userId', '=', 'alice'],
            ],
            exists: [],
          },
        ],
      };

      test('initial view', () => {
        const ivm = new IVM(db);

        const aliceMessagesSpy = vi.fn();
        const unsubscribe = ivm.subscribe(
          ALICE_MESSAGES_QUERY,
          aliceMessagesSpy
        );

        ivm.flushChangesToListeners();

        expect(aliceMessagesSpy).toHaveBeenCalledTimes(1);
        expect(aliceMessagesSpy.mock.calls[0][0].changes).toEqual({
          messages: new Map([
            [
              'msg1',
              {
                id: 'msg1',
                conversationId: 'conv1',
                text: 'Hi Alice',
              },
            ],
            [
              'msg2',
              {
                id: 'msg2',
                conversationId: 'conv1',
                text: 'Hi Bob',
              },
            ],
          ]),
          conversationMembers: new Map([
            [
              'member1',
              {
                id: 'member1',
                conversationId: 'conv1',
                userId: 'alice',
              },
            ],
          ]),
        });
        expect(aliceMessagesSpy.mock.calls[0][0].results).toEqual([
          { id: 'msg1', conversationId: 'conv1', text: 'Hi Alice' },
          { id: 'msg2', conversationId: 'conv1', text: 'Hi Bob' },
        ]);

        unsubscribe();
      });

      test('new message', () => {
        const ivm = new IVM(db);

        const aliceMessagesSpy = vi.fn();
        const unsubscribe = ivm.subscribe(
          ALICE_MESSAGES_QUERY,
          aliceMessagesSpy
        );

        // Initial results
        ivm.flushChangesToListeners();

        db.insert('messages', {
          id: 'msg3',
          conversationId: 'conv1',
          text: 'Hi Charlie',
        });

        const dbChanges = db.flushChanges();
        ivm.updateViews(dbChanges);
        ivm.flushChangesToListeners();

        expect(aliceMessagesSpy).toHaveBeenCalledTimes(2);
        const { results, changes } = aliceMessagesSpy.mock.calls[1][0];
        expect(results).toEqual(
          expect.arrayContaining([
            { id: 'msg1', conversationId: 'conv1', text: 'Hi Alice' },
            { id: 'msg2', conversationId: 'conv1', text: 'Hi Bob' },
            { id: 'msg3', conversationId: 'conv1', text: 'Hi Charlie' },
          ])
        );
        // TODO check all changed collections
        expect(changes.messages).toEqual(
          new Map([
            [
              'msg3',
              {
                id: 'msg3',
                conversationId: 'conv1',
                text: 'Hi Charlie',
              },
            ],
          ])
        );
      });

      test('new conversation w/ messages', () => {
        db.insert('conversations', { id: 'conv3' });

        db.insert('messages', {
          id: 'msg4',
          conversationId: 'conv3',
          text: 'Hi Alice',
        });
        db.flushChanges();
        const ivm = new IVM(db);

        const aliceMessagesSpy = vi.fn();
        const unsubscribe = ivm.subscribe(
          ALICE_MESSAGES_QUERY,
          aliceMessagesSpy
        );

        ivm.flushChangesToListeners();

        db.insert('conversationMembers', {
          id: 'member4',
          conversationId: 'conv3',
          userId: 'alice',
        });

        const changes = db.flushChanges();
        ivm.updateViews(changes);
        ivm.flushChangesToListeners();

        expect(aliceMessagesSpy).toHaveBeenCalledTimes(2);
        {
          const { results, changes } = aliceMessagesSpy.mock.calls[1][0];
          expect(results).toHaveLength(3);
          expect(results).toEqual(
            expect.arrayContaining([
              { id: 'msg1', conversationId: 'conv1', text: 'Hi Alice' },
              { id: 'msg2', conversationId: 'conv1', text: 'Hi Bob' },
              { id: 'msg4', conversationId: 'conv3', text: 'Hi Alice' },
            ])
          );

          expect(changes.conversationMembers).toEqual(
            new Map([
              [
                'member4',
                { id: 'member4', conversationId: 'conv3', userId: 'alice' },
              ],
            ])
          );
          expect(changes.messages).toEqual(
            new Map([
              [
                'msg4',
                { id: 'msg4', conversationId: 'conv3', text: 'Hi Alice' },
              ],
            ])
          );
        }
      });

      test('removing a messages', () => {
        const ivm = new IVM(db);

        const aliceMessagesSpy = vi.fn();
        const unsubscribe = ivm.subscribe(
          ALICE_MESSAGES_QUERY,
          aliceMessagesSpy
        );

        // Initial results
        ivm.flushChangesToListeners();

        db.delete('messages', 'msg2');

        const dbChanges = db.flushChanges();
        ivm.updateViews(dbChanges);
        ivm.flushChangesToListeners();

        expect(aliceMessagesSpy).toHaveBeenCalledTimes(2);
        const { results, changes } = aliceMessagesSpy.mock.calls[1][0];
        expect(results).toEqual([
          { id: 'msg1', conversationId: 'conv1', text: 'Hi Alice' },
        ]);
        expect(changes.messages).toEqual(new Map([['msg2', null]]));
      });

      test('removing as conversation member', () => {
        const ivm = new IVM(db);

        const aliceMessagesSpy = vi.fn();
        const unsubscribe = ivm.subscribe(
          ALICE_MESSAGES_QUERY,
          aliceMessagesSpy
        );

        // Initial results
        ivm.flushChangesToListeners();

        db.delete('conversationMembers', 'member1');

        const dbChanges = db.flushChanges();
        ivm.updateViews(dbChanges);
        ivm.flushChangesToListeners();

        expect(aliceMessagesSpy).toHaveBeenCalledTimes(2);
        const { results, changes } = aliceMessagesSpy.mock.calls[1][0];
        expect(results).toEqual([]);
        expect(changes.conversationMembers).toEqual(
          new Map([['member1', null]])
        );
      });
    });

    const ALICE_CONVERSATIONS_QUERY_NESTED: Query = {
      collection: 'conversations',
      where: [],
      exists: [
        {
          collection: 'conversationMembers',
          where: [
            ['conversationId', '=', '$id'],
            ['userId', '=', 'alice'],
          ],
          exists: [
            {
              collection: 'messages',
              where: [['conversationId', '=', '$conversationId']],
              exists: [],
            },
          ],
        },
      ],
    };
    const ALICE_CONVERSATIONS_QUERY_FLAT: Query = {
      collection: 'conversations',
      where: [],
      exists: [
        {
          collection: 'conversationMembers',
          where: [
            ['conversationId', '=', '$id'],
            ['userId', '=', 'alice'],
          ],
          exists: [],
        },
        {
          collection: 'messages',
          where: [['conversationId', '=', '$id']],
          exists: [],
        },
      ],
    };

    const CONVO_QUERIES = {
      nested: ALICE_CONVERSATIONS_QUERY_NESTED,
      flat: ALICE_CONVERSATIONS_QUERY_FLAT,
    } as const;

    describe.each(['nested', 'flat'])(
      'user viewing their conversations with a message ( %s )',
      (queryType) => {
        const query = CONVO_QUERIES[queryType];
        test('initial view', () => {
          const ivm = new IVM(db);

          const aliceConversationsSpy = vi.fn();
          const unsubscribe = ivm.subscribe(query, aliceConversationsSpy);

          ivm.flushChangesToListeners();

          expect(aliceConversationsSpy).toHaveBeenCalledTimes(1);
          expect(aliceConversationsSpy.mock.calls[0][0].results).toEqual([
            { id: 'conv1' },
          ]);

          unsubscribe();
        });
        test('new conversation', () => {
          const ivm = new IVM(db);

          const aliceConversationsSpy = vi.fn();
          const unsubscribe = ivm.subscribe(query, aliceConversationsSpy);

          ivm.flushChangesToListeners();

          db.insert('conversations', { id: 'conv3' });
          db.insert('conversationMembers', {
            id: 'member4',
            conversationId: 'conv3',
            userId: 'alice',
          });
          db.insert('messages', {
            id: 'msg4',
            conversationId: 'conv3',
            text: 'Hi Alice',
          });

          const dbChanges = db.flushChanges();
          ivm.updateViews(dbChanges);
          ivm.flushChangesToListeners();

          expect(aliceConversationsSpy).toHaveBeenCalledTimes(2);
          const { results, changes } = aliceConversationsSpy.mock.calls[1][0];
          expect(results).toEqual([{ id: 'conv1' }, { id: 'conv3' }]);
          expect(changes).toEqual({
            conversations: new Map([['conv3', { id: 'conv3' }]]),
            conversationMembers: new Map([
              [
                'member4',
                { id: 'member4', conversationId: 'conv3', userId: 'alice' },
              ],
            ]),
            messages: new Map([
              [
                'msg4',
                { id: 'msg4', conversationId: 'conv3', text: 'Hi Alice' },
              ],
            ]),
          });
        });
        test('adding a conversation via new message', () => {
          const ivm = new IVM(db);

          const aliceConversationsSpy = vi.fn();
          const unsubscribe = ivm.subscribe(query, aliceConversationsSpy);

          ivm.flushChangesToListeners();

          db.insert('messages', {
            id: 'msg3',
            conversationId: 'conv2',
            text: 'Hi Alice',
          });

          const dbChanges = db.flushChanges();
          ivm.updateViews(dbChanges);
          ivm.flushChangesToListeners();

          expect(aliceConversationsSpy).toHaveBeenCalledTimes(2);
          const { results, changes } = aliceConversationsSpy.mock.calls[1][0];
          expect(results).toEqual([{ id: 'conv1' }, { id: 'conv2' }]);
          expect(changes).toEqual({
            messages: new Map([
              [
                'msg3',
                { id: 'msg3', conversationId: 'conv2', text: 'Hi Alice' },
              ],
            ]),
            conversations: new Map([['conv2', { id: 'conv2' }]]),
            conversationMembers: new Map([
              [
                'member3',
                { id: 'member3', conversationId: 'conv2', userId: 'alice' },
              ],
            ]),
          });
        });
        test('removing a conversation via deleting a message', () => {
          const ivm = new IVM(db);

          const aliceConversationsSpy = vi.fn();
          const unsubscribe = ivm.subscribe(query, aliceConversationsSpy);

          ivm.flushChangesToListeners();

          db.delete('messages', 'msg1');

          const dbChanges = db.flushChanges();
          ivm.updateViews(dbChanges);
          ivm.flushChangesToListeners();

          expect(aliceConversationsSpy).toHaveBeenCalledTimes(2);
          const { results, changes } = aliceConversationsSpy.mock.calls[1][0];
          expect(results).toEqual([]);
          expect(changes).toEqual({
            messages: new Map([['msg1', null]]),
          });
        });
        test('removing a conversation via removing a conversation member', () => {
          const ivm = new IVM(db);

          const aliceConversationsSpy = vi.fn();
          const unsubscribe = ivm.subscribe(query, aliceConversationsSpy);

          ivm.flushChangesToListeners();

          db.delete('conversationMembers', 'member1');

          const dbChanges = db.flushChanges();
          ivm.updateViews(dbChanges);
          ivm.flushChangesToListeners();

          expect(aliceConversationsSpy).toHaveBeenCalledTimes(2);
          const { results, changes } = aliceConversationsSpy.mock.calls[1][0];
          expect(results).toEqual([]);
          expect(changes).toEqual({
            conversationMembers: new Map([['member1', null]]),
          });
        });
      }
    );
  });

  /**
   * Here we test tracking changes to a subscription/view and applying those to another database
   * This is the basis for client-server syncing
   * It's important to note that the changes that are emitted from updating views don't describe how the view changed
   * but instead are intended to be the minimal amount of information necessary to reconstruct the view
   * on another database with the same querying capabilities
   */
  describe('IVM syncing', () => {
    const TODAY = new Date('2024-01-01').getTime();
    const USERS = ['alice', 'bob', 'charlie'];
    const CONVERSATIONS = ['conv1', 'conv2', 'conv3'];
    const QUERIES: Record<string, Query> = {
      aliceMessages: {
        collection: 'messages',
        where: [],
        exists: [
          {
            collection: 'conversationMembers',
            where: [
              ['conversationId', '=', '$conversationId'],
              ['userId', '=', 'alice'],
            ],
            exists: [],
          },
        ],
      },
      allMessages: {
        collection: 'messages',
        where: [],
        exists: [],
      },
      threeMostRecentMessages: {
        collection: 'messages',
        where: [],
        exists: [],
        order: [['sentAt', 'desc']],
        limit: 3,
      },
      aliceConversations: {
        collection: 'conversations',
        where: [],
        exists: [
          {
            collection: 'conversationMembers',
            where: [
              ['conversationId', '=', '$id'],
              ['userId', '=', 'alice'],
            ],
          },
        ],
      },
      messagesInTheLastDay: {
        collection: 'messages',
        where: [['sentAt', '>', TODAY - 24 * 60 * 60 * 1000]],
        exists: [],
      },
    };
    const randomEntityFactory = {
      messages: (seed: number) => ({
        id: seed.toString(),
        conversationId: 'conv1',
        text: `Message ${seed}`,
        sentAt: TODAY - ((7 * seed) % 7) * 1000,
      }),
      conversationMembers: (seed: number) => ({
        id: seed.toString(),
        conversationId: CONVERSATIONS[seed % CONVERSATIONS.length],
        userId: USERS[seed % USERS.length],
      }),
      conversations: (seed: number) => ({
        id: CONVERSATIONS[seed % CONVERSATIONS.length],
      }),
    };

    function createRandomOpsForCollection(
      collectionName: string,
      numOps: number,
      seed: number
    ) {
      const ops: EntityOperation[] = [];
      const aliveEntities: string[] = [];
      for (let i = 0; i < numOps; i++) {
        const deterministicRandomValueForOp =
          (seed * 9301 + 49297 * i) % 233280;
        const op =
          aliveEntities.length === 0
            ? 'insert'
            : // Making inserts and updates more likely than deletes
              ['insert', 'insert', 'update', 'update', 'delete'][
                deterministicRandomValueForOp % 6
              ];

        if (op === 'delete') {
          ops.push({
            type: 'delete',
            collection: collectionName,
            id: aliveEntities.shift()!,
          });
        } else if (op === 'update') {
          const id =
            aliveEntities[deterministicRandomValueForOp % aliveEntities.length];
          const { id: _, ...value } = randomEntityFactory[collectionName](
            deterministicRandomValueForOp
          );
          ops.push({
            type: 'update',
            collection: collectionName,
            id,
            value,
          });
        } else {
          const randomEntity = randomEntityFactory[collectionName](
            deterministicRandomValueForOp
          );
          ops.push({
            type: 'insert',
            collection: collectionName,
            id: randomEntity.id,
            value: randomEntity,
          });
        }
      }
      return ops;
    }

    const RANDOM_SEEDS = Array.from({ length: 10 }, (_, i) =>
      Math.floor(Math.random() * 10_000)
    );

    describe.each(RANDOM_SEEDS)('seed %i', (seed) => {
      test.each(Object.keys(QUERIES))('Query: %s', (queryKey) => {
        const query = QUERIES[queryKey];
        const serverDb = new SimpleDB({
          users: { id: '', name: '' },
          conversations: { id: '' },
          conversationMembers: { id: '', conversationId: '', userId: '' },
          messages: { id: '', conversationId: '', text: '', sentAt: 0 },
        });
        const clientDb = new SimpleDB({
          users: { id: '', name: '' },
          conversations: { id: '' },
          conversationMembers: { id: '', conversationId: '', userId: '' },
          messages: { id: '', conversationId: '', text: '', sentAt: 0 },
        });

        const ivm = new IVM(serverDb);
        ivm.subscribe(
          query,
          ({ changes: serverChanges, results: serverResults }) => {
            // insert changes into clientDb

            if (serverChanges) {
              for (const [collection, changes] of Object.entries(
                serverChanges
              )) {
                if (!changes) {
                  console.warn('no changes', collection, changes);
                  continue;
                }
                for (const [id, value] of changes.entries()) {
                  if (value === null) {
                    clientDb.delete(collection, id);
                  } else {
                    if ('id' in value) {
                      clientDb.insert(collection, value);
                    } else {
                      clientDb.update(collection, id, value);
                    }
                  }
                }
              }
            }
            const clientResults = clientDb.fetch(query);
            expect(clientResults).toEqual(serverResults);
          }
        );

        const NUM_OPS = 30;
        const randomOps = deterministicShuffle(
          [
            ...createRandomOpsForCollection('messages', NUM_OPS, seed),
            ...createRandomOpsForCollection(
              'conversationMembers',
              NUM_OPS,
              seed
            ),
            ...createRandomOpsForCollection('conversations', NUM_OPS, seed),
          ],
          seed
        );
        const flushChangesFrequency = [1, 2, 3, 4, 5, 6][seed % 6];
        const updateViewFrequency = [1, 2, 3, 4, 5, 6][seed % 6];
        const broadcastChangesFrequency = [1, 2, 3, 4, 5, 6][seed % 6];
        let i = 0;
        for (const op of randomOps) {
          if (op.type === 'insert') {
            serverDb.insert(op.collection!, op.value);
          } else if (op.type === 'update') {
            serverDb.update(op.collection!, op.id, op.value);
          } else {
            serverDb.delete(op.collection!, op.id);
          }
          if (++i % flushChangesFrequency === 0) {
            const changes = serverDb.flushChanges();
            ivm.updateViews(changes);
          }
          if (++i % broadcastChangesFrequency === 0) {
            ivm.flushChangesToListeners();
          }
        }
      });
    });
  });
});

type EntityOperation = {
  collection?: string; // only optional because I don't want to update all the tests
  type: 'insert' | 'update' | 'delete';
  id: string;
  value?: any;
};

// Mini state machine to ensure that a sensible sequence of operations is applied e.g. insert before update, insert before delete, etc.
function generateOps(id: number, seed: number, numOps: number) {
  let internalSeed = id * 91 + seed;
  let lastOp: EntityOperation['type'] = 'delete';
  const ops: EntityOperation[] = [];
  for (let i = 0; i < numOps; i++) {
    const deterministicRandomValueForOp = internalSeed + i;

    // Only valid op after delete is insert
    if (lastOp === 'delete') {
      ops.push({
        type: 'insert',
        id: id.toString(),
        value: deterministicRandomValueForOp,
      });
      lastOp = 'insert';
      continue;
    }
    const nextOp = deterministicRandomValueForOp % 3;
    if (nextOp === 0) {
      ops.push({ type: 'delete', id: id.toString() });
      lastOp = 'delete';
    } else {
      ops.push({
        type: 'update',
        id: id.toString(),
        value: deterministicRandomValueForOp,
      });
      lastOp = 'update';
    }
  }
  return ops;
}

function deterministicShuffle<T extends any[]>(arr: T, seed: number) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seed * i) % shuffled.length;
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

describe('deterministicShuffle', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const RANDOM_SEEDS = new Array(10)
    .fill(0)
    .map((_, i) => Math.floor(Math.random() * 1000 * i));
  describe.each(RANDOM_SEEDS)('seed %i', (seed) => {
    test('shuffles deterministically', () => {
      const shuffled = deterministicShuffle(arr, seed);
      expect(shuffled).toEqual(deterministicShuffle(arr, seed));
    });
  });
});
