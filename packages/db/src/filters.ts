import { InvalidFilterError } from './errors.js';
import {
  DBEntity,
  PreparedFilterGroup,
  PreparedSubQueryFilter,
  PreparedWhere,
  PreparedWhereFilter,
  QueryFilterGroup,
} from './types.js';
import { ValuePointer } from './utils/value-pointer.js';
import { EntityStoreQueryEngine } from './query-engine.js';
import { logger } from '@triplit/logger';
import {
  AndFilterGroup,
  FilterGroup,
  FilterStatement,
  OrFilterGroup,
  QueryWhere,
  RelationshipExistsExtension,
  RelationshipExistsFilter,
  SubQueryFilter,
  WhereFilter,
} from './types.js';
import {
  CollectionNameFromModels,
  hasNoValue,
  ModelRelationshipPaths,
  Models,
  SET_OP_PREFIX,
} from './schema/index.js';
import { isValueVariable } from './variables.js';
import { compareValue } from './codec.js';

export async function satisfiesFilters(
  entity: DBEntity,
  filters: PreparedWhere,
  queryEngine: EntityStoreQueryEngine
): Promise<boolean> {
  let isSatisfied = true;
  const priorityOrder = getFilterPriorityOrder(filters);
  for (const idx of priorityOrder) {
    const filter = filters[idx];
    isSatisfied = await satisfiesFilter(entity, filter, queryEngine);
    if (!isSatisfied) break; // Short-circuit if any filter fails
  }
  return isSatisfied;
}

export async function satisfiesFilter(
  entity: DBEntity,
  filter: PreparedWhereFilter,
  queryEngine: EntityStoreQueryEngine
): Promise<boolean> {
  if (isFilterGroup(filter)) {
    if (filter.mod === 'and') {
      return await satisfiesFilters(entity, filter.filters, queryEngine);
    } else {
      let isSatisfied = false;
      for (const orFilter of filter.filters) {
        isSatisfied = await satisfiesFilters(entity, [orFilter], queryEngine);
        if (isSatisfied) break;
      }
      return isSatisfied;
    }
  } else if (isSubQueryFilter(filter)) {
    const result = await queryEngine.fetch(filter.exists, {
      entityStack: [entity],
    });
    if (Array.isArray(result)) return result.length > 0;
    return !!result;
  } else {
    return satisfiesNonRelationalFilter(entity, filter);
  }
}

export function satisfiesNonRelationalFilter(
  entity: DBEntity,
  filter: PreparedWhereFilter,
  ignoreSubQueries = false
): boolean {
  if (isBooleanFilter(filter)) return filter;
  if (isFilterGroup(filter)) {
    const { mod, filters } = filter;
    if (mod === 'and') {
      return filters.every((f) =>
        satisfiesNonRelationalFilter(entity, f, ignoreSubQueries)
      );
    }
    if (mod === 'or') {
      return filters.some((f) =>
        satisfiesNonRelationalFilter(entity, f, ignoreSubQueries)
      );
    }
    return false;
  }

  if (isSubQueryFilter(filter)) {
    if (ignoreSubQueries) {
      return true;
    }
    throw new Error(
      `Subquery filters should be filtered out before this point, found ${filter}`
    );
  }
  return satisfiesFilterStatement(entity, filter);
}

function satisfiesFilterStatement(entity: DBEntity, filter: FilterStatement) {
  const [path, op, filterValue] = filter;
  const value = ValuePointer.Get(entity, path);
  return evaluateFilterStatement(value, op, filterValue);
}

