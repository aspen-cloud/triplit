import { VariableAwareCache as VAC } from './variable-aware-cache.js';
import { getVariableComponents, isValueVariable } from './variables.js';
import { isFilterGroup, satisfiesNonRelationalFilter } from './filters.js';
import {
  DBEntity,
  EntityStore,
  KVStoreOrTransaction,
  FilterGroup,
  type CollectionQuery,
  type FilterStatement,
} from './types.js';
import {
  asyncIterFilter,
  asyncIterMap,
  asyncIterTake,
} from './utils/iterators.js';
import { compareValue, MIN } from './codec.js';
import { DBSchema } from './db.js';
import { ValuePointer } from './utils/value-pointer.js';
import { satisfiesAfter } from './after.js';
import {
  CompiledPlan,
  compileQuery,
  Step,
} from './query-planner/query-compiler.js';
import { debugFreeze } from './macros/debug.js';

export interface ExecutionContext {
  query: CollectionQuery;
  engine: EntityStoreQueryEngine;
  candidates?: AsyncIterable<DBEntity> | DBEntity[];
  results: DBEntity[]; // We'll collect the final results here
}

export interface ViewEntity {
  data: DBEntity; // Immutable/frozen entity from storage
  subqueries: Record<string, ViewEntity[]>; // Subquery results for this entity view
}

export function createViewEntity(ent: DBEntity): ViewEntity {
  return {
    data: ent,
    subqueries: {},
  };
}

export function flattenViewEntity(viewEnt: ViewEntity): any {
  if (!viewEnt) return viewEnt;
  if (!('data' in viewEnt) || !('subqueries' in viewEnt)) {
    throw new Error(
      'View entity is not properly formatted, expected "data" and "subqueries" keys but instead got: ' +
        Object.keys(viewEnt)
    );
  }
  if (Object.keys(viewEnt.subqueries).length === 0) {
    return viewEnt.data;
  }
  const flattenedSubqueries: Record<string, any> = {};
  for (const [key, subqueryResults] of Object.entries(viewEnt.subqueries)) {
    flattenedSubqueries[key] = Array.isArray(subqueryResults)
      ? subqueryResults.map(flattenViewEntity)
      : flattenViewEntity(subqueryResults);
  }
  return {
    ...viewEnt.data,
    ...flattenedSubqueries,
  };
}

function flattenViews(views: Record<string, ViewEntity[] | ViewEntity>) {
  const flattenedViews = Object.fromEntries(
    Object.entries(views).map(([key, viewResults]) => [
      key,
      Array.isArray(viewResults)
        ? viewResults.map(flattenViewEntity)
        : flattenViewEntity(viewResults),
    ])
  );
  return flattenedViews;
}

export class EntityStoreQueryEngine {
  private storage: KVStoreOrTransaction;
  private store: EntityStore;
  executionStack: {
    collectionName: string;
    data: any;
  }[] = [];
  schema: DBSchema | undefined;

  constructor(
    storage: KVStoreOrTransaction,
    store: EntityStore,
    schema: DBSchema | undefined
  ) {
    this.storage = storage;
    this.store = store;
    this.schema = schema;
  }

  /**
   * This is the plan-based loadQuery. It selects an appropriate plan based on
   * query characteristics and executes it.
   */
  private async loadQuery(
    query: CollectionQuery
  ): Promise<ViewEntity[] | ViewEntity> {
    return this.executeRelationalQuery(structuredClone(query));
  }

  /**
   * Handles relational queries by using the query compiler to extract views
   * and generate an execution plan
   */
  async executeRelationalQuery(
    query: CollectionQuery,
    vars: any = {}
  ): Promise<ViewEntity[] | ViewEntity> {
    const compiledPlan = compileQuery(query);
    return this.executeCompiledPlan(compiledPlan, vars);
  }

  /**
   * Executes a compiled plan which includes both views and main query steps
   */
  private async executeCompiledPlan(
    compiledPlan: CompiledPlan,
    vars: any = {}
  ): Promise<ViewEntity[] | ViewEntity> {
    return this.executeSteps(compiledPlan.steps, {
      vars,
      viewPlans: compiledPlan.views,
    });
  }

