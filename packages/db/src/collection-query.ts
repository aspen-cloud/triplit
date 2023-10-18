import { ValuePointer } from '@sinclair/typebox/value';
import Builder from './utils/builder';
import {
  Query,
  FilterStatement,
  FilterGroup,
  entityToResultReducer,
  constructEntity,
  QUERY_INPUT_TRANSFORMERS,
  SubQueryFilter,
  triplesToEntities,
} from './query';
import {
  convertEntityToJS,
  getSchemaFromPath,
  JSONTypeFromModel,
  Model,
  Models,
  timestampedObjectToPlainObject,
} from './schema';
import { Timestamp, timestampCompare } from './timestamp';
import {
  Attribute,
  EntityId,
  TripleRow,
  TripleStore,
  TripleStoreApi,
  Value,
} from './triple-store';
import { Pipeline } from './utils/pipeline';
import { EntityIdMissingError, InvalidFilterError } from './errors';
import {
  stripCollectionFromId,
  appendCollectionToId,
  splitIdParts,
  replaceVariablesInQuery,
  someFilterStatements,
} from './db-helpers';
import { Operator } from './data-types/base';
import { VariableAwareCache } from './variable-aware-cache';
import { isTimestampedEntityDeleted } from './entity';
import { CollectionNameFromModels, ModelFromModels } from './db';

export default function CollectionQueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(collectionName: CN, params?: Query<ModelFromModels<M, CN>>) {
  // TODO fixup ts so that select/where are actually optional
  const query: CollectionQuery<M, CN> = {
    collectionName,
    ...params,
    where: params?.where ?? [],
    select: params?.select ?? [],
    vars: params?.vars ?? {},
  };
  return Builder(query, {
    protectedFields: ['collectionName'],
    inputTransformers: QUERY_INPUT_TRANSFORMERS<
      Query<ModelFromModels<M, CN>>,
      ModelFromModels<M, CN>
    >(),
  });
}

export type CollectionQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Query<ModelFromModels<M, CN>> & {
  collectionName: CN;
};

export type FetchResult<C extends CollectionQuery<any, any>> =
  C extends CollectionQuery<infer M, infer CN>
    ? M extends Models<any, any>
      ? Map<string, JSONTypeFromModel<ModelFromModels<M, CN>>>
      : M extends undefined
      ? Map<string, any>
      : never
    : never;

export interface FetchOptions {
  includeTriples?: boolean;
  schema?: Models<any, any>;
}

/**
 * Fetch
 * @summary This function is used to fetch entities from the database. It can be used to fetch a single entity or a collection of entities.
 * @description This function tries to consult TripleStore indexes to efficiently fetch entities. If the query is not supported by the indexes, it will fall back to scanning the entire database.
 * This can happen for queries that use multiple order clauses, LIKE filters, etc.
 * @param tx
 * @param query
 * @param options
 */
