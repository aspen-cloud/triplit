import { ValuePointer } from '@sinclair/typebox/value';
import {
  FetchExecutionContext,
  isQueryInclusionSubquery,
} from '../collection-query.js';
import { splitIdParts } from '../db-helpers.js';
import { Entity } from '../entity.js';
import { QueryNotPreparedError } from '../errors.js';
import { Model, Models } from '../schema/types/index.js';
import { TripleRow } from '../triple-store-utils.js';
import {
  QueryComponentCacheEntry,
  entityIdFromComponentId,
} from './execution-cache.js';
import {
  CollectionQuery,
  FetchResultEntity,
  SchemaQueries,
} from './types/index.js';

export function getQueryComponentsFromContext<
  M extends Models,
  Q extends SchemaQueries<M>
>(
  query: Q,
  entityOrder: string[],
  executionContext: FetchExecutionContext
): Map<string, QueryComponentCacheEntry> {
  const { executionCache } = executionContext;
  const results = new Map<string, QueryComponentCacheEntry>();
  for (const componentId of entityOrder) {
    // Root entities should have a component
    const component = executionCache.getComponent(componentId);
    if (!component) continue;
    const entityId = entityIdFromComponentId(componentId);
    if (results.has(entityId)) continue;
    results.set(entityId, component);
  }
  return results;
}

export function getEntitiesFromContext<
  M extends Models,
  Q extends SchemaQueries<M>
>(
  query: Q,
  entityOrder: string[],
  executionContext: FetchExecutionContext
): Map<string, Entity> {
  const { executionCache } = executionContext;
  const results = new Map<string, Entity>();
  const components = getQueryComponentsFromContext<M, Q>(
    query,
    entityOrder,
    executionContext
  );
  for (const [entityId, component] of components) {
    if (results.has(entityId)) continue;
    const cachedEntity = executionCache.getData(component.entityId);
    if (!cachedEntity) continue;
    results.set(entityId, cachedEntity.entity);
  }
  return results;
}

export function getResultTriplesFromContext<
  M extends Models,
  Q extends SchemaQueries<M>
>(
  query: Q,
  entityOrder: string[],
  executionContext: FetchExecutionContext
): Map<string, TripleRow[]> {
  const triples: Map<string, TripleRow[]> = new Map();
  const { include } = query;
  const { executionCache } = executionContext;
  const components = getQueryComponentsFromContext<M, Q>(
    query,
    entityOrder,
    executionContext
  );
  for (const [entityId, component] of components) {
    const cachedEntity = executionCache.getData(component?.entityId ?? '');
    if (!cachedEntity) continue;

    // TODO: filter down triples by selection or just include all?
    const entityTriples = [...cachedEntity.entity.triples];

    // Load inclusions
    for (const [attributeName, inc] of Object.entries(include ?? {})) {
      if (!isQueryInclusionSubquery(inc)) {
        throw new QueryNotPreparedError('An inclusion is not prepared');
      }
      if (!component) continue;
      const { subquery, cardinality } = inc;
      let subqueryOrder = component.relationships[attributeName];
      if (typeof subqueryOrder === 'string') subqueryOrder = [subqueryOrder];
      const subqueryResult = getResultTriplesFromContext<M, typeof subquery>(
        subquery,
        subqueryOrder ?? [],
        executionContext
      );

      // TODO: ensure these triples are de-duped...like if you load the same entity mulitple times in subqueries
      for (const triple of Array.from(subqueryResult.values()).flat()) {
        entityTriples.push(triple);
      }
    }
    triples.set(splitIdParts(entityId)[1], entityTriples);
  }
  return triples;
}

export function getSyncTriplesFromContext<
  M extends Models,
  Q extends SchemaQueries<M>
>(query: Q, entityOrder: string[], executionContext: FetchExecutionContext) {
  const triples = getResultTriplesFromContext<M, Q>(
    query,
    entityOrder,
    executionContext
  );
  const flatTriples = Array.from(triples.values()).flat();
  for (const entityId of executionContext.fulfillmentEntities) {
    // If we've already loaded this entity skip to avoid dupes
    if (triples.has(entityId)) continue;
    const fullfillmentTriples =
      executionContext.executionCache.getData(entityId)?.entity.triples ?? [];
    for (const triple of fullfillmentTriples) {
      flatTriples.push(triple);
    }
  }
  return flatTriples;
}

export function getQueryResultsFromContext<
  M extends Models,
  Q extends SchemaQueries<M>
>(
  query: Q,
  entityOrder: string[],
  executionContext: FetchExecutionContext
): Map<string, FetchResultEntity<M, Q>> {
  const { select, include } = query;
  const { executionCache } = executionContext;
  const results = new Map<string, FetchResultEntity<M, Q>>();
  const components = getQueryComponentsFromContext<M, Q>(
    query,
    entityOrder,
    executionContext
  );
  for (const [entityId, component] of components) {
    const cachedEntity = executionCache.getData(component.entityId);
    if (!cachedEntity) continue;
    const entity = cachedEntity.entity.data;
    const entityWithSelection = filterEntityToSelection(query, entity);

    // Load inclusions
    for (const [attributeName, inc] of Object.entries(include ?? {})) {
      if (!isQueryInclusionSubquery(inc)) {
        throw new QueryNotPreparedError('An inclusion is not prepared');
      }
      if (!component) continue;
      const { subquery, cardinality } = inc;
      let subqueryOrder = component.relationships[attributeName];
      if (typeof subqueryOrder === 'string') subqueryOrder = [subqueryOrder];
      const subqueryResult = Array.from(
        getQueryResultsFromContext<M, typeof subquery>(
          subquery,
          subqueryOrder ?? [],
          executionContext
        ).values()
      );

      entityWithSelection[attributeName] =
        cardinality === 'one' ? subqueryResult[0] ?? null : subqueryResult;
    }

    results.set(splitIdParts(entityId)[1], entityWithSelection);
  }
  return results;
}

export function filterEntityToSelection(
  query: CollectionQuery<any, any>,
  entity: Record<string, any>
) {
  const entityWithSelection: any = {};

  // Determine selection
  const selection = query.select ?? Object.keys(entity);

  // Take selected keys
  for (const key of selection) {
    // Use ValuePointer to handle nested keys
    const pointerKey = '/' + key.split('.').join('/');
    const val = ValuePointer.Get(entity, pointerKey);
    ValuePointer.Set(entityWithSelection, pointerKey, val);
  }
  return entityWithSelection;
}
