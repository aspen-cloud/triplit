import { CollectionQuery } from './collection-query';
import DB, { ModelFromModels } from './db';
import { mapFilterStatements } from './db-helpers';
import { FilterStatement } from './query';
import { Models } from './schema';
import * as TB from '@sinclair/typebox/value';

export class VariableAwareCache<M extends Models<any, any>> {
  cache: Map<BigInt, Map<string, any>>;

  constructor(readonly db: DB<M>) {
    this.cache = new Map();
  }

  static canCacheQuery<Q extends CollectionQuery<ModelFromModels<any>>>(
    query: Q
  ) {
    if (query.where.some((f) => !(f instanceof Array) && !('exists' in f)))
      return false;
    const statements = mapFilterStatements(query.where, (f) => f).filter(
      (f) => f instanceof Array
    );
    const variableStatements: FilterStatement<ModelFromModels<M>>[] =
      statements.filter(
        ([, , v]) => typeof v === 'string' && v.startsWith('$')
      );
    if (variableStatements.length !== 1) return false;
    // if (variableStatements[0][1] !== '=') return false;
    if (!['=', '<', '<=', '>', '>=', '!='].includes(variableStatements[0][1]))
      return false;
    return true;
  }

  async createView<Q extends CollectionQuery<ModelFromModels<M>>>(
    viewQuery: Q
  ) {
    return new Promise<void>((resolve) => {
      const id = this.viewQueryToId(viewQuery);
      this.db.subscribe(viewQuery, (results) => {
        this.cache.set(id, results);
        // console.log('setting index', id, results);
        resolve();
      });
    });
  }

  viewQueryToId(viewQuery: any) {
    return TB.Value.Hash(viewQuery);
  }

  async resolveFromCache(query: CollectionQuery<ModelFromModels<M>>) {
    const { views, variableFilters } = this.queryToViews(query);
    const id = this.viewQueryToId(views[0]);
    // console.log('attempting to use index for', id);
    if (!this.cache.has(id)) {
      await this.createView(views[0]);
    }
    // TODO support multiple variable clauses
    const [prop, op, varStr] = variableFilters[0];
    const varKey = varStr.slice(1);
    const varValue = query.vars![varKey];

    const resultEntries = [...this.cache.get(id)!.entries()];

    let start, end;
    if (['=', '<', '<=', '>', '>='].includes(op)) {
      start = binarySearch(
        resultEntries,
        varValue,
        ([, ent]) => ent[prop],
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
        resultEntries,
        varValue,
        ([, ent]) => ent[prop],
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
        resultEntries,
        varValue,
        ([, ent]) => ent[prop],
        'start',
        (a, b) => {
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      end = binarySearch(
        resultEntries,
        varValue,
        ([, ent]) => ent[prop],
        'end',
        (a, b) => {
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      return new Map([
        ...resultEntries.slice(0, start + 1),
        ...resultEntries.slice(end),
      ]);
    }
    if (start == undefined || end == undefined) {
      throw new Error(
        'Cannot index queries that have a variable and use this operator:' + op
      );
    }
    return new Map(resultEntries.slice(start, end + 1));
  }

  queryToViews<Q extends CollectionQuery<ModelFromModels<M>>>(query: Q) {
    const variableFilters: FilterStatement<ModelFromModels<M>>[] = [];
    const nonVariableFilters = query.where.filter((filter) => {
      if (!(filter instanceof Array)) return true;
      const [_prop, _op, val] = filter;
      if (typeof val === 'string' && val.startsWith('$')) {
        variableFilters.push(filter);
        return false;
      }
      return true;
    });
    return {
      views: [
        {
          collectionName: query.collectionName,
          where: nonVariableFilters,
          select: query.select,
          order: [
            ...variableFilters.map((f) => [f[0], 'ASC']),
            ...(query.order ?? []),
          ],
        },
      ],
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