export async function fetch<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tx: TripleStoreApi,
  query: Q,
  options?: FetchOptions & {
    includeTriples: false;
    cache?: VariableAwareCache<any>;
  }
): Promise<FetchResult<Q>>;
export async function fetch<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tx: TripleStoreApi,
  query: Q,
  options?: FetchOptions & {
    includeTriples: true;
    cache?: VariableAwareCache<any>;
  }
): Promise<{ results: FetchResult<Q>; triples: Map<string, TripleRow[]> }>;
export async function fetch<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tx: TripleStoreApi,
  query: Q,
  {
    includeTriples = false,
    schema,
    cache,
  }: FetchOptions & { cache?: VariableAwareCache<any> } = {}
) {
  const collectionSchema = schema && schema[query.collectionName]?.attributes;
  if (cache && VariableAwareCache.canCacheQuery(query, collectionSchema)) {
    const cacheResult = await cache!.resolveFromCache(query);
    if (!includeTriples) return cacheResult.results;
    return cacheResult;
  }
  const queryWithInsertedVars = replaceVariablesInQuery(query);
  const where = queryWithInsertedVars.where;
  if (query.entityId) {
    const storeId = appendCollectionToId(query.collectionName, query.entityId);
    // With schema's we're using tombstones, and need to filter down to the latest triples to ensure that the undefined value we set on a schema attribute to be respected
    // this is probably a bandaid
    const entityTriples = filterToLatestEntityAttribute(
      await tx.findByEntity(storeId)
    );
    let entity: any | null = constructEntity(entityTriples, storeId);
    // handle deleted entites
    if (isTimestampedEntityDeleted(entity)) {
      entity = null;
    }
    const triples = new Map([[query.entityId, entityTriples]]);
    if (!entity || !doesEntityObjMatchWhere(entity, where, collectionSchema)) {
      const results = new Map() as FetchResult<Q>;
      return includeTriples ? { results, triples } : results;
    }
    let updatedEntity = entity;
    if (!includeTriples)
      updatedEntity = convertEntityToJS(updatedEntity, collectionSchema);
    const results = new Map([
      [query.entityId, updatedEntity],
    ]) as FetchResult<Q>;
    return includeTriples ? { results, triples } : results;
  }

  const order = query.order;
  const limit = query.limit;
  const select = query.select;
  const resultOrder = await (order
    ? tx.findValuesInRange(
        [query.collectionName, ...(order[0][0] as string).split('.')],
        {
          direction: order[0][1],
          ...(query.after && (!order || order.length <= 1)
            ? order[0][1] === 'DESC'
              ? { lessThan: query.after }
              : { greaterThan: query.after }
            : {}),
        }
      )
    : tx.findByAVE([['_collection'], query.collectionName]));

  // look into refactoring with constructEntities()
  const allEntities = await (includeTriples
    ? getCollectionEntitiesAndTriples(tx, query.collectionName)
    : getCollectionEntities(tx, query.collectionName));

  let entityCount = 0;
  let previousOrderVal: Value;
  const resultTriples: Map<string, TripleRow[]> = new Map();
  let entities = await new Pipeline(resultOrder)
    .map(async ({ id }) => {
      const entityEntry = allEntities.get(id);
      const externalId = stripCollectionFromId(id);
      if (entityEntry?.triples) {
        return [externalId, entityEntry] as const;
      }
      return [
        externalId,
        { triples: [] as TripleRow[], entity: entityEntry },
      ] as const;
    })
    // filter out deleted
    .filter(async ([_id, { entity }]) => !isTimestampedEntityDeleted(entity))
    .filter(async ([id, { entity }]) => {
      const subQueries = where.filter(
        (filter) => 'exists' in filter
      ) as SubQueryFilter<M>[];
      const plainFilters = where.filter((filter) => !('exists' in filter));
      const basicMatch = doesEntityObjMatchWhere(
        entity,
        plainFilters,
        collectionSchema
      );
      if (!basicMatch) return false;
      const subQueryTriples: TripleRow[] = [];
      for (const { exists: subQuery } of subQueries) {
        const existsSubQuery = {
          ...subQuery,
          vars: {
            ...subQuery.vars,
            ...timestampedObjectToPlainObject(entity),
          },
          limit: 1,
        };
        const subQueryFetch = await fetch<M, typeof existsSubQuery>(
          tx,
          existsSubQuery,
          {
            includeTriples: true,
            schema,
            cache,
          }
        );
        const { results: subQueryResult, triples } = subQueryFetch;
        const exists = subQueryResult.size > 0;
        if (!exists) return false;
        subQueryTriples.push(...[...triples.values()].flat());
      }
      if (!resultTriples.has(id)) {
        resultTriples.set(id, subQueryTriples);
      } else {
        resultTriples.set(id, resultTriples.get(id)!.concat(subQueryTriples));
      }
      return true;
    })
    .map(async ([id, { triples, entity }]) => {
      if (!resultTriples.has(id)) {
        resultTriples.set(id, triples);
      } else {
        resultTriples.set(id, resultTriples.get(id)!.concat(triples));
      }
      return [id, entity] as [string, any];
    })
    .take(limit && (!order || order.length <= 1) ? limit : Infinity)
    .takeWhile(async ([, entity]) => {
      if (!order || order.length <= 1) return true;
      entityCount++;
      let orderVal = entity[order![0][0]][0];
      // keep going if we have the same order value
      if (orderVal === previousOrderVal) return true;
      previousOrderVal = orderVal;
      if (entityCount > limit!) return false;
      return true;
    })
    .toArray();

  if (order && order.length > 1) {
    entities.sort(([_aId, a], [_bId, b]) => {
      for (const [prop, dir] of order) {
        const direction =
          a[prop][0] < b[prop][0] ? -1 : a[prop][0] == b[prop][0] ? 0 : 1;
        if (direction !== 0) return dir === 'ASC' ? direction : direction * -1;
      }
      return 0;
    });
    let startIndex = 0;
    if (query.after) {
      let afterIndex = entities.findIndex(
        ([id]) => id === stripCollectionFromId(query.after![1])
      );
      if (afterIndex !== -1) startIndex = afterIndex + 1;
    }
    if (limit) entities = entities.slice(startIndex, startIndex + limit);
  }

  if (select && select.length > 0) {
    entities = entities.map(([entId, entity]) => {
      const selectedEntity = select.reduce<any>((acc, selectPath) => {
        const pathParts = (selectPath as string).split('.');
        const leafMostPart = pathParts.pop()!;
        let selectScope = acc;
        let entityScope = entity;
        for (const pathPart of pathParts) {
          selectScope[pathPart] = selectScope[pathPart] ?? {};
          selectScope = selectScope[pathPart];
          entityScope = entity[pathPart];
        }
        selectScope[leafMostPart] = entityScope[leafMostPart];

        return acc;
      }, {});
      return [entId, selectedEntity];
    });
  }

  if (includeTriples) {
    return {
      results: new Map(entities), // TODO: also need to deserialize data?
      triples: resultTriples,
    };
  }

  return new Map(
    entities.map(([id, entity]) => [
      id,
      convertEntityToJS(entity, collectionSchema),
    ])
  ) as FetchResult<Q>;
}

