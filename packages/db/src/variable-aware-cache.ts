import { QueryCacheError } from './errors.js';
import { DB } from './db.js';
import {
  isFilterStatement,
  isStaticFilter,
  isSubQueryFilter,
} from './filters.js';
import { isValueVariable } from './variables.js';
import {
  getAttributeFromSchema,
  isTraversalRelationship,
} from './schema/utilities.js';
import { DBEntity, QueryWhere, WhereFilter } from './types.js';
import { CollectionQuery, FilterStatement } from './query.js';
import { isPrimitiveType, Models } from './schema/index.js';
import { ViewEntity } from './query-engine.js';

export class VariableAwareCache {
  cache: Map<
    string,
    {
      results: Map<string, DBEntity>;
      //   triples: TripleRow[];
    }
  >;

  constructor(readonly db: DB) {
    this.cache = new Map();
  }

  static canCacheQuery(query: CollectionQuery, schema: Models | undefined) {
    if (!query.where || query.where.length === 0) return true;
    // Queries with limit are somewhat hard to accommodate
    // While it's totally correct to create the view for the query with limit
    // it can be fairly inefficient if the limit greatly reduces the number of
    // returned results from the possible results
    //   e.g. "conversations with latest message"
    // this is tricky because `exist` filters create a query with limit 1
    // so the limit itself is not always a good heuristic to rely on because
    // if the relation is on the entities ID then even after you apply LIMIT 1
    // you've likely used most results in the view so it's fine

    const orderableStatements = (query.where ?? []).filter(
      isOrderableFilter(schema, query)
    );
    if (orderableStatements.length === 0) return false;
    return true;
  }

  viewQueryToId(viewQuery: any) {
    return JSON.stringify(viewQuery);
    // return TB.Value.Hash(viewQuery);
  }

  static resolveQueryFromView(viewResults: ViewEntity[], [prop, op, val]: any) {
    let start, end;
    if (['=', '<', '<=', '>', '>='].includes(op)) {
      start = binarySearch(
        viewResults,
        val,
        (ent) => ent.data[prop],
        'start',
        (a, b) => {
          if (op === '<') return a < b ? 0 : 1;
          if (op === '<=') return a <= b ? 0 : 1;
          if (op === '>') return a > b ? 0 : -1;
          if (op === '>=') return a >= b ? 0 : -1;
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      end = binarySearch(
        viewResults,
        val,
        (ent) => ent.data[prop],
        'end',
        (a, b) => {
          if (op === '<') return a < b ? 0 : 1;
          if (op === '<=') return a <= b ? 0 : 1;
          if (op === '>') return a > b ? 0 : -1;
          if (op === '>=') return a >= b ? 0 : -1;
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
    }
    if (op === '!=') {
      start = binarySearch(
        viewResults,
        val,
        (ent) => ent.data[prop],
        'start',
        (a, b) => {
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      end = binarySearch(
        viewResults,
        val,
        (ent) => ent.data[prop],
        'end',
        (a, b) => {
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      const resultEntries = [
        ...viewResults.slice(0, start + 1),
        ...viewResults.slice(end),
      ];
      return resultEntries;
    }
    if (start == undefined || end == undefined) {
      throw new QueryCacheError(
        `Queries with the operator "${op}" in a where clause can't be stored in the query cache. Currently, supported operators are: ${[
          '=',
          '!=',
          '<',
          '<=',
          '>',
          '>=',
        ]}`
      );
    }
    return viewResults.slice(start, end + 1);
  }

  static queryToViews(query: CollectionQuery, schema: Models | undefined) {
    const variableFilters: FilterStatement[] = [];
    const staticFilters: QueryWhere = [];
    const unusedFilters: QueryWhere = [];
    const isOrderable = isOrderableFilter(schema, query);
    for (const filter of query.where ?? []) {
      if (isOrderable(filter)) {
        variableFilters.push(filter);
        continue;
      }
      if (isStaticFilter(filter)) {
        staticFilters.push(filter);
        continue;
      }
      unusedFilters.push(filter);
    }
    return {
      views: [
        {
          collectionName: query.collectionName,
          where: staticFilters,
          order: [
            ...variableFilters.map((f) => [f[0], 'ASC']),
            ...(query.order ?? []),
          ],
          limit: variableFilters.length > 0 ? undefined : query.limit,
          include: query.include,
        },
      ] as CollectionQuery[],
      variableFilters,
      unusedFilters,
    };
  }
}

function isOrderableFilter(schema: Models | undefined, query: CollectionQuery) {
  return (filter: WhereFilter): filter is FilterStatement => {
    if (!isFilterStatement(filter)) return false;
    const [prop, op, val] = filter;
    if (!isValueVariable(val)) return false;
    if (!['=', '<', '<=', '>', '>=', '!='].includes(op)) return false;
    if (schema) {
      const attribute = getAttributeFromSchema(
        prop.split('.'),
        schema,
        query.collectionName
      );
      if (!attribute) return false;
      if (isTraversalRelationship(attribute)) return false;
      if (!isPrimitiveType(attribute)) return false;
    }
    return true;
  };
}

/**
 * A basic binary search function that takes a custom accessor function that
 * can also be used to find the beginning and end of ranges where there are
 * runs of the same value
 */
function binarySearch<T, V>(
  arr: T[],
  target: V,
  accessor: (t: T) => V,
  dir: 'start' | 'end' = 'start',
  comparer: (a: V, b: V) => number = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
): number {
  let start = 0;
  let end = arr.length - 1;
  let result = -1;
  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    const midValue = accessor(arr[mid]);
    if (comparer(midValue, target) === 0) {
      result = mid;
      if (dir === 'start') {
        end = mid - 1;
      } else {
        start = mid + 1;
      }
    } else if (comparer(midValue, target) < 0) {
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }
  return result;
}
