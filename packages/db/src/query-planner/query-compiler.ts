import {
  CollectionQuery,
  FilterGroup,
  FilterStatement,
  QueryAfter,
  QueryOrder,
  QueryWhere,
  SubQueryFilter,
} from '../types.js';
import { isFilterGroup, isSubQueryFilter } from '../filters.js';
import { getVariableComponents, isValueVariable } from '../variables.js';
import { getIdFilter, hasIdFilter } from './heuristics.js';
import { VariableAwareCache as VAC } from '../variable-aware-cache.js';

export interface RelationalPlan {
  views: Record<string, CollectionQuery>;
  rootQuery: CollectionQuery;
}

export type Step =
  | {
      type: 'SCAN';
      collectionName: string;
    }
  | {
      type: 'ID_LOOK_UP';
      collectionName: string;
      ids: string[]; // e.g. "$view_1.id" or ["id1", "id2"]
    }
  | {
      type: 'RESOLVE_FROM_VIEW';
      viewId: string;
      filter: FilterStatement[];
    }
  | {
      type: 'COLLECT';
    }
  | {
      type: 'ITERATOR_FILTER';
      filter: (FilterStatement | FilterGroup | { after: QueryAfter })[];
    }
  | {
      type: 'ITERATOR_LIMIT';
      count: number;
    }
  | {
      type: 'ITERATOR_SUBQUERY_FILTER';
      subPlan: Step[];
    }
  // Array filters after COLLECT
  // NOTE this also includes `after` filters
  | {
      type: 'FILTER';
      filter: (FilterStatement | FilterGroup | { after: QueryAfter })[];
    }
  | {
      type: 'SORT';
      fields: [string, 'ASC' | 'DESC'][];
    }
  | {
      type: 'LIMIT';
      count: number;
    }
  | {
      type: 'PREPARE_VIEW';
      viewId: string;
    }
  | {
      // A subquery for "include" or "exists" references
      type: 'SUBQUERY';
      alias: string; // for an Include
      subPlan: Step[];
    }
  | {
      // Pick the first result from a "one" include
      type: 'PICK';
    };

export interface ViewResultRef {
  type: 'VIEW_RESULT_IDS';
  viewId: string;
  field: string;
}

export interface CompiledPlan {
  steps: Step[];
  views: Record<string, CompiledPlan>;
}

export function extractViews(
  query: CollectionQuery,
  generateViewId: () => string
): RelationalPlan {
  const plan: RelationalPlan = {
    views: {},
    rootQuery: query,
  };
  if (query.where) {
    const { where, views } = whereFiltersToViews(query.where, generateViewId);
    query.where = where;
    Object.assign(plan.views, views);
  }

  if (query.include) {
    for (const [alias, inclusion] of Object.entries(query.include)) {
      // TODO: cleanup inclusion typings here
      if (inclusion === null || inclusion === true) continue;
      const { newViews, rewrittenQuery } = subqueryToView(
        inclusion.subquery,
        generateViewId
      );
      Object.assign(plan.views, newViews);
      query.include[alias] = {
        ...query.include[alias],
        subquery: rewrittenQuery,
      };
    }
  }

  if (query.order) {
    for (let i = 0; i < query.order.length; i++) {
      const [_attr, _direction, maybeSubquery] = query.order[i];
      if (maybeSubquery == null) {
        continue;
      }
      const { newViews, rewrittenQuery } = subqueryToView(
        maybeSubquery.subquery,
        generateViewId
      );
      Object.assign(plan.views, newViews);
      query.order[i][2] = { ...maybeSubquery, subquery: rewrittenQuery };
    }
  }

  return plan;
}

function subqueryToView(
  subquery: CollectionQuery,
  generateViewId: () => string
) {
  let newViews = null;
  let rewrittenQuery = null;
  const hasNestedSubquery =
    subquery.include && Object.keys(subquery.include).length > 0;
  if (VAC.canCacheQuery(subquery) && !hasNestedSubquery) {
    const viewId = generateViewId();
    const vacView = VAC.queryToViews(subquery);
    const extractedView = extractViews(vacView.views[0], generateViewId);
    newViews = { [viewId]: extractedView.rootQuery, ...extractedView.views };
    rewrittenQuery = {
      ...subquery,
      collectionName: `$view_${viewId}`,
      where: vacView.variableFilters,
    };
  } else {
    const extractedView = extractViews(subquery, generateViewId);
    newViews = extractedView.views;
    rewrittenQuery = extractedView.rootQuery;
  }
  return { newViews, rewrittenQuery };
}