export function doesEntityObjMatchWhere<Q extends CollectionQuery<any, any>>(
  entityObj: any,
  where: Q['where'],
  schema?: CollectionQuerySchema<Q>
) {
  const basicStatements = where.filter(
    (statement): statement is FilterStatement<Model<any>> =>
      statement instanceof Array
  );

  const orStatements = where.filter(
    (statement): statement is FilterGroup<Model<any>> =>
      'mod' in statement && statement.mod === 'or'
  );

  const andStatements = where.filter(
    (statement): statement is FilterGroup<Model<any>> =>
      'mod' in statement && statement.mod === 'and'
  );
  const matchesBasicFilters = entitySatisfiesAllFilters(
    entityObj,
    basicStatements,
    schema
  );

  if (!matchesBasicFilters) return false;

  const matchesOrFilters = orStatements.every(({ filters }) =>
    filters.some(
      (filter) => doesEntityObjMatchWhere(entityObj, [filter]),
      schema
    )
  );
  if (!matchesOrFilters) return false;

  const matchesAndFilters = andStatements.every(({ filters }) =>
    doesEntityObjMatchWhere(entityObj, filters, schema)
  );
  if (!matchesAndFilters) return false;

  return true;
}
/**
 *
 * @param entity An entity object
 * @param filters Simple statements (not AND or OR)
 * @returns boolean
 */
function entitySatisfiesAllFilters(
  entity: any,
  filters: FilterStatement<Model<any>>[],
  schema?: Model<any>
): boolean {
  const groupedFilters: Map<string, [Operator, any][]> = filters.reduce(
    (groups, statement) => {
      const [path, op, value] = statement;
      if (groups.has(path)) {
        groups.get(path).push([op, value]);
      } else {
        groups.set(path, [[op, value]]);
      }
      return groups;
    },
    new Map()
  );

  return (
    groupedFilters.size === 0 ||
    [...groupedFilters.entries()].every(([path, filters]) => {
      const dataType = schema && getSchemaFromPath(schema, path.split('.'));
      return filters.every(([op, filterValue]) => {
        // If we have a schema handle specific cases
        if (dataType && dataType.type === 'set') {
          return satisfiesSetFilter(entity, path, op, filterValue);
        }
        // Use register as default
        return satisfiesRegisterFilter(entity, path, op, filterValue);
      });
    })
  );
}

// TODO: this should probably go into the set defintion
// TODO: handle possible errors with sets
function satisfiesSetFilter(
  entity: any,
  path: string,
  op: Operator,
  filterValue: any
) {
  const pointer = '/' + path.replace('.', '/');
  const value: Record<string, [boolean, Timestamp]> = ValuePointer.Get(
    entity,
    pointer
  );
  return (
    !!value &&
    Object.entries(value)
      .filter(([_v, [inSet, _ts]]) => inSet)
      .some(([v]) => isOperatorSatisfied(op, v, filterValue))
  );
}

