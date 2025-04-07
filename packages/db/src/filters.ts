import { InvalidFilterError, TriplitError } from './errors.js';
import { isValueVariable } from './variables.js';
import {
  DBEntity,
  Insert,
  PreparedFilterGroup,
  PreparedSubQueryFilter,
  PreparedWhere,
  PreparedWhereFilter,
  QueryFilterGroup,
} from './types.js';
import { ValuePointer } from './utils/value-pointer.js';
import { EntityStoreQueryEngine } from './query-engine.js';
import { asyncIterEvery, asyncIterSome } from './utils/iterators.js';
import {
  getAttributeFromSchema,
  isTraversalRelationship,
} from './schema/utilities.js';
import { DBSchema } from './db.js';
import { logger } from '@triplit/logger';
import {
  AndFilterGroup,
  CollectionQuery,
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
} from './schema/index.js';

export async function satisfiesFilters(
  entity: { collectionName: string } & Insert,
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
  entity: { collectionName: string } & Insert,
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
    const result = await queryEngine.executeRelationalQuery(filter.exists, {
      entityStack: [entity],
    });
    if (Array.isArray(result)) return result.length > 0;
    return !!result;
  } else {
    return satisfiesNonRelationalFilter(
      entity.collectionName,
      entity,
      filter,
      queryEngine.schema
    );
  }
}

export function satisfiesNonRelationalFilter(
  collectionName: string,
  entity: DBEntity,
  filter: PreparedWhereFilter,
  schema?: DBSchema,
  ignoreSubQueries = false
): boolean {
  if (isBooleanFilter(filter)) return filter;
  if (isFilterGroup(filter)) {
    const { mod, filters } = filter;
    if (mod === 'and') {
      return filters.every((f) =>
        satisfiesNonRelationalFilter(
          collectionName,
          entity,
          f,
          schema,
          ignoreSubQueries
        )
      );
    }
    if (mod === 'or') {
      return filters.some((f) =>
        satisfiesNonRelationalFilter(
          collectionName,
          entity,
          f,
          schema,
          ignoreSubQueries
        )
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
  return satisfiesFilterStatement(
    { collectionName, data: entity },
    filter,
    schema
  );
}

function satisfiesFilterStatement(
  entity: {
    collectionName: string;
    data: DBEntity;
  },
  filter: FilterStatement,
  schema?: DBSchema
) {
  const [path, op, filterValue] = filter;
  const dataType = schema?.collections
    ? getAttributeFromSchema(
        path.split('.'),
        schema?.collections,
        entity.collectionName
      )
    : undefined;

  const value = ValuePointer.Get(entity.data, path);

  if (isTraversalRelationship(dataType)) {
    throw new TriplitError(
      'Cannot apply filter. Provided path did not resolve to a valid attribute.'
    );
  }

  // If we have a schema handle specific cases
  if (dataType && dataType.type === 'set')
    return satisfiesSetFilter(value, op, filterValue);

  // Use register as default
  return satisfiesRegisterFilter(value, op, filterValue);
}

export function satisfiesSetFilter(
  setValue: Record<string, boolean>,
  op: string, // Operator,
  filterValue: any
) {
  if (op === 'has') {
    if (hasNoValue(setValue)) return false;
    const filteredSet = Object.entries(setValue).filter(([_v, inSet]) => inSet);
    return filteredSet.some(([v]) => v === filterValue);
  } else if (op === '!has') {
    if (hasNoValue(setValue)) return true;
    const filteredSet = Object.entries(setValue).filter(([_v, inSet]) => inSet);
    return filteredSet.every(([v]) => v !== filterValue);
  } else if (op === 'isDefined') {
    return !!filterValue ? !hasNoValue(setValue) : hasNoValue(setValue);
  } else {
    if (hasNoValue(setValue)) return false;
    const filteredSet = Object.entries(setValue).filter(([_v, inSet]) => inSet);
    return filteredSet.some(([v]) =>
      satisfiesRegisterFilter(v, op, filterValue)
    );
  }
}

export function satisfiesRegisterFilter(
  value: any,
  op: string, //Operator,
  filterValue: any
) {
  switch (op) {
    case '=':
      // Empty equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return true;
      return value === filterValue;
    case '!=':
      // Empty not-equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return false;
      return value !== filterValue;
    case '>':
      // Null is not greater than anything
      if (hasNoValue(value)) return false;
      // Null is less than everything
      if (hasNoValue(filterValue)) return true;
      return value > filterValue;
    case '>=':
      // Empty equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return true;
      // Null is not greater than anything
      if (hasNoValue(value)) return false;
      // Null is less than everything
      if (hasNoValue(filterValue)) return true;
      return value >= filterValue;
    case '<':
      // Null is not less than anything
      if (hasNoValue(filterValue)) return false;
      // Null is less than everything
      if (hasNoValue(value)) return true;
      return value < filterValue;
    case '<=':
      // Empty equality check
      if (hasNoValue(value) && hasNoValue(filterValue)) return true;
      // Null is not less than anything
      if (hasNoValue(filterValue)) return false;
      // Null is less than everything
      if (hasNoValue(value)) return true;
      return value <= filterValue;

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
      if (filterValue instanceof Array) {
        return new Set(filterValue).has(value);
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
      if (filterValue instanceof Array) {
        return !new Set(filterValue).has(value);
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