function whereFiltersToViews(
  where: QueryWhere,
  generateViewId: () => string
): {
  where: QueryWhere;
  views: Record<string, CollectionQuery>;
} {
  const views: Record<string, CollectionQuery> = {};
  const updatedWhere: QueryWhere[] = [];
  for (const filter of where) {
    if (
      isSubQueryFilter(filter) &&
      !hasHigherLevelReferences(filter.exists.where)
    ) {
      const viewId = generateViewId();
      const extractedView = extractViews(filter.exists, generateViewId);
      views[viewId] = extractedView.rootQuery;
      Object.assign(views, extractedView.views);

      const variableFilters = new Set(
        filter.exists.where?.filter((f) => {
          return (
            Array.isArray(f) &&
            isValueVariable(f[2]) &&
            getVariableComponents(f[2])[0] === 1
          );
        })
      );

      extractedView.rootQuery.where = filter.exists.where?.filter(
        (f) => !variableFilters.has(f)
      );
      const viewFilters = [...variableFilters]?.map((f) => {
        return [
          getVariableComponents(f[2])[1],
          'in',
          `$view_${viewId}.${f[0]}`,
        ];
      });
      updatedWhere.push(...viewFilters);
    } else if (isFilterGroup(filter)) {
      const { where: newWhere, views: newViews } = whereFiltersToViews(
        filter.filters,
        generateViewId
      );
      updatedWhere.push({ ...filter, filters: newWhere });
      Object.assign(views, newViews);
    } else {
      updatedWhere.push(filter);
    }
  }
  return { where: updatedWhere, views };
}
function hasHigherLevelReferences(where: QueryWhere): boolean {
  for (const filter of where) {
    if (Array.isArray(filter) && isValueVariable(filter[2])) {
      const [level] = getVariableComponents(filter[2]);
      if (typeof level === 'number' && level > 1) return true;
    } else if (isFilterGroup(filter)) {
      if (hasHigherLevelReferences(filter.filters)) return true;
    } else if (isSubQueryFilter(filter)) {
      if (hasHigherLevelReferences(filter.exists.where || [])) return true;
    }
  }
  return false;
}

export function compileQuery(query: CollectionQuery): CompiledPlan {
  // console.dir({ query }, { depth: null });
  let nextViewId = 0;
  const generateViewId = (): string => {
    return `${nextViewId++}`;
  };
  const relationalPlan = extractViews(query, generateViewId);
  // console.dir({ relationalPlan }, { depth: null });
  const compiledPlan = compileRelationalPlan(relationalPlan);
  // console.dir({ compiledPlan }, { depth: null });
  return compiledPlan;
}

export function compileRelationalPlan(relPlan: RelationalPlan): CompiledPlan {
  const viewSteps: Record<string, CompiledPlan> = {};

  for (const [viewId, viewQuery] of Object.entries(relPlan.views)) {
    const steps = compileQueryToSteps(viewQuery);
    viewSteps[viewId] = { steps, views: {} };
  }

  const rootSteps = compileQueryToSteps(relPlan.rootQuery);

  const allRootSteps: Step[] = [];
  // Removed global preparation to avoid out-of-context view execution.
  allRootSteps.push(...rootSteps);

  return { steps: allRootSteps, views: viewSteps };
}

function getViewsReferencedInFilters(
  filters: FilterStatement[],
  viewNames: Set<string> = new Set()
): Set<string> {
  for (const filter of filters) {
    if (
      Array.isArray(filter) &&
      isValueVariable(filter[2]) &&
      filter[2].startsWith('$view_')
    ) {
      viewNames.add(filter[2]);
      continue;
    }
    if (isFilterGroup(filter)) {
      getViewsReferencedInFilters(filter.filters, viewNames);
    }
  }
  return viewNames;
}

/**
 * Convert a single Query (already free of `exists` subqueries)
 * into a straightforward step list: SCAN -> FILTER -> SORT -> LIMIT -> SUBQUERY includes, etc.
 *
 * In your real implementation, you'd choose index scans vs. full scans,
 * combine multiple filters, etc.
 */
