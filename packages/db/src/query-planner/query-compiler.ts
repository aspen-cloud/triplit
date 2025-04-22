import {
  FilterStatement,
  PreparedOrder,
  PreparedQuery,
  PreparedSubQueryFilter,
  PreparedWhere,
  QueryAfter,
} from '../types.js';
import {
  filterStatementIteratorFlat,
  isFilterGroup,
  isFilterStatement,
  isStaticFilter,
  isSubQueryFilter,
  StaticFilter,
} from '../filters.js';
import { getVariableComponents, isValueVariable } from '../variables.js';
import { getIdFilter } from './heuristics.js';
import { VariableAwareCache as VAC } from '../variable-aware-cache.js';
import { Models } from '../schema/index.js';
import { TriplitError } from '../errors.js';
import { all } from '../utils/guards.js';
import { hashPreparedQuery } from '../query/hash-query.js';

export interface RelationalPlan {
  views: Record<string, PreparedQuery>;
  rootQuery: PreparedQuery;
}

export type AfterFilter = {
  after: QueryAfter;
  order: PreparedOrder;
};

export type Step =
  | {
      type: 'SCAN';
      collectionName: string;
    }
  | {
      type: 'ID_LOOK_UP';
      collectionName: string;
      ids: string | string[]; // e.g. "$view_1.id" or ["id1", "id2"]
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
      filter: StaticFilter[];
      after?: AfterFilter;
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
      filter: StaticFilter[];
      after?: AfterFilter;
    }
  | {
      type: 'SORT';
      fields: PreparedOrder;
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
      // A subquery for "include"
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
  query: PreparedQuery,
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

function subqueryToView(subquery: PreparedQuery, generateViewId: () => string) {
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
  where: PreparedWhere,
  generateViewId: () => string
): {
  where: PreparedWhere;
  views: Record<string, PreparedQuery>;
} {
  const views: Record<string, PreparedQuery> = {};
  const updatedWhere: PreparedWhere = [];
  for (const filter of where) {
    // if the filter is a subquery filter
    // we may be able to do "inversion"
    if (isSubQueryFilter(filter)) {
      const subquery = filter.exists;
      const hasGrandparentReferences =
        subquery.where && hasHigherLevelReferences(subquery.where);
      const subqueryVariableFilters = (subquery.where ?? []).filter(
        (f): f is FilterStatement => {
          return (
            isFilterStatement(f) &&
            isValueVariable(f[2]) &&
            getVariableComponents(f[2])[0] === 1
          );
        }
      );
      // inversion strategy
      if (!hasGrandparentReferences && subqueryVariableFilters.length < 2) {
        const viewId = generateViewId();
        const extractedView = extractViews(subquery, generateViewId);
        views[viewId] = extractedView.rootQuery;
        Object.assign(views, extractedView.views);

        // remove the variable filters from the view
        extractedView.rootQuery.where = subquery.where?.filter(
          (f) => !subqueryVariableFilters.includes(f as FilterStatement)
        );

        // and in the main query, add the filter on the view
        const viewFilters = subqueryVariableFilters.map<FilterStatement>(
          (f) => {
            return [
              getVariableComponents(f[2])[1],
              'in',
              `$view_${viewId}.${f[0]}`,
            ];
          }
        );
        updatedWhere.push(...viewFilters);

        // VAC strategy
      } else if (VAC.canCacheQuery(subquery)) {
        const viewId = generateViewId();
        const vacView = VAC.queryToViews(subquery);

        const extractedView = extractViews(vacView.views[0], generateViewId);
        const { where: remainingFilters, views: remainingViews } =
          whereFiltersToViews(vacView.unusedFilters, generateViewId);
        extractedView.rootQuery.where?.concat(remainingFilters);

        views[viewId] = extractedView.rootQuery;
        Object.assign(views, extractedView.views);
        Object.assign(views, remainingViews);
        updatedWhere.push({
          exists: {
            ...subquery,
            collectionName: `$view_${viewId}`,
            where: [...vacView.variableFilters, ...remainingFilters],
          },
        });
        // implicitly going to lead to the nester subquery strategy
      } else {
        updatedWhere.push(filter);
      }
    } else if (isFilterGroup(filter)) {
      const { where: newWhere, views: newViews } = whereFiltersToViews(
        filter.filters,
        generateViewId
      );
      updatedWhere.push({ ...filter, filters: newWhere });
      Object.assign(views, newViews);
      // let the rest pass through and be handled with a more naive approach
    } else {
      updatedWhere.push(filter);
    }
  }
  return { where: updatedWhere, views };
}
function hasHigherLevelReferences(where: PreparedWhere): boolean {
  for (const filter of filterStatementIteratorFlat(where)) {
    if (isFilterStatement(filter) && isValueVariable(filter[2])) {
      const [level] = getVariableComponents(filter[2]);
      if (typeof level === 'number' && level > 1) return true;
    } else if (isSubQueryFilter(filter)) {
      if (hasHigherLevelReferences(filter.exists.where || [])) return true;
    }
  }
  return false;
}

export function compileQuery(query: PreparedQuery): CompiledPlan {
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
  filters: StaticFilter[],
  viewNames: Set<string> = new Set()
): Set<string> {
  for (const filter of filterStatementIteratorFlat(filters)) {
    if (isFilterStatement(filter) && statementHasViewReference(filter)) {
      viewNames.add(filter[2]);
    }
  }
  return viewNames;
}

export function statementHasViewReference(
  filter: FilterStatement
): filter is FilterStatement {
  return isValueVariable(filter[2]) && filter[2].startsWith('$view_');
}

/**
 * Compiles a given `PreparedQuery` into a sequence of execution steps.
 *
 * @param {PreparedQuery} q - The query to compile that's already been processed by the view
 * extractor / relational planner.
 * @returns {Step[]} An array of steps representing the compiled query that will be interpreted by
 * the query engine
 *
 */
function compileQueryToSteps(q: PreparedQuery): Step[] {
  const steps: Step[] = [];
  let hasLimitBeenHandled = false;
  let hasBeenCollected = false;
  let hasFiltersBeenHandled = false;
  let hasOrderBeenHandled = false;

  const subqueryFilters: PreparedSubQueryFilter[] = [];
  const staticFilters: StaticFilter[] = [];
  if (q.where) {
    for (const filter of q.where) {
      if (isStaticFilter(filter)) {
        staticFilters.push(filter);
      } else if (isSubQueryFilter(filter)) {
        subqueryFilters.push(filter);
      } else {
        throw new TriplitError(
          `Could not compile query: Unsupported filter type in where clause: ${JSON.stringify(filter)}`
        );
      }
    }
  }

  const afterFilter: AfterFilter | undefined = q.after
    ? {
        after: q.after,
        // It isn't typed this way, but prepareQuery dictates that `after` must have an `order` property
        order: q.order!,
      }
    : undefined;

  const [idFilter, idFilterIndex] = getIdFilter(q);

  if (q.collectionName.startsWith('$view_')) {
    const viewId = q.collectionName.slice(`$view_`.length);
    // Resolving from a view MUST use filter statements that feed into the VAC
    if (!all(staticFilters, isFilterStatement)) {
      throw new TriplitError(
        `Filters on view ${viewId} must be simple filter statements.`
      );
    }
    steps.push({
      type: 'PREPARE_VIEW',
      viewId,
    });
    steps.push({
      type: 'RESOLVE_FROM_VIEW',
      viewId,
      filter: staticFilters,
    });
    if (subqueryFilters.length > 0) {
      for (const subqueryFilter of subqueryFilters) {
        steps.push({
          type: 'ITERATOR_SUBQUERY_FILTER',
          // TODO maybe add LIMIT 1
          subPlan: compileQueryToSteps(subqueryFilter.exists),
        });
      }
      steps.push({
        type: 'COLLECT',
      });
    }
    hasBeenCollected = true;
    // TODO we should figure out how to break up the filters
    // by which ones can be resolved VAC-style and which ones
    // should have some post-processing
    // This likely will need to be coordinated in the view extractor so it's clear
    // which filters are used to do initial view resolution (ala VAC) and which ones
    // remain
    hasFiltersBeenHandled = true;
    hasOrderBeenHandled = true;
  } else {
    // Candidate selection
    if (idFilter) {
      if (typeof idFilter[2] === 'string' && idFilter[2].startsWith('$view_')) {
        const viewId = idFilter[2].split('.')[0].slice(`$view_`.length);
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
          : typeof idFilter[2] === 'string'
            ? new Set().add(idFilter[2])
            : idFilter[2],
      });

      // Also remove the ID filter from the filters
      staticFilters.splice(idFilterIndex, 1);
    } else {
      steps.push({
        type: 'SCAN',
        collectionName: q.collectionName,
      });
    }
  }
  if (staticFilters.length > 0) {
    const viewsInFilters = getViewsReferencedInFilters(staticFilters);
    if (viewsInFilters.size > 0) {
      // viewReference could be a variable reference like $view_1.name
      for (const viewReference of viewsInFilters) {
        const viewId = viewReference.split('.')[0].slice(`$view_`.length);
        steps.push({
          type: 'PREPARE_VIEW',
          viewId,
        });
      }
    }
  }
  if (!hasBeenCollected) {
    if (staticFilters.length > 0 || afterFilter) {
      steps.push({
        type: 'ITERATOR_FILTER',
        filter: staticFilters,
        after: afterFilter,
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

  if ((staticFilters.length > 0 || afterFilter) && !hasFiltersBeenHandled) {
    steps.push({
      type: 'FILTER',
      filter: staticFilters,
      after: afterFilter,
    });
    hasFiltersBeenHandled = true;
  }

  if (q.order && q.order.length > 0 && !hasOrderBeenHandled) {
    const orderStatements: PreparedOrder = [];
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
      orderStatements.push([updatedProperty, direction, maybeSubquery]);
    }
    steps.push({
      type: 'SORT',
      fields: orderStatements,
    });
  }

  if (typeof q.limit === 'number' && !hasLimitBeenHandled) {
    steps.push({
      type: 'LIMIT',
      count: q.limit,
    });
  }

  // Create a sub plan for each inclusion which usually
  // ends up resolving from a previously extracted view
  // but may also become a nested loop query
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

export function extractInvertedViews(query: PreparedQuery): {
  rewrittenQuery: PreparedQuery;
  views: HashedViewMap;
} {
  const plan: {
    views: HashedViewMap;
    rewrittenQuery: PreparedQuery;
  } = {
    views: new Map(),
    rewrittenQuery: query,
  };
  if (query.where) {
    const { where, views } = extractedInvertedViewsFromFilters(query.where);
    query.where = where;
    assignViewMap(plan.views, views);
  }
  if (query.include) {
    for (const [alias, inclusion] of Object.entries(query.include)) {
      const { views, rewrittenQuery } = extractInvertedViews(
        inclusion.subquery
      );
      assignViewMap(plan.views, views);
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
      const { views, rewrittenQuery } = extractInvertedViews(
        maybeSubquery.subquery
      );
      assignViewMap(plan.views, views);
      query.order[i][2] = { ...maybeSubquery, subquery: rewrittenQuery };
    }
  }
  return plan;
}

export type HashedViewMap = Map<number, PreparedQuery>;

function assignViewMap(map1: HashedViewMap, map2: HashedViewMap): void {
  for (const [key, value] of map2.entries()) {
    if (map1.has(key)) {
      continue;
    } else {
      map1.set(key, value);
    }
  }
}

export function extractedInvertedViewsFromFilters(where: PreparedWhere): {
  where: PreparedWhere;
  views: Map<number, PreparedQuery>;
} {
  const views: HashedViewMap = new Map();
  const updatedWhere: PreparedWhere = [];
  for (const filter of where) {
    // if the filter is a subquery filter
    // we may be able to do "inversion"
    if (isSubQueryFilter(filter)) {
      const subquery = filter.exists;
      const hasGrandparentReferences =
        subquery.where && hasHigherLevelReferences(subquery.where);
      const subqueryVariableFilters = (subquery.where ?? []).filter(
        (f): f is FilterStatement => {
          return (
            isFilterStatement(f) &&
            isValueVariable(f[2]) &&
            getVariableComponents(f[2])[0] === 1
          );
        }
      );
      // inversion strategy
      if (!hasGrandparentReferences && subqueryVariableFilters.length < 2) {
        const extractedView = extractInvertedViews(subquery);
        // remove the variable filters from the view
        extractedView.rewrittenQuery.where = subquery.where?.filter(
          (f) => !subqueryVariableFilters.includes(f as FilterStatement)
        );
        const viewId = hashPreparedQuery(extractedView.rewrittenQuery);
        views.set(viewId, extractedView.rewrittenQuery);
        assignViewMap(views, extractedView.views);

        // and in the main query, add the filter on the view
        const viewFilters = subqueryVariableFilters.map<FilterStatement>(
          (f) => {
            return [
              getVariableComponents(f[2])[1],
              'in',
              `$view_${viewId}.${f[0]}`,
            ];
          }
        );
        updatedWhere.push(...viewFilters);
      } else {
        updatedWhere.push(filter);
      }
    } else if (isFilterGroup(filter)) {
      const { where: newWhere, views: newViews } =
        extractedInvertedViewsFromFilters(filter.filters);
      updatedWhere.push({ ...filter, filters: newWhere });
      assignViewMap(views, newViews);
      // let the rest pass through and be handled with a more naive approach
    } else {
      updatedWhere.push(filter);
    }
  }
  return { where: updatedWhere, views };
}
