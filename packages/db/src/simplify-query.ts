import type {
  CollectionQuery,
  FilterGroup,
  QueryWhere,
  WhereFilter,
} from './query.js';
import { isFilterGroup, isSubQueryFilter } from './filters.js';
import { isQueryInclusionSubquery } from './subquery.js';

/**
 * Simplifies a query by removing redundant parts
 * Performs changes in place (assuming prepareQuery has already created a copy)
 */
export function simplifyQuery(query: CollectionQuery): CollectionQuery {
  /**
   * TODO List
   * Where:
   * - can drop duplicate statements (ie where a = 1 AND a = 1)
   * Order:
   * - can drop consecutive duplicate statements ie .order([['name', 'ASC'], ['id', 'ASC'], ['id', 'ASC']]) -> .order([['name', 'ASC'], ['id', 'ASC']])
   *  - probably should merge direction from the last item ie .order([['name', 'ASC'], ['id', 'ASC'], ['id', 'DESC']]) -> .order([['name', 'ASC'], ['id', 'DESC']])
   */
  query.where = simplifyWhere(query.where);
  query.include = simplifyInclusions(query.include);
  query.order = simplifyOrder(query.order);
  return query;
}

function simplifyWhere(where: QueryWhere | undefined) {
  if (!where) return where;
  where = simplifyWhereClauses(where, 'and');
  if (where.length === 0) return undefined;
  return where;
}

/**
 * Simplifies a group of where clauses, related by a boolean operator (AND, OR)
 */
// TODO: drop duplicative statements
// TODO: merge expanded subqueries that are the same (IE where a.b.c > 1 AND a.b.c <= 2)
function simplifyWhereClauses(
  where: QueryWhere,
  groupWith: 'and' | 'or'
): QueryWhere {
  const clauses: QueryWhere = [];
  for (let i = 0; i < where.length; i++) {
    const clause = where[i];
    const simplified = simplifyWhereClause(clause);
    // Drop if we decide the clause does nothing after simplifying
    if (simplified === undefined) continue;
    // If a filter group has the same mod as the parent, we can merge the children into the parent
    if (isFilterGroup(simplified) && simplified.mod === groupWith) {
      for (const filter of simplified.filters) {
        clauses.push(filter);
      }
    } else {
      clauses.push(simplified);
    }
  }
  return applyBooleanCollapse(clauses, groupWith);
}

/**
 * Simplifies a single where clause
 */
function simplifyWhereClause(clause: WhereFilter) {
  if (isFilterGroup(clause)) {
    return simplifyFilterGroup(clause);
  }
  if (isSubQueryFilter(clause)) {
    return {
      exists: simplifyQuery(clause.exists),
    };
  }
  return clause;
}

/**
 * Filter groups can be overly expressive and contain redundant information. This function simplifies the filter group to a more concise form.
 * If the filter group contains only one filter, it will return that filter.
 * If the filter group contains no filters, then undefined is returned and the filter can be dropped.
 */
export function simplifyFilterGroup(
  filterGroup: FilterGroup
): WhereFilter | undefined {
  // Simplify the filter group filters
  filterGroup.filters = simplifyWhereClauses(
    filterGroup.filters,
    filterGroup.mod
  );
  if (filterGroup.filters.length === 0) return undefined;
  if (filterGroup.filters.length === 1) {
    return simplifyWhereClause(filterGroup.filters[0]);
  }
  return filterGroup;
}

/**
 * Certain boolean expressions will cause a grouping to always evaluate to true or false. This function collapses those expressions to a single boolean value.
 *
 * AND -> If any filter is false, the entire expression is false.
 * OR -> If any filter is true, the entire expression is true.
 */
function applyBooleanCollapse(
  filters: QueryWhere,
  groupWith: 'and' | 'or'
): QueryWhere {
  if (groupWith === 'and') {
    if (filters.some((filter) => filter === false)) {
      return [false];
    }
  }
  if (groupWith === 'or') {
    if (filters.some((filter) => filter === true)) {
      return [true];
    }
  }
  return filters;
}

function simplifyInclusions(
  inclusions: CollectionQuery['include']
): CollectionQuery['include'] {
  if (!inclusions) return inclusions;
  const inclusionKeys = Object.keys(inclusions);
  if (inclusionKeys.length === 0) return undefined;
  for (const key of inclusionKeys) {
    const inclusion = inclusions[key];
    if (isQueryInclusionSubquery(inclusion)) {
      inclusion.subquery = simplifyQuery(inclusion.subquery);
    }
    inclusions[key] = inclusion;
  }
  return inclusions;
}

function simplifyOrder(
  order: CollectionQuery['order']
): CollectionQuery['order'] {
  if (!order) return order;
  if (order.length === 0) return undefined;
  for (let i = 0; i < order.length; i++) {
    const clause = order[i];
    // @ts-expect-error
    if (clause.length === 3) {
      // @ts-expect-error
      const subquery = clause[2];
      // @ts-expect-error
      order[i] = [
        clause[0],
        clause[1],
        {
          // @ts-expect-error
          ...subquery,
          // @ts-expect-error
          subquery: simplifyQuery(subquery.subquery),
        },
      ];
    }
  }
  return order;
}
