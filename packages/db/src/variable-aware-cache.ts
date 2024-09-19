import {
  FetchExecutionContext,
  FetchFromStorageOptions,
  getQueryVariables,
  subscribeResultsAndTriples,
} from './collection-query.js';
import { CollectionNameFromModels } from './db.js';
import {
  appendCollectionToId,
  isValueVariable,
  replaceVariable,
} from './db-helpers.js';
import { isFilterStatement } from './query.js';
import { CollectionQuery, FilterStatement } from './query/types/index.js';
import { getSchemaFromPath } from './schema/schema.js';
import { Model, Models } from './schema/types/index.js';
import * as TB from '@sinclair/typebox/value';
import type DB from './db.js';
import { QueryCacheError } from './errors.js';
import { TripleRow } from './triple-store-utils.js';
import { QueryExecutionCache } from './query/execution-cache.js';

export class VariableAwareCache<Schema extends Models> {
  cache: Map<
    BigInt,
    {
      results: Map<string, any>;
      triples: TripleRow[];
    }
  >;

  constructor(readonly db: DB<Schema>) {
    this.cache = new Map();
  }

  static canCacheQuery(
    query: CollectionQuery<any, any>,
    model?: Model | undefined
  ) {
    // if (!model) return false;
    if (query.limit !== undefined) return false;
    if (query.where && query.where.some((f) => !isFilterStatement(f)))
      return false;

    if (query.include && Object.keys(query.include).length > 0) return false;

    // This is shouldn't be the case anymore (since we use include for sub relations)
    if (query.select && query.select.some((s) => typeof s === 'object'))
      return false;

    const statements = (query.where ?? []).filter(isFilterStatement);
    const variableStatements: FilterStatement<any, any>[] = statements.filter(
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

  async createView<Q extends CollectionQuery<Schema, any>>(
    viewQuery: Q,
    schema: Schema
  ) {
    return new Promise<void>((resolve) => {
      const id = this.viewQueryToId(viewQuery);
      subscribeResultsAndTriples<Schema, Q>(
        this.db.tripleStore,
        viewQuery,
        {
          schema,
          skipRules: true,
          session: {
            roles: this.db.sessionRoles,
            systemVars: this.db.systemVars,
          },
        },
        ([results, triples]) => {
          this.cache.set(id, {
            results: new Map(results.map((e) => [e.id as string, e])),
            triples: Array.from(triples.values()).flat(),
          });
          resolve();
        },
        (err) => {
          console.error('error in view', err);
          this.cache.delete(id);
        }
      );
    });
  }

  viewQueryToId(viewQuery: any) {
    return TB.Value.Hash(viewQuery);
  }

  async resolveFromCache<Q extends CollectionQuery<Schema, any>>(
    query: Q,
    executionContext: FetchExecutionContext,
    options: FetchFromStorageOptions
  ): Promise<string[]> {
    const { views, variableFilters } = this.queryToViews(query);
    const id = this.viewQueryToId(views[0]);
    if (!this.cache.has(id)) {
      // NOTE: dangerously setting ! on options.schema (not sure if schema is actually required or not)
      await this.createView(views[0], options.schema! as Schema);
    }
    // TODO support multiple variable clauses
    const [prop, op, varStr] = variableFilters[0];
    const varKey = (varStr as string).slice(1);
    const vars = getQueryVariables(query, executionContext, options);
    const varValue = replaceVariable(varStr, vars);
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
      loadViewResultIntoExecutionCache(
        resultEntries,
        query,
        view,
        executionContext
      );
      return resultEntries.map(([key]) =>
        appendCollectionToId(query.collectionName, key)
      );
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
    loadViewResultIntoExecutionCache(
      resultEntries,
      query,
      view,
      executionContext
    );
    return resultEntries.map(([key]) =>
      appendCollectionToId(query.collectionName, key)
    );
  }

  queryToViews<
    CN extends CollectionNameFromModels<Schema>,
    Q extends CollectionQuery<Schema, CN>
  >(query: Q) {
    const variableFilters: FilterStatement<Schema, CN>[] = [];
    const nonVariableFilters = query.where
      ? query.where.filter((filter) => {
          if (!(filter instanceof Array)) return true;
          const [prop, _op, val] = filter;
          if (isValueVariable(val)) {
            variableFilters.push([prop, _op, val]);
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
          // select: query.select,
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

function loadViewResultIntoExecutionCache<M extends Models>(
  resultEntries: [string, any][],
  query: CollectionQuery<M>,
  view: {
    results: Map<string, any>;
    triples: TripleRow[];
  },
  executionContext: FetchExecutionContext
) {
  resultEntries.forEach((entry) => {
    const entityId = appendCollectionToId(query.collectionName, entry[0]);
    const entity = entry[1];

    if (!executionContext.executionCache.hasData(entityId)) {
      executionContext.executionCache.setData(entityId, {
        entity: entity,
        triples: view.triples.filter((t) => t.id === entityId),
      });
    }

    // Create query component if not loaded
    const componentKey = QueryExecutionCache.ComponentId(
      executionContext.componentPrefix,
      entityId
    );
    if (!executionContext.executionCache.hasComponent(componentKey)) {
      const component = {
        entityId,
        relationships: {},
      };
      executionContext.executionCache.setComponent(componentKey, component);
    }
  });
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
