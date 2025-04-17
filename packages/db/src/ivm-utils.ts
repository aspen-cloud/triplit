import {
  filterStatementIteratorFlat,
  isFilterGroup,
  isFilterStatement,
  isSubQueryFilter,
  someFilterStatementsFlat,
} from './filters.js';
import { ViewEntity } from './query-engine.js';
import { hashPreparedQuery } from './query/hash-query.js';
import {
  FilterStatement,
  PreparedQuery,
  PreparedWhere,
  PreparedWhereFilter,
} from './types.js';
import {
  isValueVariable,
  getVariableComponents,
  isVariableScopeRelational,
  resolveVariable,
} from './variables.js';

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
  stack.pop();
  return results;
}

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

export function bindViewsInFilters<W extends PreparedWhere>(
  filters: W,
  views: Record<string, ViewEntity[]>
): W {
  return filters.map((filter) => bindViewsInFilter(filter, views)) as W;
}

export function bindViewsInFilter<W extends PreparedWhereFilter>(
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
