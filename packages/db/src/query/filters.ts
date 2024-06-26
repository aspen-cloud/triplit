import {
  FetchExecutionContext,
  FetchFromStorageOptions,
  QueryPipelineData,
  loadSubquery,
} from '../collection-query.js';
import { Operator } from '../data-types/base.js';
import DB from '../db.js';
import { InvalidFilterError } from '../errors.js';
import { EntityPointer } from '../query.js';
import { getAttributeFromSchema } from '../schema/schema.js';
import { Models } from '../schema/types';
import { Timestamp } from '../timestamp.js';
import { TripleStoreApi } from '../triple-store.js';
import { timestampedObjectToPlainObject } from '../utils.js';
import { everyAsync, someAsync } from '../utils/async.js';
import {
  FilterStatement,
  SubQueryFilter,
  WhereFilter,
  CollectionQuery,
} from './types';

/**
 * During query execution, determine if an entity satisfies a filter
 */
export async function satisfiesFilter<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  db: DB<M>,
  tx: TripleStoreApi,
  query: Q,
  executionContext: FetchExecutionContext,
  options: FetchFromStorageOptions,
  pipelineItem: QueryPipelineData,
  filter: WhereFilter<M, Q['collectionName']>
): Promise<boolean> {
  if ('mod' in filter) {
    const { mod, filters } = filter;
    if (mod === 'and') {
      return await everyAsync(filters, (f) =>
        satisfiesFilter(
          db,
          tx,
          query,
          executionContext,
          options,
          pipelineItem,
          f
        )
      );
    }
    if (mod === 'or') {
      return await someAsync(filters, (f) =>
        satisfiesFilter(
          db,
          tx,
          query,
          executionContext,
          options,
          pipelineItem,
          f
        )
      );
    }
    return false;
  } else if ('exists' in filter) {
    return await satisfiesRelationalFilter(
      db,
      tx,
      query,
      executionContext,
      options,
      pipelineItem,
      filter
    );
  }
  return satisfiesFilterStatement(query, options, pipelineItem, filter);
}

async function satisfiesRelationalFilter<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  db: DB<M>,
  tx: TripleStoreApi,
  query: Q,
  executionContext: FetchExecutionContext,
  options: FetchFromStorageOptions,
  pipelineItem: QueryPipelineData,
  filter: SubQueryFilter
) {
  const { exists: subQuery } = filter;
  const existsSubQuery = {
    ...subQuery,
    limit: 1,
  };

  const { results: subQueryResult, triples } = await loadSubquery(
    db,
    tx,
    query,
    existsSubQuery,
    'one',
    executionContext,
    options,
    pipelineItem.entity
  );
  const exists = !!subQueryResult;
  if (!exists) return false;
  for (const tripleSet of triples.values()) {
    for (const triple of tripleSet) {
      pipelineItem.existsFilterTriples.push(triple);
    }
  }

  return true;
}

function satisfiesFilterStatement<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  query: Q,
  options: FetchFromStorageOptions,
  pipelineItem: QueryPipelineData,
  filter: FilterStatement<M, Q['collectionName']>
) {
  const { collectionName } = query;
  const { schema } = options;
  const { entity } = pipelineItem;
  const [path, op, filterValue] = filter;
  const dataType = schema
    ? getAttributeFromSchema(path.split('.'), schema, collectionName)
    : undefined;
  // If we have a schema handle specific cases
  if (dataType && dataType.type === 'set') {
    return satisfiesSetFilter(
      entity,
      path,
      // @ts-expect-error
      op,
      filterValue
    );
  }
  // Use register as default
  return satisfiesRegisterFilter(
    entity,
    path,
    // @ts-expect-error
    op,
    filterValue
  );
}