function evaluateFilterStatement(
  value: any,
  op: string,
  filterValue: any
): boolean {
  /**
   * As a temporary solution, we will prepend all set operations with SET_ in prepareQuery
   * This should indicate that we are dealing with a set
   * This can be refactored in the future as this is all internal handling of operators
   */
  if (op.startsWith(SET_OP_PREFIX)) {
    // Valid values are { key: boolean }, null, or undefined
    if (typeof value !== 'object' && value !== null && value !== undefined)
      throw new InvalidFilterError(
        `The operator requires a set value, but got ${value}`
      );
    const setOp = op.slice(SET_OP_PREFIX.length);
    if (setOp === 'has') {
      if (hasNoValue(value)) return false;
      for (const key of Object.keys(value)) {
        if (!value[key]) continue;
        const deserialized = inferSetValue(key, filterValue);
        if (deserialized === filterValue) return true;
      }
      return false;
    } else if (setOp === '!has') {
      if (hasNoValue(value)) return true;
      for (const key of Object.keys(value)) {
        if (!value[key]) continue;
        const deserialized = inferSetValue(key, filterValue);
        if (deserialized === filterValue) return false;
      }
      return true;
    } else if (setOp === 'isDefined') {
      return !!filterValue ? !hasNoValue(value) : hasNoValue(value);
    } else {
      if (hasNoValue(value)) return false;
      for (const key of Object.keys(value)) {
        if (!value[key]) continue;
        const deserialized = inferSetValue(key, filterValue);
        if (evaluateFilterStatement(deserialized, setOp, filterValue))
          return true;
      }
      return false;
    }
  }

  // Handle primitive value operations
  switch (op) {
    case '=':
      // Empty equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return true;
      // Coerce null because undefined is not a valid value (maybe should be in compareValue?)
      return compareValue(value ?? null, filterValue ?? null) === 0;
    case '!=':
      // Empty not-equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return false;
      return compareValue(value ?? null, filterValue ?? null) !== 0;
    case '>':
      // Null is not greater than anything
      if (hasNoValue(value)) return false;
      // Null is less than everything
      if (hasNoValue(filterValue)) return true;
      return compareValue(value, filterValue) > 0;
    case '>=':
      // Empty equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return true;
      // Null is not greater than anything
      if (hasNoValue(value)) return false;
      // Null is less than everything
      if (hasNoValue(filterValue)) return true;
      return compareValue(value, filterValue) >= 0;
    case '<':
      // Null is not less than anything
      if (hasNoValue(filterValue)) return false;
      // Null is less than everything
      if (hasNoValue(value)) return true;
      return compareValue(value, filterValue) < 0;
    case '<=':
      // Empty equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return true;
      // Null is not less than anything
      if (hasNoValue(filterValue)) return false;
      // Null is less than everything
      if (hasNoValue(value)) return true;
      return compareValue(value, filterValue) <= 0;

    //TODO: move regex initialization outside of the scan loop to improve performance
    case 'like':
      // No pattern is like no value
      // ['title', 'like', null] (even null)
      if (hasNoValue(filterValue)) return false;
      // No value matches no patterns
      // [null, 'like', '%alice]
      if (hasNoValue(value)) return false;
      return ilike(value, filterValue);
    case 'nlike':
      // Everything is not like no value
      // ['title', 'nlike', null] (even null)
      if (hasNoValue(filterValue)) return true;
      // No value will never match pattern
      // [null, 'nlike', '%alice]
      if (hasNoValue(value)) return true;
      return !ilike(value, filterValue);

    // TODO: handle proper value handling of sets
    // Currently we are loading variables as { key: boolean } for sets
    case 'in':
      // [null, 'in', ['a', 'b']] false, TODO: could be true if [null, 'in', [null]]?
      // ['a', 'in', null] false
      if (hasNoValue(value) || hasNoValue(filterValue)) return false;
      if (filterValue instanceof Set) {
        return filterValue.has(value);
      } else if (filterValue instanceof Array) {
        return filterValue.includes(value);
      } else if (filterValue instanceof Object) {
        return !!filterValue[value];
      } else {
        logger.warn('Invalid filter value for "in" operator');
        return false;
      }
    case 'nin':
      // [null, 'nin', ['a', 'b']] true
      // ['a', 'nin', null] true
      if (hasNoValue(value) || hasNoValue(filterValue)) return true;
      if (filterValue instanceof Set) {
        return !filterValue.has(value);
      } else if (filterValue instanceof Array) {
        return filterValue.includes(value);
      } else if (filterValue instanceof Object) {
        return !filterValue[value];
      } else {
        logger.warn('Invalid filter value for "in" operator');
        return false;
      }
    case 'isDefined':
      return !!filterValue ? !hasNoValue(value) : hasNoValue(value);
    default:
      throw new InvalidFilterError(`The operator ${op} is not recognized.`);
  }
}

// This is fine for now, but we really need the encoding information to properly filter sets
// Or in prepare query ensure that values in a filter are valid for the type + operator
// TODO: improve our handling of set filters, we would like to avoid invoking the schema, but just knowing something is a set is not enough information
function inferSetValue(serialized: string, value: any) {
  if (typeof value === 'boolean') return serialized === 'true';
  if (typeof value === 'number') return parseFloat(serialized);
  return serialized;
}