function satisfiesRegisterFilter(
  entity: any,
  path: string,
  op: Operator,
  filterValue: any
) {
  const maybeValue = path
    .split('.')
    .reduce((acc, curr) => acc && acc[curr], entity);
  if (!maybeValue) console.warn(`${path} not found in ${entity}`);

  // maybeValue is expected to be of shape [value, timestamp]
  // this may happen if a schema is expected but not there and we're reading a value that cant be parsed, the schema is incorrect somehow, or if the provided path is incorrect
  if (maybeValue && (!(maybeValue instanceof Array) || maybeValue.length > 2)) {
    throw new InvalidFilterError(
      `Received an unexpected value at path '${path}' in entity ${JSON.stringify(
        entity
      )} which could not be interpreted as a register when reading filter ${JSON.stringify(
        [path, op, filterValue]
      )}. This is likely caused by (1) the database not properly loading its schema and attempting to interpret a value that is not a regsiter as a register, (2) a schemaless database attempting to interpret a value that is not properly formatted as a register, or (3) a query with a path that does not lead to a leaf attribute in the entity.`
    );
  }
  const [value, _ts] = maybeValue ?? [undefined, undefined];
  return isOperatorSatisfied(op, value, filterValue);
}

function ilike(text: string, pattern: string): boolean {
  // Escape special regex characters in the pattern
  pattern = pattern.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  // Replace SQL LIKE wildcards (%) with equivalent regex wildcards (.*)
  pattern = pattern.replace(/%/g, '.*');

  // Replace SQL LIKE single-character wildcards (_) with equivalent regex wildcards (.)
  pattern = pattern.replace(/_/g, '.');

  // Create a RegExp object from the pattern
  const regex = new RegExp(`^${pattern}$`, 'i');

  // Test the text against the regex
  return regex.test(text);
}

function isOperatorSatisfied(op: Operator, value: any, filterValue: any) {
  switch (op) {
    case '=':
      return value == filterValue;
    case '!=':
      return value !== filterValue;
    case '>':
      return value > filterValue;
    case '>=':
      return value >= filterValue;
    case '<':
      return value < filterValue;
    case '<=':
      return value <= filterValue;

    //TODO: move regex initialization outside of the scan loop to improve performance
    case 'like':
      return ilike(value, filterValue);
    case 'nlike':
      return !ilike(value, filterValue);
    case 'in':
      return new Set(filterValue).has(value);
    case 'nin':
      return !new Set(filterValue).has(value);
    default:
      throw new InvalidFilterError(`The operator ${op} is not recognized.`);
  }
}

async function getCollectionEntitiesAndTriples(
  tx: TripleStoreApi,
  collectionName: string
): Promise<Map<string, { triples: TripleRow[]; entity: any }>> {
  // This could use the object entity index but keeping seperate for now to allow this to be used in instead of the entity index if we need to disable it
  const collectionTriples = await tx.findByCollection(collectionName);
  return collectionTriples.reduce((acc, triple) => {
    const { id } = triple;
    if (!acc.has(id)) {
      acc.set(id, { triples: [], entity: {} });
    }
    const entry = acc.get(id);
    entry!.triples.push(triple);
    entry.entity = entityToResultReducer(entry.entity ?? {}, triple);
    return acc;
  }, new Map());
}

async function getCollectionEntities(
  tx: TripleStoreApi,
  collectionName: string
): Promise<Map<string, { triples: TripleRow[]; entity: any }>> {
  const collectionTriples = await tx.findByCollection(collectionName);
  return triplesToEntities(collectionTriples);
}

export type CollectionQuerySchema<Q extends CollectionQuery<any, any>> =
  Q extends CollectionQuery<infer M, infer CN> ? ModelFromModels<M, CN> : never;

