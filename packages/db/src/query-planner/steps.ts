import { Entity } from '../types.js';
import { getFilterPriorityOrder, satisfiesFilter } from '../filters.js';
import { asyncIterEvery } from '../utils/iterators.js';
import { satisfiesAfter } from '../after.js';
import { compareValue, MIN } from '../codec.js';
import { ValuePointer } from '../value-pointer.js';
import type { PlanStep, ExecutionContext } from '../query-engine.js';

/**
 * Step: Filter & collect candidates into ctx.results
 */
export async function filterAndCollectEntities(
  ctx: ExecutionContext
): Promise<ExecutionContext> {
  const { engine, query, candidates } = ctx;
  const filterOrder = getFilterPriorityOrder(query.where);
  const results: Entity[] = [];

  for await (const entity of candidates!) {
    if (query.limit && !query.order && results.length >= query.limit) {
      break;
    }
    if (!entity) continue;

    // Apply filters
    if (query.where && query.where.length > 0) {
      const passed = await asyncIterEvery(filterOrder, (idx) =>
        satisfiesFilter(
          engine,
          { collectionName: query.collectionName, data: entity },
          query.where![idx]
        )
      );
      if (!passed) continue;
    }

    // Apply `after` (cursor)
    if (query.after) {
      if (!satisfiesAfter(entity, query.after, query.order)) {
        continue;
      }
    }

    results.push({ ...entity });
  }
  ctx.results = results;
  return ctx;
}

/**
 * Step: Order the results (if query.order is provided)
 */
export async function orderResults(
  ctx: ExecutionContext
): Promise<ExecutionContext> {
  const { engine, query, results } = ctx;
  if (!query.order || query.order.length === 0) {
    return ctx;
  }

  // Possibly load data needed for ordering (subqueries, etc.)
  const loadedKeys: Set<string> = new Set();
  if (engine.schema) {
    for (const clause of query.order) {
      const [attr /* direction */, , maybeSubquery] = clause;
      // If we allow subqueries in order clauses, do that here
      const orderSubquery = maybeSubquery as
        | {
            subquery: any; // CollectionQuery
            cardinality: 'one' | 'many';
          }
        | undefined;
      if (orderSubquery) {
        // Load the relational data for each result
        for (const result of results) {
          const loadedRelationalData = await engine.loadSubquery(
            { collectionName: query.collectionName, data: result },
            orderSubquery
          );
          if (loadedRelationalData !== undefined) {
            const loadedKey = attr.split('.')[0];
            result[loadedKey] = loadedRelationalData;
            loadedKeys.add(loadedKey);
          }
        }
      }
    }
  }

  // Sort
  results.sort((a, b) => {
    for (const [attr, dir] of query.order) {
      const direction = compareValue(
        ValuePointer.Get(a, attr) ?? MIN,
        ValuePointer.Get(b, attr) ?? MIN
      );
      if (direction !== 0) {
        return dir === 'ASC' ? direction : -direction;
      }
    }
    return 0;
  });

  // Clean up loaded data after use
  for (const key of loadedKeys) {
    for (const result of results) {
      delete result[key];
    }
  }

  return ctx;
}

/**
 * Step: Apply limit
 */
export async function applyLimit(
  ctx: ExecutionContext
): Promise<ExecutionContext> {
  const { query, results } = ctx;
  if (query.limit !== undefined) {
    ctx.results = results.slice(0, query.limit);
  }
  return ctx;
}

/**
 * Step: Load includes
 */
export async function loadIncludes(
  ctx: ExecutionContext
): Promise<ExecutionContext> {
  const { engine, query, results } = ctx;
  if (query.include) {
    await engine.loadIncludes(query, results, query.include);
  }
  return ctx;
}

/**
 * Step: Get candidates via "by ID" approach (the specialized logic for id= or id in)
 */
export async function getCandidatesById(
  ctx: ExecutionContext
): Promise<ExecutionContext> {
  const { engine, query } = ctx;
  // This re-uses the logic that looks up “idFilters” from the old code
  const candidates = await engine.getCollectionCandidatesById(query);
  ctx.candidates = candidates;
  return ctx;
}

/**
 * Step: Full-scan retrieval of candidates
 */
export async function getCandidatesFullScan(
  ctx: ExecutionContext
): Promise<ExecutionContext> {
  const { engine, query } = ctx;
  // This re-uses the logic from the old code that returns all entities in a collection
  ctx.candidates = await engine.getCollectionCandidates(query);
  return ctx;
}