// TODO: this should probably go into the set defintion
// TODO: handle possible errors with sets
export function satisfiesSetFilter(
  entity: any,
  path: string,
  op: Operator,
  filterValue: any
) {
  const pointer = '/' + path.replaceAll('.', '/');
  const value: Record<string, [boolean, Timestamp]> = EntityPointer.Get(
    entity,
    pointer
  );
  // We dont really support "deleting" sets, but they can appear deleted if the entity is deleted
  // Come back to this after refactoring triple reducer to handle nested data betters
  if (Array.isArray(value)) {
    // indicates set is deleted
    if (value[0] === undefined) {
      return false;
    }
  }

  const setData = timestampedObjectToPlainObject(value);
  if (!setData) return false;
  const filteredSet = Object.entries(setData).filter(([_v, inSet]) => inSet);
  if (op === 'has') {
    return filteredSet.some(([v]) => v === filterValue);
  }
  if (op === '!has') {
    return filteredSet.every(([v]) => v !== filterValue);
  }

  return filteredSet.some(([v]) => isOperatorSatisfied(op, v, filterValue));
}

export function satisfiesRegisterFilter(
  entity: any,
  path: string,
  op: Operator,
  filterValue: any
) {
  const maybeValue = EntityPointer.Get(entity, '/' + path.replaceAll('.', '/'));

  // maybeValue is expected to be of shape [value, timestamp]
  // this may happen if a schema is expected but not there and we're reading a value that cant be parsed, the schema is incorrect somehow, or if the provided path is incorrect
  const isTimestampedValue =
    !!maybeValue && maybeValue instanceof Array && maybeValue.length === 2;
  const isTerminalValue =
    !!maybeValue &&
    isTimestampedValue &&
    (typeof maybeValue[0] !== 'object' || maybeValue[0] === null);
  if (!!maybeValue && (!isTimestampedValue || !isTerminalValue)) {
    console.warn(
      `Received an unexpected value at path '${path}' in entity ${JSON.stringify(
        entity
      )} which could not be interpreted as a register when reading filter ${JSON.stringify(
        [path, op, filterValue]
      )}. This is likely caused by (1) the database not properly loading its schema and attempting to interpret a value that is not a regsiter as a register, (2) a schemaless database attempting to interpret a value that is not properly formatted as a register, or (3) a query with a path that does not lead to a leaf attribute in the entity.`
    );
    return false;
  }
  const [value, _ts] = maybeValue ?? [undefined, undefined];
  return isOperatorSatisfied(op, value, filterValue);
}

function isOperatorSatisfied(op: Operator, value: any, filterValue: any) {
  switch (op) {
    case '=':
      return value == filterValue;
    case '!=':
      return value !== filterValue;
    case '>':
      return value > filterValue;
    case '>=':
      return value >= filterValue;
    case '<':
      return value < filterValue;
    case '<=':
      return value <= filterValue;

    //TODO: move regex initialization outside of the scan loop to improve performance
    case 'like':
      return ilike(value, filterValue);
    case 'nlike':
      return !ilike(value, filterValue);
    case 'in':
      return new Set(filterValue).has(value);
    case 'nin':
      return !new Set(filterValue).has(value);
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

// TODO: would be safest to have a way to determine if a filter is basic, otherwise return 'unknown' (or fail)
function determineFilterType(
  filter: WhereFilter<any, any>
): 'basic' | 'relational' {
  if ('exists' in filter) {
    return 'relational';
  }
  if ('mod' in filter) {
    const { filters } = filter;
    const groupingTypes = filters.map((f) => determineFilterType(f));
    if (groupingTypes.includes('relational')) {
      return 'relational';
    }
  }
  return 'basic';
}

/**
 * Based on the type of filter, determine its priority in execution
 */
export function getFilterPriorityOrder<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q): number[] {
  const { where = [] } = query;
  const basicFilters = [];
  const relationalFilters = [];

  for (let i = 0; i < where.length; i++) {
    const filter = where[i];
    const filterType = determineFilterType(filter);
    if (filterType === 'relational') {
      relationalFilters.push(i);
    } else {
      basicFilters.push(i);
    }
  }

  return [...basicFilters, ...relationalFilters];
}
