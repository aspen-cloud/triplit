import {
  filterStatementIteratorFlat,
  isFilterGroup,
  isFilterStatement,
  isSubQueryFilter,
  someFilterStatementsFlat,
} from '../filters.js';
import { ViewEntity } from '../query-engine.js';
import { hashPreparedQuery } from '../query/hash-query.js';
import {
  DBChanges,
  FilterStatement,
  PreparedQuery,
  PreparedWhere,
  PreparedWhereFilter,
} from '../types.js';
import {
  isValueVariable,
  getVariableComponents,
  isVariableScopeRelational,
  resolveVariable,
} from '../variables.js';

/**
 *
 * For each query and its subqueries, find all the relational variables that are referenced in the filters.
 * This is used in IVM to avoid unnecessary refetching of related data if the controlling variables
 * are unchanged.
 */
export function getReferencedRelationalVariables(
  query: PreparedQuery,
  stack: PreparedQuery[] = [],
  results = new Map<number, Set<string>>()
) {
  stack.push(query);
  if (query.where) {
    for (const filter of filterStatementIteratorFlat(query.where)) {
      if (isSubQueryFilter(filter)) {
        getReferencedRelationalVariables(filter.exists, stack, results);
      } else if (isFilterStatement(filter)) {
        if (isValueVariable(filter[2])) {
          const [scope, attribute] = getVariableComponents(filter[2]);
          // Just capture root referential vars
          if (isVariableScopeRelational(scope)) {
            const queryReferenced = stack[stack.length - scope - 1];
            if (queryReferenced) {
              const hashedQuery = hashPreparedQuery(queryReferenced);
              if (!results.has(hashedQuery)) {
                results.set(hashedQuery, new Set());
              }
              results.get(hashedQuery)?.add(attribute);
            }
          }
        }
      }
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias];
      getReferencedRelationalVariables(subquery, stack, results);
    }
  }
  if (query.order) {
    for (const order of query.order) {
      const maybeSubqueryOrder = order[2];
      if (maybeSubqueryOrder) {
        getReferencedRelationalVariables(
          maybeSubqueryOrder.subquery,
          stack,
          results
        );
      }
    }
  }
  stack.pop();
  return results;
}

/**
 *
 * For each query and its subqueries, find all the collections that the parent query
 * or the subquery references in the filters.
 *
 * This is used in IVM to determine "given a set of changes, can I avoid
 *  iterating into this query and its subqueries?"
 *
 */
export function getCollectionsReferencedInSubqueries(
  query: PreparedQuery,
  stack: number[] = [],
  results = new Map<number, Set<string>>()
) {
  for (const hashed of stack) {
    results.get(hashed)?.add(query.collectionName);
  }
  const queryId = hashPreparedQuery(query);
  stack.push(queryId);
  results.set(queryId, new Set<string>().add(query.collectionName));
  if (query.where) {
    for (const filter of filterStatementIteratorFlat(query.where)) {
      if (isSubQueryFilter(filter)) {
        const { exists } = filter;
        getCollectionsReferencedInSubqueries(exists, stack, results);
      }
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias];
      getCollectionsReferencedInSubqueries(subquery, stack, results);
    }
  }
  if (query.order) {
    for (const order of query.order) {
      const maybeSubqueryOrder = order[2];
      if (maybeSubqueryOrder) {
        getCollectionsReferencedInSubqueries(
          maybeSubqueryOrder.subquery,
          stack,
          results
        );
      }
    }
  }
  stack.pop();

  return results;
}

export function hasSubqueryFilterAtAnyLevel(query: PreparedQuery) {
  if (query.where) {
    if (someFilterStatementsFlat(query.where, isSubQueryFilter)) {
      return true;
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias];
      if (hasSubqueryFilterAtAnyLevel(subquery)) {
        return true;
      }
    }
  }
  if (query.order) {
    for (const order of query.order) {
      const maybeSubqueryOrder = order[2];
      if (
        maybeSubqueryOrder &&
        hasSubqueryFilterAtAnyLevel(maybeSubqueryOrder.subquery)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function hasSubqueryOrderAtAnyLevel(query: PreparedQuery) {
  if (query.order) {
    for (const order of query.order) {
      const maybeSubqueryOrder = order[2];
      if (maybeSubqueryOrder) {
        return true;
      }
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias];
      if (hasSubqueryOrderAtAnyLevel(subquery)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The idea here is not to replace inverted views with real values
 * But _not_ replace any other variables
 */
export function bindViewReferencesInQuery(
  query: PreparedQuery,
  views: Record<string, ViewEntity[]>,
  shouldClone = true
): PreparedQuery {
  if (shouldClone) {
    query = JSON.parse(JSON.stringify(query));
  }
  if (query.where) {
    query.where = bindViewsInFilters(query.where, views);
  }
  if (query.include) {
    for (const key in query.include) {
      query.include[key].subquery = bindViewReferencesInQuery(
        query.include[key].subquery,
        views,
        false
      );
    }
  }
  if (query.order) {
    for (const order of query.order) {
      const maybeSubqueryOrder = order[2];
      if (maybeSubqueryOrder) {
        maybeSubqueryOrder.subquery = bindViewReferencesInQuery(
          maybeSubqueryOrder.subquery,
          views,
          false
        );
      }
    }
  }
  return query;
}

function bindViewsInFilters<W extends PreparedWhere>(
  filters: W,
  views: Record<string, ViewEntity[]>
): W {
  return filters.map((filter) => bindViewsInFilter(filter, views)) as W;
}

function bindViewsInFilter<W extends PreparedWhereFilter>(
  filter: W,
  views: Record<string, ViewEntity[]>
): W {
  if (isFilterGroup(filter)) {
    return {
      mod: filter.mod,
      filters: bindViewsInFilters(filter.filters, views),
    } as W;
  }
  if (
    isFilterStatement(filter) &&
    isValueVariable(filter[2]) &&
    filter[2].startsWith('$view_')
  ) {
    const variable = filter[2] as string;
    let resolvedValue = resolveVariable(variable, views);
    if (Array.isArray(resolvedValue)) {
      resolvedValue = new Set(resolvedValue);
    }
    return [filter[0], filter[1], resolvedValue] as FilterStatement as W;
  }
  return filter;
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
