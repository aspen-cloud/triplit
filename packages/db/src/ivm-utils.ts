import {
  filterStatementIteratorFlat,
  isFilterStatement,
  isSubQueryFilter,
  someFilterStatementsFlat,
} from './filters.js';
import { hashPreparedQuery } from './query/hash-query.js';
import { PreparedQuery } from './types.js';
import {
  isValueVariable,
  getVariableComponents,
  isVariableScopeRelational,
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
