import {
  filterStatementIterator,
  isFilterStatement,
  isSubQueryFilter,
  someFilterStatements,
} from './filters.js';
import { CollectionQuery, RelationSubquery, WhereFilter } from './types.js';
import {
  isValueVariable,
  getVariableComponents,
  isVariableScopeRelational,
} from './variables.js';

export function getReferencedRelationalVariables(
  query: CollectionQuery,
  stack: CollectionQuery[] = [],
  results = new Map<string, Set<string>>()
) {
  stack.push(query);
  if (query.where) {
    for (const filter of filterStatementIterator(query.where)) {
      if (isSubQueryFilter(filter)) {
        getReferencedRelationalVariables(filter.exists, stack, results);
      } else if (isFilterStatement(filter)) {
        if (isValueVariable(filter[2])) {
          const [scope, attribute] = getVariableComponents(filter[2]);
          // Just capture root referential vars
          if (isVariableScopeRelational(scope)) {
            const queryReferenced = stack[stack.length - scope - 1];
            if (queryReferenced) {
              const stringifiedQuery = JSON.stringify(queryReferenced);
              if (!results.has(stringifiedQuery)) {
                results.set(stringifiedQuery, new Set());
              }
              results.get(stringifiedQuery)?.add(attribute);
            }
          }
        }
      }
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias] as RelationSubquery;
      getReferencedRelationalVariables(subquery, stack, results);
    }
  }
  stack.pop();
  return results;
}

export function getCollectionsReferencedInSubqueries(
  query: CollectionQuery,
  stack: string[] = [],
  results = new Map<string, Set<string>>()
) {
  for (const stringified of stack) {
    results.get(stringified)?.add(query.collectionName);
  }
  stack.push(JSON.stringify(query));
  results.set(JSON.stringify(query), new Set());
  if (query.where) {
    for (const filter of filterStatementIterator(query.where)) {
      if (isSubQueryFilter(filter)) {
        const { exists } = filter;
        getCollectionsReferencedInSubqueries(exists, stack, results);
      }
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias] as RelationSubquery;
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

export function hasSubqueryFilterAtAnyLevel(query: CollectionQuery) {
  if (query.where) {
    if (someFilterStatements(query.where, isSubQueryFilter)) {
      return true;
    }
  }
  if (query.include) {
    for (const alias in query.include) {
      const { subquery } = query.include[alias] as RelationSubquery;
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

export function hasSubqueryOrderAtAnyLevel(query: CollectionQuery) {
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
      const { subquery } = query.include[alias] as RelationSubquery;
      if (hasSubqueryOrderAtAnyLevel(subquery)) {
        return true;
      }
    }
  }
  return false;
}
