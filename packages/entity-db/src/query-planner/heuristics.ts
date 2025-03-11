import { CollectionQuery, FilterStatement } from '../types.js';
import {
  isFilterStatement,
  isIdFilterEqualityStatement,
  isSubQueryFilter,
} from '../filters.js';
import { isValueVariable } from '../variables.js';

export function hasIdFilter(query: CollectionQuery) {
  if (!query.where) return false;
  // Very naive approach: if the top-level where includes an ID filter, choose ID plan
  return query.where.some(
    (f) => isFilterStatement(f) && isIdFilterEqualityStatement(f)
  );
}

export function getIdFilter(
  query: CollectionQuery
): [FilterStatement | null, number] {
  if (!query.where) return [null, -1];
  // TODO support searching in nested filter groups like AND and OR
  const idFilterIndex = query.where.findIndex(
    (f) => isFilterStatement(f) && isIdFilterEqualityStatement(f)
  );
  if (idFilterIndex === -1) return [null, -1];
  return [query.where[idFilterIndex] as FilterStatement, idFilterIndex];
}

// This gets some basic info about the selectivity of a query
// NOTE: it intentionally doesn't consider subqueries
function getQuerySelectivity(query: CollectionQuery): QuerySelectivity {
  const selectivity: QuerySelectivity = {};
  if (query.limit !== undefined) {
    selectivity.limit = query.limit;
  }
  if (
    query.where?.some(
      (f) =>
        isFilterStatement(f) &&
        isIdFilterEqualityStatement(f) &&
        !isValueVariable(f[2])
    )
  ) {
    selectivity.hasIdFilter = true;
  }
  return selectivity;
}

function compareSelectivity(
  selectivity1: QuerySelectivity,
  selectivity2: QuerySelectivity
): -1 | 0 | 1 {
  if (selectivity1.hasIdFilter && !selectivity2.hasIdFilter) return -1;
  if (!selectivity1.hasIdFilter && selectivity2.hasIdFilter) return 1;
  if (selectivity1.limit !== undefined && selectivity2.limit === undefined)
    return -1;
  if (selectivity1.limit === undefined && selectivity2.limit !== undefined)
    return 1;
  if (selectivity1.limit !== undefined && selectivity2.limit !== undefined) {
    if (selectivity1.limit < selectivity2.limit) return -1;
    if (selectivity1.limit > selectivity2.limit) return 1;
  }
  return 0;
}

interface QuerySelectivity {
  limit?: number;
  hasIdFilter?: boolean;
}

export function subQueryIsLikelyMoreSelectiveThanRoot(query: CollectionQuery) {
  // TODO handle AND/OR
  if (!query.where?.some(isSubQueryFilter)) return false;
  const selectivityOfRoot = getQuerySelectivity(query);
  // Check to see if any of the immediate subQuery filters has greater selectivity
  return query.where.some(
    (f) =>
      isSubQueryFilter(f) &&
      compareSelectivity(getQuerySelectivity(f.exists), selectivityOfRoot) < 0
  );
}
