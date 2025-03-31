import {
  isFilterGroup,
  isFilterStatement,
  isSubQueryFilter,
} from './filters.js';
import { CollectionQuery, RelationSubquery, WhereFilter } from './types.js';
import {
  isValueVariable,
  getVariableComponents,
  isVariableScopeRelational,
} from './variables.js';

function iterateFiltersForRelationalVariables(
  filter: WhereFilter,
  stack: CollectionQuery[],
  results = new Map<string, Set<string>>()
) {
  if (isFilterStatement(filter)) {
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
  if (isFilterGroup(filter)) {
    for (const subfilter of filter.filters) {
      iterateFiltersForRelationalVariables(subfilter, stack, results);
    }
  }
  if (isSubQueryFilter(filter)) {
    getReferencedRelationalVariables(filter.exists, stack, results);
  }
}

export function getReferencedRelationalVariables(
  query: CollectionQuery,
  stack: CollectionQuery[] = [],
  results = new Map<string, Set<string>>()
) {
  stack.push(query);
  if (query.where) {
    for (const filter of query.where) {
      iterateFiltersForRelationalVariables(filter, stack, results);
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

function iterateFiltersForSubqueryCollections(
  filter: WhereFilter,
  stack: string[],
  results = new Map<string, Set<string>>()
) {
  if (isSubQueryFilter(filter)) {
    const { exists } = filter;
    getCollectionsReferencedInSubqueries(exists, stack, results);
  }
  if (isFilterGroup(filter)) {
    for (const subfilter of filter.filters) {
      iterateFiltersForSubqueryCollections(subfilter, stack, results);
    }
  }
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
    for (const filter of query.where) {
      iterateFiltersForSubqueryCollections(filter, stack, results);
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
