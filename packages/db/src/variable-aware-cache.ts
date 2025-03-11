import { QueryCacheError } from './errors.js';
import { DB } from './db.js';
import { isFilterStatement, isSubQueryFilter } from './filters.js';
import { isValueVariable } from './variables.js';
import {
  getAttributeFromSchema,
  isTraversalRelationship,
} from './schema/utilities.js';
import { DBEntity } from './types.js';
import { CollectionQuery, FilterStatement } from './query.js';
import { Models } from './schema/index.js';
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
    // if (query.limit !== undefined) return false;
    // if (query.where && query.where.some((f) => !isFilterStatement(f)))
    //   return false;

    // if (query.include && Object.keys(query.include).length > 0) return false;

    // This is shouldn't be the case anymore (since we use include for sub relations)
    if (query.select && query.select.some((s) => typeof s === 'object'))
      return false;

    const statements = (query.where ?? []).filter(isFilterStatement);
    const variableStatements = statements.filter(([, , v]) =>
      isValueVariable(v)
    );
    // So currently we'll only support queries with:
    // 1. a single variable filter (typical relational subquery)
    // 2. no variable filters which is an odd one (inspired by benchmarks query)
    //    bc resolving from it is trivial (just return all entities)
    // if (variableStatements.length > 1) return false;

    if (!['=', '<', '<=', '>', '>=', '!='].includes(variableStatements[0]?.[1]))
      return false;

    if (schema) {
      const attributeSchema = getAttributeFromSchema(
        (variableStatements[0][0] as string).split('.'),
        schema,
        query.collectionName
      );
      if (!attributeSchema) return false;
      if (isTraversalRelationship(attributeSchema)) return false;
      if (attributeSchema.type === 'set') return false;
    }
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
      return resultEntries.map(([key]) => key);
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

  static queryToViews(query: CollectionQuery) {
    const variableFilters: FilterStatement[] = [];
    const staticFilters = query.where
      ? query.where.filter((filter) => {
          if (isSubQueryFilter(filter)) {
            return false;
          }
          if (filter instanceof Array) {
            const [prop, _op, val] = filter;
            if (isValueVariable(val)) {
              variableFilters.push([prop, _op, val]);
              return false;
            }
          }

          return true;
        })
      : undefined;
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
    };
  }
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