  private async executeSteps(
    steps: Step[],
    {
      vars,
      viewPlans,
      preparedViews = {},
    }: {
      vars: any;
      viewPlans: Record<string, { steps: Step[] }>;
      preparedViews?: Record<string, ViewEntity[] | ViewEntity>;
    }
  ): Promise<ViewEntity[] | ViewEntity> {
    // Ensure an entityStack is always present
    vars.entityStack = vars.entityStack || [];
    let results: ViewEntity[] = [];
    let collectionName: string | undefined;
    let candidateIterator: AsyncIterable<ViewEntity> | undefined;
    for (const step of steps) {
      switch (step.type) {
        case 'PREPARE_VIEW': {
          const alias = `view_${step.viewId}`;
          // If we've already prepared the view, skip
          if (alias in preparedViews) {
            break;
          }
          const { steps } = viewPlans[step.viewId];
          const viewResults = await this.executeSteps(steps, {
            vars,
            viewPlans,
            preparedViews,
          });
          preparedViews[alias] = viewResults;
          break;
        }
        case 'RESOLVE_FROM_VIEW': {
          const viewKey = `view_${step.viewId}`;
          const view = preparedViews[viewKey];
          if (!view) {
            throw new Error(`View ${step.viewId} not found in vars`);
          }
          const boundFilters = this.bindVariablesInFilters(step.filter, {
            ...vars,
            // TODO solve this in variable lookup
            //  This sucks to have to do but it works for now
            ...flattenViews(preparedViews),
          });
          results = [...view];
          for (const filter of boundFilters) {
            results = VAC.resolveQueryFromView(results, filter);
          }
          break;
        }
        case 'SUBQUERY': {
          const subPlan = step.subPlan;

          for (const result of results) {
            if (step.alias in result.subqueries) {
              // throw new Error(
              //   `Attempting to store subquery result in a key that already exists: ${step.alias}`
              // );
            }
            const subResults = await this.executeSteps(subPlan, {
              vars: {
                ...vars,
                entityStack: (vars.entityStack ?? []).concat(
                  flattenViewEntity(result)
                ),
              },
              viewPlans,
              preparedViews,
            });
            result.subqueries[step.alias] = subResults;
          }
          break;
        }
        case 'SCAN': {
          collectionName = step.collectionName;
          candidateIterator = this.getCollectionCandidates({
            collectionName,
          });
          break;
        }
        case 'ID_LOOK_UP': {
          let ids = step.ids;
          // Check if ids is a variable
          if (typeof ids === 'string') {
            const varMatch = this.resolveVariable(ids, {
              ...vars,
              // TODO solve this in variable lookup
              //  This sucks to have to do but it works for now
              ...flattenViews(preparedViews),
            });

            ids = resolvedVarToIdArray(varMatch);
          }
          collectionName = step.collectionName;
          candidateIterator = this.getCollectionCandidatesById(
            collectionName,
            new Set(ids)
          );
          break;
        }
        case 'COLLECT': {
          if (!candidateIterator) {
            throw new Error(
              'No candidate iterator found when trying to COLLECT'
            );
          }
          // TODO remove clone when we have better guarantees that the
          // individual entities won't be mutated later in the pipeline
          // e.g. apply schema deserialization for Dates and Sets
          results = await Array.fromAsync(candidateIterator);
          break;
        }
        case 'ITERATOR_LIMIT': {
          if (!candidateIterator) {
            throw new Error(
              'No candidate iterator found when trying to ITERATOR_LIMIT'
            );
          }
          candidateIterator = asyncIterTake(candidateIterator, step.count);
          break;
        }
        case 'ITERATOR_FILTER': {
          const boundFilters = this.bindVariablesInFilters(step.filter, {
            ...vars,
            ...flattenViews(preparedViews),
          });
          const fitterFuncs = boundFilters.map((filter) => {
            if (typeof filter === 'object' && 'after' in filter) {
              return ({ data: entityData }: ViewEntity) => {
                if (!satisfiesAfter(entityData, filter.after, filter.order)) {
                  return false;
                }
                return true;
              };
            }
            return (candidate: ViewEntity) =>
              satisfiesNonRelationalFilter(
                collectionName!,
                candidate.data,
                filter,
                this.schema
              );
          });

          candidateIterator = asyncIterFilter(
            candidateIterator!,
            (candidate) => {
              for (const filterFunc of fitterFuncs) {
                if (!filterFunc(candidate)) {
                  return false;
                }
              }
              return true;
            }
          );
          break;
        }
        case 'ITERATOR_SUBQUERY_FILTER': {
          const subPlan = step.subPlan;

          candidateIterator = asyncIterFilter(
            candidateIterator!,
            async (candidate) => {
              const subResults = await this.executeSteps(subPlan, {
                vars: {
                  ...vars,
                  entityStack: (vars.entityStack ?? []).concat(
                    flattenViewEntity(candidate)
                  ),
                },
                viewPlans,
                preparedViews,
              });
              if (subResults.length === 0) {
                return false;
              }
              return true;
            }
          );
          break;
        }
        case 'FILTER': {
          if (collectionName == undefined) {
            throw new Error('No collection name found when trying to FILTER');
          }
          const boundFilters = this.bindVariablesInFilters(step.filter, {
            ...vars,
            ...preparedViews,
          });
          results = results.filter((candidate) => {
            for (const filter of boundFilters) {
              if ('after' in filter) {
                if (!satisfiesAfter(candidate, filter.after, filter.order)) {
                  return false;
                }
                continue;
              }
              let boundFilter = filter;
              const passesFilter = satisfiesNonRelationalFilter(
                collectionName!,
                candidate,
                boundFilter,
                this.schema
              );
              if (!passesFilter) {
                return false;
              }
            }
            return true;
          });
          break;
        }

        case 'SORT': {
          results.sort((a, b) => {
            const flattenedA = flattenViewEntity(a);
            const flattenedB = flattenViewEntity(b);
            for (const [attr, dir] of step.fields) {
              const direction = compareValue(
                ValuePointer.Get(flattenedA, attr) ?? MIN,
                ValuePointer.Get(flattenedB, attr) ?? MIN
              );
              if (direction !== 0) {
                return dir === 'ASC' ? direction : -direction;
              }
            }
            return 0;
          });
          break;
        }

        case 'LIMIT': {
          results = results.slice(0, step.count);
          break;
        }

        case 'PICK': {
          results = results[0] ?? null;
          break;
        }

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
    }
    return results;
  }

  private resolveVariable(variable: string, vars: any): any {
    if (variable in vars) {
      return vars[variable];
    }
    const [relativeDepth, ...path] = getVariableComponents(variable);
    if (typeof relativeDepth === 'number') {
      if (!vars.entityStack || vars.entityStack.length < relativeDepth) {
        throw new Error(
          `Variable reference is out of bounds. Tried to find ${variable} in stack of size ${vars.entityStack?.length}`
        );
      }
      // Use entityStack: $1 gives last, $2 gives parent's parent, etc.
      return ValuePointer.Get(
        vars.entityStack[vars.entityStack.length - relativeDepth],
        path
      );
    }
    const resolvedVal = ValuePointer.Get(vars, path);
    // TODO should we throw an error here if undefined?
    return resolvedVal;
  }

  private bindVariablesInFilters(
    filters: (FilterStatement | FilterGroup)[],
    vars: any
  ): (FilterStatement | FilterGroup)[] {
    return filters.map((filter) => {
      if (isFilterGroup(filter)) {
        return {
          ...filter,
          filters: this.bindVariablesInFilters(filter.filters, vars),
        };
      }
      if (isValueVariable(filter[2])) {
        const variable = filter[2] as string;
        return [filter[0], filter[1], this.resolveVariable(variable, vars)];
      }
      return filter;
    });
  }

  /**
   * A top-level fetch method, using the (still) private loadQuery internally.
   */
  async fetch(query: CollectionQuery) {
    return this.loadQuery(query);
  }

  async *getCollectionCandidates(
    query: CollectionQuery
  ): AsyncIterable<ViewEntity> {
    for await (const ent of this.store.getEntitiesInCollection(
      this.storage,
      query.collectionName
    )) {
      yield createViewEntity(ent);
    }
    return;
  }

  async *getCollectionCandidatesById(
    collectionName: string,
    ids: string[] | Set<string>
  ): AsyncIterable<ViewEntity> {
    let candidates: DBEntity[] = [];

    for (const id of ids) {
      const entity = await this.store.getEntity(
        this.storage,
        collectionName,
        id
      );
      if (entity) {
        yield createViewEntity(entity);
      }
    }
    return candidates;
  }
}

type ResolvedIdLookupVar =
  | undefined
  | null
  | string
  | Record<string, boolean>
  | ResolvedIdLookupVar[];

function resolvedVarToIdArray(varMatch: ResolvedIdLookupVar) {
  let ids: string[] = [];
  if (typeof varMatch === 'string') {
    ids = [varMatch];
  } else if (Array.isArray(varMatch)) {
    ids = varMatch.flatMap(resolvedVarToIdArray);
  } else if (typeof varMatch === 'object' && varMatch !== null) {
    for (const [key, value] of Object.entries(varMatch)) {
      if (value === true) {
        ids.push(key);
      }
    }
  }
  return ids;
}