function ilike(text: string, pattern: string): boolean {
  // Escape special regex characters in the pattern
  pattern = pattern.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  // Replace SQL LIKE wildcards (%) with equivalent regex wildcards (.*)
  pattern = pattern.replace(/%/g, '.*');

  // Replace SQL LIKE single-character wildcards (_) with equivalent regex wildcards (.)
  pattern = pattern.replace(/_/g, '.');

  // Create a RegExp object from the pattern
  const regex = new RegExp(`^${pattern}$`, 'i');

  // Test the text against the regex
  return regex.test(text);
}

export function isFilterStatement(
  filter: WhereFilter | PreparedWhereFilter
): filter is FilterStatement {
  return (
    filter instanceof Array &&
    filter.length === 3 &&
    typeof filter[0] === 'string' &&
    typeof filter[1] === 'string'
  );
}

export function isIdFilter(filter: WhereFilter): filter is ['id', any, any] {
  return isFilterStatement(filter) && filter[0] === 'id';
}

export function isIdFilterEqualityStatement(
  filter: WhereFilter
): filter is ['id', '=' | 'in', any] {
  return isIdFilter(filter) && (filter[1] === '=' || filter[1] === 'in');
}

export function isFilterGroup(
  filter: PreparedWhereFilter
): filter is PreparedFilterGroup;
export function isFilterGroup(filter: WhereFilter): filter is QueryFilterGroup;
export function isFilterGroup(filter: any) {
  return filter instanceof Object && 'mod' in filter;
}

export function isSubQueryFilter(
  filter: PreparedWhereFilter
): filter is PreparedSubQueryFilter;
export function isSubQueryFilter(filter: WhereFilter): filter is SubQueryFilter;
export function isSubQueryFilter(filter: any) {
  return (
    filter instanceof Object &&
    'exists' in filter &&
    'collectionName' in filter['exists']
  );
}

export function isRelationshipExistsFilter(
  filter: WhereFilter
): filter is RelationshipExistsFilter {
  return (
    filter instanceof Object &&
    'exists' in filter &&
    '_extends' in filter['exists']
  );
}

export function isBooleanFilter(
  filter: WhereFilter | PreparedWhereFilter
): filter is boolean {
  return typeof filter === 'boolean';
}

export function isWhereFilter(filter: any): filter is WhereFilter {
  return (
    isFilterStatement(filter) ||
    isFilterGroup(filter) ||
    isSubQueryFilter(filter) ||
    isRelationshipExistsFilter(filter) ||
    isBooleanFilter(filter)
  );
}

/**
 * Returns true if the filter can be used in an index sorted by the property. It should be a filter statement with a some range scan operator.
 */
export function isIndexableFilter(
  filter: PreparedWhereFilter
): filter is FilterStatement {
  if (!isFilterStatement(filter)) return false;
  const [prop, op, val] = filter;
  if (!isValueVariable(val)) return false;
  if (!['=', '<', '<=', '>', '>=', '!='].includes(op)) return false;
  // We could also confirm that the data type is a primitive, but checking the operator of a prepared query should be enough
  // if (schema) {
  //   const attribute = getAttributeFromSchema(
  //     prop.split('.'),
  //     schema,
  //     query.collectionName
  //   );
  //   if (!attribute) return false;
  //   if (isTraversalRelationship(attribute)) return false;
  //   if (!isPrimitiveType(attribute)) return false;
  // }
  return true;
}

function determineFilterType(
  filter: PreparedWhereFilter
): 'boolean' | 'basic' | 'group' | 'relational' {
  if (isFilterStatement(filter)) return 'basic';
  if (isSubQueryFilter(filter)) return 'relational';
  if (isFilterGroup(filter)) return 'group';
  if (isBooleanFilter(filter)) return 'boolean';
  throw new Error(
    `Filter type could not be determined: ${JSON.stringify(filter)}`
  );
}

/**
 * Based on the type of filter, determine its priority in execution
 * 1. Boolean filters
 * 2. Basic filters
 * 3. Group filters (which are then ordered by their own priority)
 * 4. Relational filters (subqueries, will take the longest to execute)
 */