function compileQueryToSteps(q: CollectionQuery): Step[] {
  const steps: Step[] = [];
  let hasLimitBeenHandled = false;
  let hasBeenCollected = false;
  let hasFiltersBeenHandled = false;
  let hasOrderBeenHandled = false;

  const subqueryFilters: SubQueryFilter[] = [];
  const simpleFilters:
    | FilterStatement[]
    | { after: QueryAfter; order: QueryOrder } = [];
  if (q.where) {
    for (const filter of q.where) {
      if (isSubQueryFilter(filter)) {
        subqueryFilters.push(filter);
      } else {
        simpleFilters.push(filter);
      }
    }
  }

  if (q.after) {
    simpleFilters.push({ after: q.after, order: q.order });
  }

  const [idFilter, idFilterIndex] = getIdFilter(q);

  if (q.collectionName.startsWith('$view_')) {
    const viewId = q.collectionName.slice(`$view_`.length);
    steps.push({
      type: 'PREPARE_VIEW',
      viewId,
    });
    steps.push({
      type: 'RESOLVE_FROM_VIEW',
      viewId,
      filter: simpleFilters,
    });
    hasBeenCollected = true;
    // TODO we should figure out how to break up the filters
    // by which ones can be resolved VAC-style and which ones
    // should have some post-processing
    hasFiltersBeenHandled = true;
    hasOrderBeenHandled = true;
    // return steps;
  } else {
    // Candidate selection
    if (idFilter) {
      if (typeof idFilter[2] === 'string' && idFilter[2].startsWith('$view_')) {
        const viewId = idFilter[2].split('.').at(0).slice(`$view_`.length);
        steps.push({
          type: 'PREPARE_VIEW',
          viewId,
        });
      }
      // Use ID_LOOK_UP if we have a direct ID filter
      steps.push({
        type: 'ID_LOOK_UP',
        collectionName: q.collectionName,
        ids: isValueVariable(idFilter[2])
          ? idFilter[2]
          : !Array.isArray(idFilter[2])
            ? [idFilter[2]]
            : idFilter[2],
      });

      // Also remove the ID filter from the filters
      simpleFilters.splice(idFilterIndex, 1);
    } else {
      steps.push({
        type: 'SCAN',
        collectionName: q.collectionName,
      });
    }
  }
  if (simpleFilters.length > 0) {
    const viewsInFilters = getViewsReferencedInFilters(simpleFilters);
    if (viewsInFilters.size > 0) {
      // viewReference could be a variable reference like $view_1.name
      for (const viewReference of viewsInFilters) {
        const viewId = viewReference.split('.').at(0).slice(`$view_`.length);
        steps.push({
          type: 'PREPARE_VIEW',
          viewId,
        });
      }
    }
  }
  if (!hasBeenCollected) {
    if (simpleFilters.length > 0) {
      steps.push({
        type: 'ITERATOR_FILTER',
        filter: simpleFilters,
      });
      hasFiltersBeenHandled = true;
    }

    for (const subqueryFilter of subqueryFilters) {
      steps.push({
        type: 'ITERATOR_SUBQUERY_FILTER',
        // TODO maybe add LIMIT 1
        subPlan: compileQueryToSteps(subqueryFilter.exists),
      });
    }

    if (q.limit && !q.order) {
      steps.push({
        type: 'ITERATOR_LIMIT',
        count: q.limit,
      });
      hasLimitBeenHandled = true;
    }

    steps.push({
      type: 'COLLECT',
    });
  }

  if (simpleFilters.length > 0 && !hasFiltersBeenHandled) {
    steps.push({
      type: 'FILTER',
      filter: simpleFilters,
    });
    hasFiltersBeenHandled = true;
  }

  // If orderBy is present, add a SORT step
  if (q.order && q.order.length > 0 && !hasOrderBeenHandled) {
    const orderStatements = [];
    // if order is based on a relation, make sure to include it first
    for (let i = 0; i < q.order.length; i++) {
      const [attr, direction, maybeSubquery] = q.order[i];
      if (maybeSubquery == null) {
        orderStatements.push(q.order[i]);
        continue;
      }
      const alias = `_order_${i}`;
      const subPlan = compileQueryToSteps(maybeSubquery.subquery);
      steps.push({
        type: 'SUBQUERY',
        alias,
        subPlan,
      });
      const updatedProperty = attr.split('.').toSpliced(0, 1, alias).join('.');
      orderStatements.push([updatedProperty, direction]);
    }
    steps.push({
      type: 'SORT',
      fields: orderStatements,
    });
  }

  // If limit is present, add a LIMIT step
  if (typeof q.limit === 'number' && !hasLimitBeenHandled) {
    steps.push({
      type: 'LIMIT',
      count: q.limit,
    });
  }

  //  Includes => add a SUBQUERY step for each include
  //    (In practice, you'd handle them differently or batch them.)
  if (q.include) {
    for (const [alias, def] of Object.entries(q.include)) {
      const subPlan = compileQueryToSteps(def.subquery);
      if (def.cardinality === 'one') {
        subPlan.push({
          type: 'PICK',
        });
      }
      steps.push({
        type: 'SUBQUERY',
        alias: alias,
        subPlan,
      });
    }
  }

  return steps;
}