function subscribeSingleEntity<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (
    args: [results: FetchResult<Q>, newTriples: Map<string, TripleRow[]>]
  ) => void,
  onError?: (error: any) => void,
  schema?: M
) {
  const asyncUnSub = async () => {
    const { collectionName, entityId } = query;
    let entity: any;
    let triples: Map<string, TripleRow[]> = new Map();
    const collectionSchema = schema && schema[query.collectionName]?.attributes;
    try {
      if (!entityId) throw new EntityIdMissingError();
      const internalEntityId = appendCollectionToId(collectionName, entityId);
      const fetchResult = await fetch<M, Q>(tripleStore, query, {
        includeTriples: true,
        schema,
      });
      entity = fetchResult.results.has(entityId)
        ? fetchResult.results.get(entityId)
        : null;
      triples = fetchResult.triples;
      const results = new Map(
        entity ? [[entityId, convertEntityToJS(entity, collectionSchema)]] : []
      ) as FetchResult<Q>;

      onResults([results, triples]);
      const unsub = tripleStore.onWrite(async ({ inserts, deletes }) => {
        try {
          const entityInserts = inserts.filter(
            ({ id }) => id === internalEntityId
          );
          const entityDeletes = deletes.filter(
            ({ id }) => id === internalEntityId
          );
          const changed = entityInserts.length > 0 || entityDeletes.length > 0;
          // Early return prevents processing if no relevant entities were updated
          if (!changed) return;

          // if we have deletes, need to re-fetch the entity
          if (entityDeletes.length) {
            const fetchResult = await fetch<M, Q>(tripleStore, query, {
              includeTriples: true,
              schema,
            });
            entity = fetchResult.results.has(entityId)
              ? fetchResult.results.get(entityId)
              : null;
            triples = fetchResult.triples;
          } else {
            entity = filterToLatestEntityAttribute(entityInserts).reduce(
              entityToResultReducer,
              entity
            );
            if (!triples.has(entityId)) {
              triples.set(entityId, []);
            }
            triples.get(entityId)!.push(...entityInserts);
          }
          if (
            entity &&
            doesEntityObjMatchWhere(entity, query.where ?? [], collectionSchema)
          ) {
            results.set(
              entityId,
              convertEntityToJS(entity, collectionSchema) as any
            );
          } else {
            results.delete(entityId);
          }
          onResults([results, triples]);
        } catch (e) {
          onError && onError(e);
        }
      });
      return unsub;
    } catch (e) {
      onError && onError(e);
    }
    return () => {};
  };

  const unsubPromise = asyncUnSub();

  return async () => {
    const unsub = await unsubPromise;
    unsub();
  };
}

export function subscribeResultsAndTriples<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (
    args: [results: FetchResult<Q>, newTriples: Map<string, TripleRow[]>]
  ) => void,
  onError?: (error: any) => void,
  schema?: M
) {
  const order = query.order;
  const limit = query.limit;
  const queryWithInsertedVars = replaceVariablesInQuery(query);
  const where = queryWithInsertedVars.where;
  const asyncUnSub = async () => {
    let results: FetchResult<Q> = new Map() as FetchResult<Q>;
    let triples: Map<string, TripleRow[]> = new Map();
    try {
      const fetchResult = await fetch<M, Q>(tripleStore, query, {
        includeTriples: true,
        schema,
      });
      results = fetchResult.results;
      triples = fetchResult.triples;
      onResults([
        new Map(
          [...results].map(([id, entity]) => [
            id,
            convertEntityToJS(
              entity,
              schema && schema[query.collectionName]?.attributes
            ),
          ])
        ) as FetchResult<Q>,
        triples,
      ]);
      const unsub = tripleStore.onWrite(async ({ inserts, deletes }) => {
        try {
          // Handle queries with nested queries as a special case for now
          if (someFilterStatements(where, (filter) => 'exists' in filter)) {
            const fetchResult = await fetch<M, Q>(tripleStore, query, {
              includeTriples: true,
              schema,
            });
            results = fetchResult.results;
            triples = fetchResult.triples;
            onResults([
              new Map(
                [...results].map(([id, entity]) => [
                  id,
                  convertEntityToJS(
                    entity,
                    schema && schema[query.collectionName]?.attributes
                  ),
                ])
              ) as FetchResult<Q>,
              triples,
            ]);
            return;
          }

          let nextResult = new Map(results);
          const matchedTriples: Map<string, TripleRow[]> = new Map();
          const updatedEntitiesForQuery = new Set<string>(
            [...inserts, ...deletes]
              .map(({ id }) => splitIdParts(id))
              .filter(
                ([collectionName, _id]) =>
                  collectionName === query.collectionName
              )
              .map(([_collectionName, id]) => id)
          );
          // Early return prevents processing if no relevant entities were updated
          // While a query is always scoped to a single collection this is safe
          if (!updatedEntitiesForQuery.size) return;
          for (const entity of updatedEntitiesForQuery) {
            const entityTriples = filterToLatestEntityAttribute(
              await tripleStore.findByEntity(
                appendCollectionToId(query.collectionName, entity)
              )
            );
            // TODO: there is some slight inconsistency here between fetch and subscribe...this will assign default values, particularly to sets
            const entityObj: any = entityTriples.reduce((ent, trip) => {
              return entityToResultReducer(ent, trip);
            }, {});
            const isInCollection =
              entityObj['_collection'] &&
              entityObj['_collection'][0] === query.collectionName;
            const isInResult =
              isInCollection &&
              doesEntityObjMatchWhere(
                entityObj,
                where ?? [],
                schema && schema[query.collectionName]?.attributes
              );

            // Check if the result stays within the current range of the query based on the limit
            // If it doesnt, we'll remove and might add it back when we backfill
            let satisfiesLimitRange = true;
            if (order && limit && nextResult.size >= limit) {
              const allValues = [...nextResult.values()];
              const valueRange = [
                allValues.at(0)[order[0][0]][0],
                allValues.at(-1)[order[0][0]][0],
              ];
              const entityValue = entityObj[order[0][0]][0];
              satisfiesLimitRange =
                order[0][1] === 'ASC'
                  ? entityValue <= valueRange[1]
                  : entityValue >= valueRange[1];
            }

            // Add to result or prune as needed
            if (isInResult && satisfiesLimitRange) {
              nextResult.set(entity, entityObj);
              matchedTriples.set(entity, entityTriples);
            } else {
              if (nextResult.has(entity)) {
                nextResult.delete(entity);
                matchedTriples.set(entity, entityTriples);
              }
            }
          }

          if (order || limit) {
            const entries = [...nextResult];

            // If we have removed data from the result set we need to backfill
            if (limit && entries.length < limit) {
              const lastResultEntry = entries.at(entries.length - 1);
              const backFillQuery = {
                ...query,
                limit: limit - entries.length,
                after: lastResultEntry
                  ? [
                      lastResultEntry[1][order![0][0]][0],
                      appendCollectionToId(
                        query.collectionName,
                        lastResultEntry[0]
                      ),
                    ]
                  : undefined,
              };
              const backFilledResults = await fetch<M, Q>(
                tripleStore,
                backFillQuery,
                {
                  schema,
                  includeTriples: true,
                }
              );
              entries.push(...backFilledResults.results);
            }

            if (order) {
              // const [prop, dir] = order;
              entries.sort(([_aId, a], [_bId, b]) => {
                for (const [prop, dir] of order) {
                  // TODO support multi-level props probably using TypeBox json pointer
                  const direction =
                    a[prop][0] < b[prop][0]
                      ? -1
                      : a[prop][0] == b[prop][0]
                      ? 0
                      : 1;

                  if (direction !== 0)
                    return dir === 'ASC' ? direction : direction * -1;
                }
                return 0;
              });
            }

            nextResult = new Map(entries.slice(0, limit));
          }

          results = nextResult as FetchResult<Q>;
          triples = matchedTriples;
          // console.timeEnd('query recalculation');
          onResults([
            new Map(
              [...results].map(([id, entity]) => [
                id,
                convertEntityToJS(
                  entity,
                  schema && schema[query.collectionName]?.attributes
                ),
              ])
            ) as FetchResult<Q>,
            triples,
          ]);
        } catch (e) {
          onError && onError(e);
        }
      });
      return unsub;
    } catch (e) {
      onError && onError(e);
    }
    return () => {};
  };

  const unsubPromise = asyncUnSub();

  return async () => {
    const unsub = await unsubPromise;
    unsub();
  };
}