export function getFilterPriorityOrder(
  where: PreparedWhere | undefined
): number[] {
  if (!where) return [];
  const basicFilters = [];
  const booleanFilters = [];
  const groupFilters = [];
  const relationalFilters = [];

  for (let i = 0; i < where.length; i++) {
    const filter = where[i];
    const filterType = determineFilterType(filter);
    switch (filterType) {
      case 'boolean':
        booleanFilters.push(i);
        break;
      case 'basic':
        basicFilters.push(i);
        break;
      case 'group':
        groupFilters.push(i);
        break;
      case 'relational':
        relationalFilters.push(i);
        break;
    }
  }

  return [
    ...booleanFilters,
    ...basicFilters,
    ...groupFilters,
    ...relationalFilters,
  ];
}

export function or<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  W extends QueryWhere<M, CN> | PreparedWhere =
    | QueryWhere<M, CN>
    | PreparedWhere,
>(where: W) {
  return { mod: 'or' as const, filters: where } satisfies OrFilterGroup<
    M,
    CN,
    W
  >;
}

export function and<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  W extends QueryWhere<M, CN> | PreparedWhere =
    | QueryWhere<M, CN>
    | PreparedWhere,
>(where: W) {
  return { mod: 'and' as const, filters: where } satisfies AndFilterGroup<
    M,
    CN,
    W
  >;
}

export function exists<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  P extends ModelRelationshipPaths<M, CN> = ModelRelationshipPaths<M, CN>,
>(relationship: P): { exists: { _extends: P } };
export function exists<
  M extends Models<M> = Models,
  CN extends CollectionNameFromModels<M> = CollectionNameFromModels<M>,
  P extends ModelRelationshipPaths<M, CN> = ModelRelationshipPaths<M, CN>,
  Ext extends RelationshipExistsExtension<
    M,
    CN,
    P
  > = RelationshipExistsExtension<M, CN, P>,
>(relationship: P, ext?: Ext): { exists: { _extends: P } } & Ext;
export function exists(relationship: any, ext: any = {}) {
  return {
    exists: {
      _extends: relationship,
      ...ext,
    },
  };
}

/**
 * This will iterate over all statements (even recursively in groups) and return
 * true if any of the statements satisfy the provided function.
 * @param statements
 * @param someFunction
 * @returns
 */
export function someFilterStatementsFlat(
  statements: PreparedWhere,
  someFunction: (
    statement: Exclude<PreparedWhereFilter, PreparedFilterGroup>
  ) => boolean
): boolean;
export function someFilterStatementsFlat(
  statements: QueryWhere,
  someFunction: (statement: Exclude<WhereFilter, FilterGroup>) => boolean
): boolean;
export function someFilterStatementsFlat(
  statements: any,
  someFunction: (statement: any) => boolean
): boolean {
  for (const statement of filterStatementIteratorFlat(statements)) {
    if (someFunction(statement)) return true;
  }
  return false;
}

/**
 * This will iterate over all statements including recursively within groups  of AND and OR
 * but not within subqueries
 * @param statements
 */
export function filterStatementIteratorFlat(
  statements: PreparedWhere
): Generator<Exclude<PreparedWhereFilter, PreparedFilterGroup>>;
export function filterStatementIteratorFlat(
  statements: QueryWhere
): Generator<Exclude<WhereFilter, FilterGroup>>;
export function* filterStatementIteratorFlat(statements: any) {
  for (const statement of statements) {
    if (isFilterGroup(statement)) {
      yield* filterStatementIteratorFlat(statement.filters);
    } else {
      yield statement;
    }
  }
}

export type StaticFilter =
  | boolean
  | FilterStatement
  | FilterGroup<Models, CollectionNameFromModels<Models>, StaticFilter[]>;
/**
 * Returns true if the filter has no relational components
 */
export function isStaticFilter(
  filter: PreparedWhereFilter
): filter is StaticFilter;
export function isStaticFilter(filter: WhereFilter): filter is StaticFilter;
export function isStaticFilter(filter: any) {
  if (isBooleanFilter(filter)) return true;
  if (isFilterStatement(filter)) return true;
  if (isFilterGroup(filter)) {
    const { mod, filters } = filter;
    return filters.every((f) => isStaticFilter(f));
  }
  if (isSubQueryFilter(filter)) return false;
  if (isRelationshipExistsFilter(filter)) return false;
  // throw new TriplitError('Unknown filter type');
  return true;
}
