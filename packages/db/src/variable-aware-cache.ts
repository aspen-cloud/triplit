import {
  CollectionQuerySchema,
  FetchResult,
  subscribeResultsAndTriples,
} from './collection-query.js';
import { ModelFromModels } from './db.js';
import { mapFilterStatements } from './db-helpers.js';
import {
  CollectionQuery,
  FilterStatement,
  isFilterStatement,
} from './query.js';
import { Models, getSchemaFromPath } from './schema.js';
import * as TB from '@sinclair/typebox/value';
import { TripleRow, TripleStore } from './triple-store.js';
import { QueryCacheError } from './errors.js';

export class VariableAwareCache<Schema extends Models<any, any>> {
  cache: Map<
    BigInt,
    {
      results: Map<string, any>;
      triples: Map<string, TripleRow[]>;
    }
  >;

  constructor(readonly tripleStore: TripleStore) {
    this.cache = new Map();
  }

  static canCacheQuery<
    M extends Models<any, any> | undefined,
    Q extends CollectionQuery<any, any>
  >(query: Q, model?: ModelFromModels<M> | undefined) {
    // if (!model) return false;
    if (
      query.where &&
      query.where.some((f) => !(f instanceof Array) && !('exists' in f))
    )
      return false;

    if (query.select && query.select.some((s) => typeof s === 'object'))
      return false;

    const statements = mapFilterStatements(query.where ?? [], (f) => f).filter(
      isFilterStatement
    ) as FilterStatement<ModelFromModels<M>>[];
    const variableStatements: FilterStatement<ModelFromModels<M>>[] =
      statements.filter(
        ([, , v]) => typeof v === 'string' && v.startsWith('$')
      );
    if (variableStatements.length !== 1) return false;

    if (!['=', '<', '<=', '>', '>=', '!='].includes(variableStatements[0][1]))
      return false;
    if (model) {
      const attributeSchema = getSchemaFromPath(
        model,
        (variableStatements[0][0] as string).split('.')
      );
      if (attributeSchema.type === 'set') return false;
    }
    return true;
  }

  async createView<Q extends CollectionQuery<Schema, any>>(viewQuery: Q) {
    return new Promise<void>((resolve) => {
      const id = this.viewQueryToId(viewQuery);
      subscribeResultsAndTriples<Schema, Q>(
        this.tripleStore,
        viewQuery,
        ([results, triples]) => {
          this.cache.set(id, { results, triples });
          resolve();
        }
      );
    });
  }

  viewQueryToId(viewQuery: any) {
    return TB.Value.Hash(viewQuery);
  }

  async resolveFromCache<Q extends CollectionQuery<Schema, any>>(
    query: Q
  ): Promise<{
    results: FetchResult<Q>;
    triples: Map<string, TripleRow[]>;
  }> {
    const { views, variableFilters } = this.queryToViews(query);

    const id = this.viewQueryToId(views[0]);
    // console.log('attempting to use index for', id);
    if (!this.cache.has(id)) {
      await this.createView(views[0]);
    }
    // TODO support multiple variable clauses
    const [prop, op, varStr] = variableFilters[0];
    const varKey = (varStr as string).slice(1);
    const varValue = query.vars![varKey];
    const view = this.cache.get(id)!;
    const viewResultEntries = [...view.results.entries()];
    let start, end;
    if (['=', '<', '<=', '>', '>='].includes(op)) {
      start = binarySearch(
        viewResultEntries,
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
        viewResultEntries,
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
        viewResultEntries,
        varValue,
        ([, ent]) => ent[prop],
        'start',
        (a, b) => {
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      end = binarySearch(
        viewResultEntries,
        varValue,
        ([, ent]) => ent[prop],
        'end',
        (a, b) => {
          return a === b ? 0 : a < b ? -1 : 1;
        }
      );
      const resultEntries = [
        ...viewResultEntries.slice(0, start + 1),
        ...viewResultEntries.slice(end),
      ];
      return {
        results: new Map(resultEntries) as FetchResult<Q>,
        triples: new Map(
          resultEntries.map(([id, _]) => [id, view.triples.get(id)!])
        ),
      };
    }
    if (start == undefined || end == undefined) {
      throw new QueryCacheError(
        `Queries with the operator ${op} in a where clause can't be stored in the query cache. Currently, supported operators are: ${[
          '=',
          '!=',
          '<',
          '<=',
          '>',
          '>=',
        ]}`
      );
    }
    const resultEntries = viewResultEntries.slice(start, end + 1);

    return {
      results: new Map(resultEntries) as FetchResult<Q>,
      triples: new Map(
        resultEntries.map(([id, _]) => [id, view.triples.get(id)!])
      ),
    };
  }

  queryToViews<Q extends CollectionQuery<Schema, any>>(query: Q) {
    const variableFilters: FilterStatement<
      CollectionQuerySchema<Q> | undefined
    >[] = [];
    const nonVariableFilters = query.where
      ? query.where.filter((filter) => {
          if (!(filter instanceof Array)) return true;
          const [prop, _op, val] = filter;
          if (typeof val === 'string' && val.startsWith('$')) {
            variableFilters.push([prop as string, _op, val]);
            return false;
          }
          return true;
        })
      : undefined;
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
      ] as Q[],
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