export function subscribe<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (results: FetchResult<Q>) => void,
  onError?: (error: any) => void,
  schema?: M
) {
  if (query.entityId) {
    return subscribeSingleEntity(
      tripleStore,
      query,
      ([results]) => {
        onResults(results);
      },
      onError,
      schema
    );
  }
  return subscribeResultsAndTriples(
    tripleStore,
    query,
    ([results]) => {
      onResults(results);
    },
    onError,
    schema
  );
}

// TODO: we should do this in a single step when calling entityToResultReducer
function filterToLatestEntityAttribute(triples: TripleRow[]) {
  const latest = new Map<string, TripleRow>();
  for (const triple of triples) {
    const key = stringifyEA(triple.id, triple.attribute);
    if (!latest.has(key)) {
      latest.set(key, triple);
      continue;
    }
    if (timestampCompare(latest.get(key)!.timestamp, triple.timestamp) < 0) {
      latest.set(key, triple);
      continue;
    }
  }
  return [...latest.values()];
}

function stringifyEA(entity: EntityId, attribute: Attribute) {
  return `${entity}|${attribute}`;
}

export function subscribeTriples<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (results: Map<string, TripleRow[]>) => void,
  onError?: (error: any) => void,
  schema?: M
) {
  if (query.entityId) {
    return subscribeSingleEntity(
      tripleStore,
      query,
      ([_results, triples]) => {
        onResults(triples);
      },
      onError,
      schema
    );
  }
  return subscribeResultsAndTriples(
    tripleStore,
    query,
    ([_results, triples]) => {
      onResults(triples);
    },
    onError,
    schema
  );
}
