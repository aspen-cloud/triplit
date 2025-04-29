import { VariableAwareCache as VAC } from './variable-aware-cache.js';
import {
  bindVariablesInFilters,
  isValueVariable,
  resolveVariable,
} from './variables.js';
import { satisfiesNonRelationalFilter } from './filters.js';
import {
  DBEntity,
  EntityStore,
  KVStoreOrTransaction,
  PreparedQuery,
  PreparedOrder,
} from './types.js';
import { asyncIterFilter, asyncIterTake } from './utils/iterators.js';
import { compareValue, MIN } from './codec.js';
import { ValuePointer } from './utils/value-pointer.js';
import { satisfiesAfter } from './after.js';
import {
  CompiledPlan,
  compileQuery,
  Step,
} from './query-planner/query-compiler.js';
import { InvalidResultCardinalityError, TriplitError } from './errors.js';

export interface ViewEntity {
  data: DBEntity; // Immutable/frozen entity from storage
  subqueries: Record<string, null | ViewEntity[] | ViewEntity>; // Subquery results for this entity view
}

export function createViewEntity(ent: DBEntity): ViewEntity {
  return {
    data: ent,
    subqueries: {},
  };
}

export function flattenViewEntity(viewEnt: ViewEntity | null): any {
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

export function flattenViews(views: Record<string, ViewEntity[] | ViewEntity>) {
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
  constructor(
    private storage: KVStoreOrTransaction,
    private store: EntityStore
  ) {}

  /**
   * A top-level fetch method that compiles a query and executes it.
   */
  async fetch(query: PreparedQuery, vars: any = {}): Promise<ViewEntity[]> {
    const compiledPlan = compileQuery(structuredClone(query));
    const results = await this.executeSteps(compiledPlan.steps, {
      vars,
      viewPlans: compiledPlan.views,
    });
    if (Array.isArray(results)) {
      return results;
    }
    throw new InvalidResultCardinalityError('many', 'one');
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
    let candidateIterator:
      | Iterable<ViewEntity>
      | AsyncIterable<ViewEntity>
      | undefined;
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
            throw new Error(`View ${step.viewId} not found`);
          }
          if (!Array.isArray(view))
            throw new InvalidResultCardinalityError('many', 'one');
          const boundFilters = bindVariablesInFilters(
            step.filter,
            // When resolving from a view, there should be no other view variables
            // If we error here, possibly re-add slow entity flattening
            vars
          );
          results = [...view];
          for (const filter of boundFilters) {
            results = VAC.resolveQueryFromView(results, filter);
          }
          candidateIterator = results;
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
            if (!isValueVariable(ids))
              throw new TriplitError(
                `Invalid ID_LOOK_UP input, expected variable or string[]`
              );
            const varMatch = resolveVariable(ids, {
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
          const boundFilters = bindVariablesInFilters(step.filter, {
            ...vars,
            ...flattenViews(preparedViews),
          });
          const filterFuncs = boundFilters.map((filter) => {
            return (candidate: ViewEntity) =>
              satisfiesNonRelationalFilter(candidate.data, filter);
          });
          if (step.after) {
            filterFuncs.push(({ data: entityData }: ViewEntity) => {
              if (
                !satisfiesAfter(
                  entityData,
                  step.after!.after,
                  step.after!.order
                )
              ) {
                return false;
              }
              return true;
            });
          }

          candidateIterator = asyncIterFilter(
            candidateIterator!,
            (candidate) => {
              for (const filterFunc of filterFuncs) {
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
              if (Array.isArray(subResults)) {
                return subResults.length > 0;
              } else {
                return subResults !== null;
              }
            }
          );
          break;
        }
        case 'FILTER': {
          if (collectionName == undefined) {
            throw new Error('No collection name found when trying to FILTER');
          }
          const boundFilters = bindVariablesInFilters(step.filter, {
            ...vars,
            ...preparedViews,
          });
          results = results.filter((candidate) => {
            for (const filter of boundFilters) {
              let boundFilter = filter;
              const passesFilter = satisfiesNonRelationalFilter(
                candidate.data,
                boundFilter
              );
              if (!passesFilter) {
                return false;
              }
            }
            if (step.after) {
              if (
                !satisfiesAfter(
                  candidate.data,
                  step.after.after,
                  step.after.order
                )
              ) {
                return false;
              }
            }
            return true;
          });
          break;
        }

        case 'SORT': {
          sortViewEntities(results, step.fields);
          break;
        }

        case 'LIMIT': {
          results = results.slice(0, step.count);
          break;
        }

        case 'PICK': {
          // Return early if cardinality 'one'
          return results[0] ?? null;
        }

        default:
          throw new Error(
            `Unknown step type: ${
              // @ts-expect-error
              step.type
            }`
          );
      }
    }
    return results;
  }

  async *getCollectionCandidates(
    query: PreparedQuery
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

export function sortViewEntities(entities: ViewEntity[], order: PreparedOrder) {
  const orderWithViewEntityKeysInterleaved = order.map(
    ([key, direction, maybeSubquery]) => {
      const keyPath = key.split('.');
      if (maybeSubquery) {
        const subqueryLevel = getLevelOfNestedInclude(maybeSubquery.subquery);
        return [
          keyPath
            .slice(0, subqueryLevel + 1)
            .flatMap((key) => ['subqueries', key])
            .concat('data', keyPath.slice(-1)),
          direction,
          maybeSubquery,
        ];
      }
      return [['data', ...keyPath], direction];
    }
  ) as [string[], 'ASC' | 'DESC'][];
  entities.sort((a, b) => {
    for (const [attr, dir] of orderWithViewEntityKeysInterleaved) {
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
}

function getLevelOfNestedInclude(query: PreparedQuery) {
  let level = 0;
  if (!query.include) return level;
  for (const key in query.include) {
    const inclusion = query.include[key];
    level = Math.max(level, getLevelOfNestedInclude(inclusion.subquery) + 1);
  }
  return level;
}
