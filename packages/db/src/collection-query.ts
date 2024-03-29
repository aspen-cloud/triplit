import Builder from './utils/builder.js';
import {
  Query,
  FilterStatement,
  FilterGroup,
  QUERY_INPUT_TRANSFORMERS,
  SubQueryFilter,
  CollectionQuery,
  triplesToEntities,
  Entity,
  updateEntity,
  RelationSubquery,
  EntityPointer,
  QueryOrder,
  ValueCursor,
} from './query.js';
import {
  convertEntityToJS,
  getSchemaFromPath,
  IsPropertyOptional,
  Model,
  Models,
  timestampedObjectToPlainObject,
  TimestampedTypeFromModel,
} from './schema.js';
import { Timestamp } from './timestamp.js';
import { TripleStore, TripleStoreApi } from './triple-store.js';
import { Pipeline } from './utils/pipeline.js';
import {
  EntityIdMissingError,
  InvalidFilterError,
  TriplitError,
} from './errors.js';
import {
  stripCollectionFromId,
  appendCollectionToId,
  splitIdParts,
  replaceVariablesInQuery,
  someFilterStatements,
  prepareQuery,
  fetchResultToJS,
} from './db-helpers.js';
import { Operator } from './data-types/base.js';
import { VariableAwareCache } from './variable-aware-cache.js';
import { isTimestampedEntityDeleted } from './entity.js';
import { CollectionNameFromModels, ModelFromModels } from './db.js';
import { QueryResultCardinality, QueryType } from './data-types/query.js';
import { ExtractJSType } from './data-types/type.js';
import { RangeContraints, TripleRow, Value } from './triple-store-utils.js';
import { Equal } from '@sinclair/typebox/value';

export default function CollectionQueryBuilder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(collectionName: CN, params?: Query<M, CN>) {
  const query: CollectionQuery<M, CN> = {
    collectionName,
    ...params,
  };
  return Builder(query, {
    protectedFields: ['collectionName'],
    inputTransformers: QUERY_INPUT_TRANSFORMERS<M, CN>(),
  });
}

export type QueryResult<
  Q extends CollectionQuery<any, any>,
  C extends QueryResultCardinality
> = C extends 'one' ? FetchResultEntity<Q> : FetchResult<Q>;

export type FetchResult<C extends CollectionQuery<any, any>> = Map<
  string,
  FetchResultEntity<C>
>;

export type TimestampedFetchResult<C extends CollectionQuery<any, any>> = Map<
  string,
  TimestampedFetchResultEntity<C>
>;

export type TimestampedFetchResultEntity<C extends CollectionQuery<any, any>> =
  C extends CollectionQuery<infer M, infer CN>
    ? M extends Models<any, any>
      ? TimestampedTypeFromModel<ModelFromModels<M, CN>>
      : any
    : never;

export type CollectionNameFromQuery<Q extends CollectionQuery<any, any>> =
  Q extends CollectionQuery<infer _M, infer CN> ? CN : never;

export type JSTypeOrRelation<
  Ms extends Models<any, any>,
  M extends Model<any>,
  propName extends keyof M['properties']
> = M['properties'][propName] extends QueryType<infer Q, infer Cardinality>
  ? QueryResult<CollectionQuery<Ms, Q['collectionName']>, Cardinality>
  : IsPropertyOptional<M['properties'][propName]> extends true
  ? ExtractJSType<M['properties'][propName]> | undefined
  : ExtractJSType<M['properties'][propName]>;

// Trying this out, having types that know and dont know the schema exists might be a useful pattern
export type MaybeReturnTypeFromQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = M extends Models<any, any> ? ReturnTypeFromQuery<M, CN> : any;

export type ReturnTypeFromQuery<
  M extends Models<any, any>,
  CN extends CollectionNameFromModels<M>
> = ModelFromModels<M, CN> extends Model<any>
  ? {
      [k in keyof ModelFromModels<M, CN>['properties']]: JSTypeOrRelation<
        M,
        ModelFromModels<M, CN>,
        k
      >;
    }
  : any;

export type FetchResultEntity<C extends CollectionQuery<any, any>> =
  C extends CollectionQuery<infer M, infer CN>
    ? M extends Models<any, any>
      ? ReturnTypeFromQuery<M, CN>
      : any
    : never;

export interface FetchOptions {
  schema?: Models<any, any>;
  skipRules?: boolean;
}

interface SubscriptionOptions {
  cache?: VariableAwareCache<any>;
  skipRules?: boolean;
  stateVector?: Map<string, number>;
}

function getIdFilterFromQuery(query: CollectionQuery<any, any>): string | null {
  const { where, entityId, collectionName } = query;

  if (entityId) return appendCollectionToId(collectionName, entityId);

  const idEqualityFilters = where?.filter(
    (filter) =>
      filter instanceof Array && filter[0] === 'id' && filter[1] === '='
  ) as FilterStatement<Model<any>>[];

  if (idEqualityFilters.length > 0) {
    return appendCollectionToId(
      collectionName,
      idEqualityFilters[0][2] as string
    );
  }
  return null;
}

async function getCandidateTriplesForQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(tx: TripleStoreApi, query: Q) {
  const entityId = getIdFilterFromQuery(query);

  if (entityId) {
    return tx.findByEntity(entityId);
  }
  return tx.findByCollection(query.collectionName);
}

async function getOrderedIdsForQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(tx: TripleStoreApi, query: Q) {
  const { order, limit, after } = query;
  const entityId = getIdFilterFromQuery(query);
  if (entityId) {
    return [entityId];
  }

  if (order?.length) {
    const direction = order[0][1];
    const [cursor, inclusive] = after ?? [undefined, false];
    const gtArg =
      order.length === 1
        ? direction === 'ASC'
          ? cursor
          : undefined
        : undefined;
    const ltArg =
      order.length === 1
        ? direction === 'ASC'
          ? undefined
          : cursor
        : undefined;

    const rangeParams: RangeContraints = {
      direction,
      greaterThan: inclusive ? undefined : gtArg,
      greaterThanOrEqual: inclusive ? gtArg : undefined,
      lessThan: inclusive ? undefined : ltArg,
      lessThanOrEqual: inclusive ? ltArg : undefined,
    };
    return Array.from(
      new Set(
        (
          await tx.findValuesInRange(
            [query.collectionName, ...(order[0][0] as string).split('.')],
            rangeParams
          )
        ).map((t) => t.id)
      )
    );
  }

  return Array.from(
    new Set(
      (await tx.findByAVE([['_collection'], query.collectionName])).map(
        (t) => t.id
      )
    )
  );
}

function getEntitiesAtStateVector(
  collectionTriples: TripleRow[],
  stateVector?: Map<string, number>
) {
  return triplesToEntities(
    collectionTriples,
    stateVector && stateVector.size > 0 ? stateVector : undefined
  );
}

async function getTriplesAfterStateVector(
  tx: TripleStoreApi,
  stateVector: Map<string, number>
): Promise<TripleRow[]> {
  const allTriples: TripleRow[] = [];
  const allClientIds = await tx.findAllClientIds();
  const completeStateVector = new Map<string, number>(
    allClientIds.map((clientId) => [clientId, stateVector.get(clientId) ?? 0])
  );
  for (const [clientId, tick] of completeStateVector) {
    const triples = await tx.findByClientTimestamp(clientId, 'gt', [
      tick,
      clientId,
    ]);
    allTriples.push(...triples);
  }
  return allTriples;
}

export async function fetchDeltaTriples<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(tx: TripleStoreApi, query: Q, newTriples: TripleRow[], schema?: M) {
  const queryPermutations = generateQueryRootPermutations(
    replaceVariablesInQuery(query)
  );

  const changedEntityTriples = newTriples.reduce((entities, trip) => {
    if (!entities.has(trip.id)) {
      entities.set(trip.id, []);
    }
    entities.get(trip.id)!.push(trip);
    return entities;
  }, new Map<string, TripleRow[]>());
  const deltaTriples: TripleRow[] = [];

  // this is kinda weird but we're actually creating the state vector that would be
  // before these changed triples so it's looking for the min timestamp rather than
  // the max
  const stateVector = newTriples.reduce<Map<string, number>>((acc, curr) => {
    const [tick, clientId] = curr.timestamp;
    if (!acc.has(clientId) || tick < acc.get(clientId)! + 1) {
      acc.set(clientId, Math.max(tick - 1, 0));
    }
    return acc;
  }, new Map());
  for (const changedEntityId of changedEntityTriples.keys()) {
    const entityTriples = await tx.findByEntity(changedEntityId);
    const entityBeforeStateVector = getEntitiesAtStateVector(
      entityTriples,
      stateVector
    ).get(changedEntityId)?.data;
    const entityAndTriplesAfterStateVector =
      getEntitiesAtStateVector(entityTriples).get(changedEntityId);
    const entityAfterStateVector = entityAndTriplesAfterStateVector?.data;

    for (const q of queryPermutations) {
      if (q.collectionName !== splitIdParts(changedEntityId)[0]) {
        continue;
      }
      const matchesSimpleFiltersBefore =
        !!entityBeforeStateVector &&
        doesEntityObjMatchWhere(
          entityBeforeStateVector,
          q.where,
          schema && schema[q.collectionName]?.schema
        );
      const matchesSimpleFiltersAfter =
        !!entityAfterStateVector &&
        doesEntityObjMatchWhere(
          entityAfterStateVector,
          q.where,
          schema && schema[q.collectionName]?.schema
        );
      if (!matchesSimpleFiltersBefore && !matchesSimpleFiltersAfter) {
        continue;
      }

      const subQueries = (q.where ?? []).filter(
        (filter) => 'exists' in filter
      ) as SubQueryFilter<M>[];
      let matchesBefore = matchesSimpleFiltersBefore;
      if (matchesSimpleFiltersBefore && subQueries.length > 0) {
        for (const { exists: subQuery } of subQueries) {
          const subQueryResult = await fetchOne(
            tx,
            {
              ...subQuery,
              vars: {
                ...q.vars,
                ...subQuery.vars,
                ...(schema
                  ? schema![q.collectionName].schema?.convertDBValueToJS(
                      timestampedObjectToPlainObject(
                        entityBeforeStateVector,
                        true
                      )
                    )
                  : timestampedObjectToPlainObject(
                      entityBeforeStateVector,
                      true
                    )),
              },
            } as CollectionQuery<M, any>,
            { schema }
          );
          if (subQueryResult.results === null) {
            matchesBefore = false;
            continue;
          }
        }
      }
      const afterTriplesMatch = [];
      let matchesAfter = matchesSimpleFiltersAfter;
      if (matchesSimpleFiltersAfter && subQueries.length > 0) {
        for (const { exists: subQuery } of subQueries) {
          const subQueryResult = await fetchOne(
            tx,
            {
              ...subQuery,
              vars: {
                ...q.vars,
                ...subQuery.vars,
                ...(schema
                  ? schema![q.collectionName].schema?.convertDBValueToJS(
                      timestampedObjectToPlainObject(
                        entityAfterStateVector as any,
                        true
                      )
                    )
                  : timestampedObjectToPlainObject(
                      entityAfterStateVector as any,
                      true
                    )),
              },
            } as CollectionQuery<M, any>,
            { schema }
          );
          if (subQueryResult.results === null) {
            matchesAfter = false;
            continue;
          }
          afterTriplesMatch.push(
            ...[...subQueryResult.triples.values()].flat()
          );
        }
      }

      if (!matchesBefore && !matchesAfter) {
        continue;
      }

      if (!matchesBefore) {
        if (subQueries.length === 0) {
          // Basically where including the whole entity if it is new to the result set
          // but we also want to filter any triples that will be included in the
          // final step of adding changed triples for the given entity
          // An example is if we insert a net new entity it will not match before
          // so it need's the whole entity to be sent but that will fully overlap
          // with the last step.
          const alreadyIncludedTriples =
            changedEntityTriples.get(changedEntityId)!;
          const tripleKeys = new Set(
            alreadyIncludedTriples.map(
              (t) =>
                t.id + JSON.stringify(t.attribute) + JSON.stringify(t.timestamp)
            )
          );
          afterTriplesMatch.push(
            ...Object.values(entityAndTriplesAfterStateVector!.triples)
              .flat()
              .filter(
                (t) =>
                  !tripleKeys.has(
                    t.id +
                      JSON.stringify(t.attribute) +
                      JSON.stringify(t.timestamp)
                  )
              )
          );
        }
        deltaTriples.push(...afterTriplesMatch);
      }
      deltaTriples.push(...changedEntityTriples.get(changedEntityId)!);
    }
  }
  return deltaTriples;
}

/**
 * This takes a relational query (i.e. has sub-queries in `where` or `select`) and generates all permutations of the query where each sub-query is written as the root query.
 * In a sense it reverses the direction of the relation.
 * E.g. If the query is like "Users with posts created in the last week" it will generate permutations like "Posts created in the last week with their users"
 * @param query The query to generate permutations for
 */
export function generateQueryRootPermutations<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q) {
  const queries = [];
  for (const chain of generateQueryChains(query)) {
    queries.push(queryChainToQuery(chain.slice().reverse()));
  }
  return queries;
}

/**
 * This takes a list of queries and builds up a query where
 * each query implicit depends on the next query
 * each query at pos 0 will have add an exists filter to the next query
 * @param chain
 */
function queryChainToQuery<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(chain: Q[], additionalFilters: FilterStatement<any, any>[] = []): Q {
  const [first, ...rest] = chain;
  if (rest.length === 0)
    return {
      ...first,
      where: [...(first.where ?? []), ...additionalFilters],
    };
  const variableFilters = (first.where ?? []).filter(
    (filter) =>
      filter instanceof Array &&
      typeof filter[2] === 'string' &&
      filter[2].startsWith('$')
  ) as FilterStatement<Model<any>>[];
  const nonVariableFilters = (first.where ?? []).filter(
    (filter) =>
      !(
        filter instanceof Array &&
        typeof filter[2] === 'string' &&
        filter[2].startsWith('$')
      )
  ) as FilterStatement<Model<any>>[];
  const next = queryChainToQuery(
    rest,
    variableFilters.map(reverseRelationFilter)
  );
  return {
    ...first,
    where: [
      ...nonVariableFilters,
      ...additionalFilters,
      {
        exists: next,
      },
    ],
  };
}

function* generateQueryChains<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(query: Q, prefix: Q[] = []): Generator<Q[]> {
  yield [...prefix, query];
  const subQueryFilters = (query.where ?? []).filter(
    (filter) => 'exists' in filter
  ) as SubQueryFilter<M>[];
  const subQuerySelects = (query.select ?? []).filter(
    (select) => typeof select !== 'string'
  ) as RelationSubquery<M>[];
  const subQueries = [
    ...subQueryFilters.map((f) => f.exists),
    ...subQuerySelects.map((s) => s.subquery),
  ];
  for (const subQuery of subQueries) {
    // yield [query, subQuery] as const;
    const queryWithoutSubQuery = {
      ...query,
      where: (query.where ?? []).filter(
        (f) => !('exists' in f) || f.exists !== subQuery
      ),
      select: (query.select ?? []).filter(
        (s) => typeof s !== 'object' || s.subquery !== subQuery
      ),
    };
    yield* generateQueryChains(subQuery as Q, [
      ...prefix,
      queryWithoutSubQuery,
    ]);
  }
}

const REVERSE_OPERATOR_MAPPINGS = {
  '=': '=',
  '!=': '!=',
  '<': '>',
  '>': '<',
  '<=': '>=',
  '>=': '<=',
  in: 'has',
  nin: '!has',
  has: 'in',
  '!has': 'nin',
};
function reverseRelationFilter(filter: FilterStatement<any, any>) {
  const [path, op, value] = filter;
  if (typeof value !== 'string' || !value.startsWith('$')) {
    throw new TriplitError(
      `Expected filter value to be a relation variable, but got ${value}`
    );
  }
  return [
    value.slice(1),
    // @ts-expect-error
    REVERSE_OPERATOR_MAPPINGS[op],
    '$' + path,
  ] as FilterStatement<any, any>;
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
  {
    schema,
    cache,
    stateVector,
    skipRules,
  }: FetchOptions & {
    cache?: VariableAwareCache<any>;
    stateVector?: Map<string, number>;
  } = {}
): Promise<{
  results: TimestampedFetchResult<Q>;
  triples: Map<string, TripleRow[]>;
}> {
  const collectionSchema = schema?.[query.collectionName]?.schema;
  if (cache && VariableAwareCache.canCacheQuery(query, collectionSchema)) {
    return cache!.resolveFromCache(query, collectionSchema);
  }
  const queryWithInsertedVars = replaceVariablesInQuery(query);
  const { order, limit, select, where, entityId, collectionName, after } =
    queryWithInsertedVars;

  // TODO lazy load as needed using a cursor or iterator rather than loading entire index at once
  const resultOrder = await getOrderedIdsForQuery(tx, queryWithInsertedVars);

  let entityCount = 0;
  let previousOrderVal: Value;
  const resultTriples: Map<string, TripleRow[]> = new Map();
  let entities = await new Pipeline(resultOrder)
    .map(async (id) => {
      const entityTriples = await tx.findByEntity(id);
      const entity = triplesToEntities(entityTriples).get(id)?.data;
      const externalId = stripCollectionFromId(id);
      return [externalId, { triples: entityTriples, entity }] as const;
    })
    // Apply where filters
    .filter(async ([id, { entity }]) => {
      if (!entity) return false;
      if (!where) return true;
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
        let existsSubQuery = {
          ...subQuery,
          vars: {
            ...query.vars,
            ...subQuery.vars,
            // Ensure we pass in all keys from the entity (2nd param true)
            // Kind of a hack to get around issues with deleted data
            ...extractSubqueryVarsFromEntity(entity, schema, collectionName),
          },
          limit: 1,
        } as CollectionQuery<typeof schema, any>;
        existsSubQuery = prepareQuery(existsSubQuery, schema, {
          skipRules,
        });
        const subQueryFetch = await fetch<M, typeof existsSubQuery>(
          tx,
          existsSubQuery,
          {
            schema,
            cache,
            skipRules,
            stateVector,
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
        resultTriples.set(id, triples as TripleRow[]);
      } else {
        resultTriples.set(id, resultTriples.get(id)!.concat(triples));
      }
      return [id, entity] as [string, any];
    })
    // We need to make sure that all the triples are accounted for before we filter out deleted entities
    .filter(async ([, entity]) => !isTimestampedEntityDeleted(entity))
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
    sortEntities(order, entities);
    let startIndex = 0;
    if (after) {
      const [cursor, inclusive] = after;
      let afterIndex = entities.findIndex(
        ([id]) => id === stripCollectionFromId(cursor![1])
      );
      if (afterIndex !== -1) startIndex = afterIndex + (inclusive ? 0 : 1);
    }
    if (limit) entities = entities.slice(startIndex, startIndex + limit);
  }

  if (select && select.length > 0) {
    entities = await new Pipeline(entities)
      .map(async ([entId, entity]) => {
        const selectedEntity = select
          .filter((sel) => typeof sel === 'string')
          .reduce<any>(selectParser(entity), {});
        const subqueries = select.filter(
          (sel) => typeof sel !== 'string'
        ) as RelationSubquery<M>[];
        const subQueryTriples: TripleRow[] = [];
        for (const { attributeName, subquery, cardinality } of subqueries) {
          const combinedVars = {
            ...query.vars,
            ...subquery.vars,
            ...extractSubqueryVarsFromEntity(entity, schema, collectionName),
          };
          let fullSubquery = {
            ...subquery,
            vars: combinedVars,
          } as CollectionQuery<typeof schema, any>;
          fullSubquery = prepareQuery(fullSubquery, schema, { skipRules });
          const subqueryResult =
            cardinality === 'one'
              ? await fetchOne<M, typeof subquery>(tx, fullSubquery, {
                  schema,
                  cache,
                  skipRules,
                })
              : await fetch<M, typeof subquery>(tx, fullSubquery, {
                  schema,
                  cache,
                  skipRules,
                  stateVector,
                });

          selectedEntity[attributeName] = subqueryResult.results;
          subQueryTriples.push(...[...subqueryResult.triples.values()].flat());
        }
        if (!resultTriples.has(entId)) {
          resultTriples.set(entId, subQueryTriples);
        } else {
          resultTriples.set(
            entId,
            resultTriples.get(entId)!.concat(subQueryTriples)
          );
        }

        return [entId, selectedEntity] as [string, any];
      })
      .toArray();
  }
  return {
    results: new Map(entities), // TODO: also need to deserialize data?
    triples: resultTriples,
  };
}

function sortEntities(order: any, entities: [string, any][]) {
  entities.sort(([_aId, a], [_bId, b]) => {
    for (const [prop, dir] of order) {
      const direction =
        a[prop][0] < b[prop][0] ? -1 : a[prop][0] == b[prop][0] ? 0 : 1;
      if (direction !== 0) return dir === 'ASC' ? direction : direction * -1;
    }
    return 0;
  });
}

export async function fetchOne<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tx: TripleStoreApi,
  query: Q,
  {
    schema,
    cache,
  }: FetchOptions & {
    cache?: VariableAwareCache<any>;
  } = {}
): Promise<{
  results: FetchResultEntity<Q> | null;
  triples: Map<string, TripleRow[]>;
}> {
  query = { ...query, limit: 1 };
  const fetchResult = await fetch(tx, query, {
    schema,
    cache,
  });
  const { results, triples } = fetchResult;
  return {
    results: [...results.values()][0] ?? null,
    triples,
  };
}

export function doesEntityObjMatchWhere<Q extends CollectionQuery<any, any>>(
  entityObj: any,
  where: Q['where'],
  schema?: CollectionQuerySchema<Q>
) {
  if (!where) return true;
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
    filters.some((filter) =>
      doesEntityObjMatchWhere(entityObj, [filter], schema)
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
  const value: Record<string, [boolean, Timestamp]> = EntityPointer.Get(
    entity,
    pointer
  );
  // We dont really support "deleting" sets, but they can appear deleted if the entity is deleted
  // Come back to this after refactoring triple reducer to handle nested data betters
  if (Array.isArray(value)) {
    // indicates set is deleted
    if (value[0] === undefined) {
      return false;
    }
  }

  const setData = timestampedObjectToPlainObject(value);
  if (!setData) return false;
  const filteredSet = Object.entries(setData).filter(([_v, inSet]) => inSet);
  if (op === 'has') {
    return filteredSet.some(([v]) => v === filterValue);
  }
  if (op === '!has') {
    return filteredSet.every(([v]) => v !== filterValue);
  }

  return filteredSet.some(([v]) => isOperatorSatisfied(op, v, filterValue));
}

function satisfiesRegisterFilter(
  entity: any,
  path: string,
  op: Operator,
  filterValue: any
) {
  const maybeValue = EntityPointer.Get(entity, '/' + path.replace('.', '/'));
  if (!maybeValue)
    console.warn(`${path} not found in ${JSON.stringify(entity)}`);

  // maybeValue is expected to be of shape [value, timestamp]
  // this may happen if a schema is expected but not there and we're reading a value that cant be parsed, the schema is incorrect somehow, or if the provided path is incorrect
  const isTimestampedValue =
    !!maybeValue && maybeValue instanceof Array && maybeValue.length === 2;
  const isTerminalValue =
    !!maybeValue &&
    isTimestampedValue &&
    (typeof maybeValue[0] !== 'object' || typeof maybeValue[0] === null);
  if (!!maybeValue && (!isTimestampedValue || !isTerminalValue)) {
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
  ) => void | Promise<void>,
  onError?: (error: any) => void | Promise<void>,
  schema?: M,
  options: SubscriptionOptions = {}
) {
  const asyncUnSub = async () => {
    const { collectionName, entityId, select } = query;
    let entity: any;
    let triples: Map<string, TripleRow[]> = new Map();
    const collectionSchema = schema && schema[query.collectionName]?.schema;
    try {
      if (!entityId) throw new EntityIdMissingError();
      const internalEntityId = appendCollectionToId(collectionName, entityId);
      const fetchResult = await fetch<M, Q>(tripleStore, query, {
        schema,
        skipRules: options.skipRules,
        stateVector: options.stateVector,
        cache: options.cache,
      });
      entity = fetchResult.results.has(entityId)
        ? fetchResult.results.get(entityId)
        : null;
      triples = fetchResult.triples;
      const results = new Map(
        entity
          ? [[entityId, convertEntityToJS(entity, schema, collectionName)]]
          : []
      ) as FetchResult<Q>;

      const unsub = tripleStore.onWrite(async (storeWrites) => {
        try {
          for (const [_storeId, { inserts, deletes }] of Object.entries(
            storeWrites
          )) {
            const entityInserts = inserts.filter(
              ({ id }) => id === internalEntityId
            );
            const entityDeletes = deletes.filter(
              ({ id }) => id === internalEntityId
            );
            const entityChangesCount =
              entityInserts.length + entityDeletes.length;

            // early return if there are no relational selects or if there are no inserts or deletes
            if (
              entityChangesCount === 0 &&
              (!select ||
                select.length === 0 ||
                select.every((sel) => typeof sel === 'string'))
            ) {
              return;
            }

            // if we have deletes, need to re-fetch the entity
            if (entityDeletes.length) {
              const fetchResult = await fetch<M, Q>(tripleStore, query, {
                schema,
                cache: options.cache,
              });
              entity = fetchResult.results.has(entityId)
                ? fetchResult.results.get(entityId)
                : null;
              triples = fetchResult.triples;
            } else {
              const entityWrapper = new Entity({
                data: entity,
                triples: [...triples.values()].flat(),
              });
              updateEntity(entityWrapper, entityInserts);
              entity = entityWrapper.data;
              if (!triples.has(entityId)) {
                triples.set(entityId, []);
              }
              triples.set(entityId, Object.values(entityWrapper.triples));
            }
            if (
              entity &&
              doesEntityObjMatchWhere(
                entity,
                query.where ?? [],
                collectionSchema
              )
            ) {
              if (select && select.length > 0) {
                entity = select
                  .filter((sel) => typeof sel === 'string')
                  .reduce<any>(selectParser(entity), {});

                const subqueries = select.filter(
                  (sel) => typeof sel !== 'string'
                ) as RelationSubquery<M>[];
                for (const {
                  attributeName,
                  subquery,
                  cardinality,
                } of subqueries) {
                  const combinedVars = {
                    ...query.vars,
                    ...subquery.vars,
                    ...extractSubqueryVarsFromEntity(
                      entity,
                      schema,
                      collectionName
                    ),
                  };
                  let fullSubquery = {
                    ...subquery,
                    vars: combinedVars,
                  } as CollectionQuery<typeof schema, any>;
                  fullSubquery = prepareQuery(fullSubquery, schema, {
                    skipRules: options.skipRules,
                  });
                  const subqueryResult =
                    cardinality === 'one'
                      ? await fetchOne<M, typeof subquery>(
                          tripleStore,
                          fullSubquery,
                          {
                            schema,
                            skipRules: options.skipRules,
                            cache: options.cache,
                          }
                        )
                      : await fetch<M, typeof subquery>(
                          tripleStore,
                          fullSubquery,
                          {
                            schema,
                            skipRules: options.skipRules,
                            cache: options.cache,
                          }
                        );
                  entity[attributeName] = subqueryResult.results;
                  triples.set(
                    entityId,
                    [...triples.get(entityId)!].concat(
                      [...subqueryResult.triples.values()].flat()
                    )
                  );
                }
              }
              results.set(
                entityId,
                convertEntityToJS(entity, schema, collectionName) as any
              );
            } else {
              results.delete(entityId);
            }
          }
          await onResults([results, triples]);
        } catch (e) {
          onError && (await onError(e));
        }
      });
      await onResults([results, triples]);
      return unsub;
    } catch (e) {
      onError && (await onError(e));
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
  ) => void | Promise<void>,
  onError?: (error: any) => void | Promise<void>,
  schema?: M,
  options: SubscriptionOptions = {}
) {
  const { select, order, limit } = query;
  const queryWithInsertedVars = replaceVariablesInQuery(query);
  const where = queryWithInsertedVars.where;
  const asyncUnSub = async () => {
    let results: FetchResult<Q> = new Map() as FetchResult<Q>;
    let triples: Map<string, TripleRow[]> = new Map();
    let unsub = () => {};
    try {
      const fetchResult = await fetch<M, Q>(tripleStore, query, {
        schema,
        skipRules: options.skipRules,
        stateVector: options.stateVector,
        cache: options.cache,
      });
      results = fetchResult.results;
      triples = fetchResult.triples;
      unsub = tripleStore.onWrite(async (storeWrites) => {
        try {
          // Handle queries with nested queries as a special case for now
          if (
            (where &&
              someFilterStatements(where, (filter) => 'exists' in filter)) ||
            (select && select.some((sel) => typeof sel !== 'string'))
          ) {
            const fetchResult = await fetch<M, Q>(tripleStore, query, {
              schema,
              skipRules: options.skipRules,
              cache: options.cache,
            });
            results = fetchResult.results;
            triples = fetchResult.triples;
            await onResults([
              new Map(
                [...results].map(([id, entity]) => [
                  id,
                  convertEntityToJS(entity, schema, query.collectionName),
                ])
              ) as FetchResult<Q>,
              triples,
            ]);
            return;
          }

          const allInserts = Object.values(storeWrites).flatMap(
            (ops) => ops.inserts
          );
          const allDeletes = Object.values(storeWrites).flatMap(
            (ops) => ops.deletes
          );
          let nextResult = new Map(results);
          const matchedTriples: Map<string, TripleRow[]> = new Map();
          const updatedEntitiesForQuery = new Set<string>(
            [...allInserts, ...allDeletes]
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

          let queryShouldRefire = false;
          for (const entity of updatedEntitiesForQuery) {
            const entityTriples = await tripleStore.findByEntity(
              appendCollectionToId(query.collectionName, entity)
            );

            function entityMatchesAfter(
              entity: any,
              query: CollectionQuery<any, any>
            ) {
              if (!query.after) return true;
              if (!query.order?.length) return true;
              const orderAttr = query.order[0][0];
              const orderDir = query.order[0][1];
              const [cursor, inclusive] = query.after;
              const [afterEntityValue, afterEntityId] = cursor;
              const entityValue = entity[orderAttr][0];
              // TODO: need to perform encoding at least I think...
              if (orderDir === 'ASC') {
                if (entityValue === afterEntityValue) {
                  return inclusive
                    ? entity.id[0] >= stripCollectionFromId(afterEntityId)
                    : entity.id[0] > stripCollectionFromId(afterEntityId);
                }
                return (
                  entityValue >
                  // @ts-expect-error - handle encoding / null / dates / etc
                  afterEntityValue
                );
              } else {
                if (entityValue === afterEntityValue) {
                  return inclusive
                    ? entity.id[0] <= stripCollectionFromId(afterEntityId)
                    : entity.id[0] < stripCollectionFromId(afterEntityId);
                }
                return (
                  entityValue <
                  // @ts-expect-error - handle encoding / null / dates / etc
                  afterEntityValue
                );
              }
            }

            const entityWrapper = new Entity();
            updateEntity(entityWrapper, entityTriples);
            const entityObj = entityWrapper.data as FetchResultEntity<Q>;
            const isInCollection =
              entityObj['_collection'] &&
              entityObj['_collection'][0] === query.collectionName;
            const isInResult =
              isInCollection &&
              doesEntityObjMatchWhere(
                entityObj,
                where ?? [],
                schema && schema[query.collectionName]?.schema
              ) &&
              entityMatchesAfter(entityObj, query);

            // Check if the result stays within the current range of the query based on the limit
            // If it doesnt, we'll remove and might add it back when we backfill
            let satisfiesLimitRange = true;
            if (order && limit && nextResult.size >= limit) {
              const allValues = [...nextResult.values()];
              const valueRange = [
                allValues.at(0)![order[0][0]][0],
                allValues.at(-1)![order[0][0]][0],
              ];
              const entityValue = entityObj[order[0][0]][0];
              satisfiesLimitRange =
                order[0][1] === 'ASC'
                  ? entityValue <= valueRange[1]
                  : entityValue >= valueRange[1];
            }

            // Add to result or prune as needed
            if (isInResult && satisfiesLimitRange) {
              if (
                !nextResult.has(entity) ||
                !Equal(nextResult.get(entity), entityObj)
              ) {
                // Adding to result set
                nextResult.set(entity, entityObj);
                matchedTriples.set(
                  entity,
                  Object.values(entityWrapper.triples)
                );
                queryShouldRefire = true;
              }
            } else if (nextResult.has(entity)) {
              // prune from a result set
              nextResult.delete(entity);
              matchedTriples.set(entity, Object.values(entityWrapper.triples));
              queryShouldRefire = true;
            }
          }
          // No change to result, return early
          if (!queryShouldRefire) return;
          if (order || limit) {
            const entries = [...nextResult];

            // If we have removed data from the result set we need to backfill
            if (limit && entries.length < limit) {
              const lastResultEntry = entries.at(entries.length - 1);
              const lastResultEntryId =
                lastResultEntry &&
                appendCollectionToId(query.collectionName, lastResultEntry[0]);
              const backFillQuery = {
                ...query,
                limit: limit - entries.length,
                // If there is no explicit order, then order by Id is assumed
                after: lastResultEntryId
                  ? [
                      [
                        order
                          ? lastResultEntry[1][order![0][0]][0]
                          : lastResultEntryId,
                        lastResultEntryId,
                      ],
                      false,
                    ]
                  : undefined,
              };
              const backFilledResults = await fetch<M, Q>(
                tripleStore,
                backFillQuery,
                {
                  schema,
                  skipRules: options.skipRules,
                  // State vector needed in backfill?
                  cache: options.cache,
                }
              );
              entries.push(...backFilledResults.results);
            }

            if (order) {
              sortEntities(order, entries);
            }

            nextResult = new Map(entries.slice(0, limit));
          }

          results = nextResult as FetchResult<Q>;
          triples = matchedTriples;
          // console.timeEnd('query recalculation');
          await onResults([
            new Map(
              [...results].map(([id, entity]) => [
                id,
                convertEntityToJS(entity, schema, query.collectionName),
              ])
            ) as FetchResult<Q>,
            triples,
          ]);
        } catch (e) {
          console.error(e);
          onError && (await onError(e));
        }
      });
      await onResults([
        new Map(
          [...results].map(([id, entity]) => [
            id,
            convertEntityToJS(entity, schema, query.collectionName),
          ])
        ) as FetchResult<Q>,
        triples,
      ]);
    } catch (e) {
      console.error(e);
      onError && (await onError(e));
    }
    return unsub;
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
  onResults: (results: FetchResult<Q>) => void | Promise<void>,
  onError?: (error: any) => void | Promise<void>,
  schema?: M,
  options: SubscriptionOptions = {}
) {
  if (query.entityId) {
    return subscribeSingleEntity(
      tripleStore,
      query,
      ([results]) => onResults(results),
      onError,
      schema,
      options
    );
  }
  return subscribeResultsAndTriples(
    tripleStore,
    query,
    ([results]) => onResults(results),
    onError,
    schema,
    options
  );
}

export function subscribeTriples<
  M extends Models<any, any> | undefined,
  Q extends CollectionQuery<M, any>
>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (results: Map<string, TripleRow[]>) => void | Promise<void>,
  onError?: (error: any) => void | Promise<void>,
  schema?: M,
  options: SubscriptionOptions = {}
) {
  if (query.entityId) {
    return subscribeSingleEntity(
      tripleStore,
      query,
      ([_results, triples]) => onResults(triples),
      onError,
      schema,
      options
    );
  }

  const asyncUnSub = async () => {
    let triples: Map<string, TripleRow[]> = new Map();
    try {
      if (options.stateVector && options.stateVector.size > 0) {
        const triplesAfterStateVector = await getTriplesAfterStateVector(
          tripleStore,
          options.stateVector
        );
        const deltaTriples = await fetchDeltaTriples(
          tripleStore,
          query,
          triplesAfterStateVector,
          schema
        );
        triples = deltaTriples.reduce((acc, t) => {
          if (acc.has(t.id)) {
            acc.get(t.id)!.push(t);
          } else {
            acc.set(t.id, [t]);
          }
          return acc;
        }, new Map<string, TripleRow[]>());
      } else {
        const fetchResult = await fetch<M, Q>(tripleStore, query, {
          schema,
          stateVector: options.stateVector,
          cache: options.cache,
        });
        triples = fetchResult.triples;
      }

      const unsub = tripleStore.onWrite(async (storeWrites) => {
        const allInserts = Object.values(storeWrites).flatMap(
          (ops) => ops.inserts
        );
        const deltaTriples = await fetchDeltaTriples(
          tripleStore,
          query,
          allInserts,
          schema
        );

        const triplesMap = deltaTriples.reduce((acc, t) => {
          if (acc.has(t.id)) {
            acc.get(t.id)!.push(t);
          } else {
            acc.set(t.id, [t]);
          }
          return acc;
        }, new Map<string, TripleRow[]>());

        if (triplesMap.size > 0) {
          onResults(triplesMap);
        }
      });
      await onResults(triples);
      return unsub;
    } catch (e) {
      console.error(e);
      onError && (await onError(e));
    }
    return () => {};
  };

  const unsubPromise = asyncUnSub();

  return async () => {
    const unsub = await unsubPromise;
    unsub();
  };
}

// Subquery variables should include attr: undefined if the entity does not have a value for a given attribute
// This is because the subquery may depend on that variable key existing
// This is worth refactoring, but for now this works
function extractSubqueryVarsFromEntity(
  entity: any,
  schema: Models<any, any> | undefined,
  collectionName: string
) {
  let obj: any = {};
  if (schema) {
    const collectionSchema = schema[collectionName]?.schema;
    const emptyObj = Object.keys(collectionSchema.properties).reduce<any>(
      (obj, k) => {
        obj[k] = undefined;
        return obj;
      },
      {}
    );
    // TODO: schema, collectionName
    obj = { ...emptyObj, ...convertEntityToJS(entity, schema, collectionName) };
  } else {
    obj = { ...timestampedObjectToPlainObject(entity as any, true) };
  }
  delete obj['_collection'];
  return obj;
}

function selectParser(entity: any) {
  return (acc: Record<string, any>, selectPath: any) => {
    const pathParts = (selectPath as string).split('.');
    const leafMostPart = pathParts.pop()!;
    let selectScope = acc;
    let entityScope = entity;
    for (const pathPart of pathParts) {
      selectScope[pathPart] = selectScope[pathPart] ?? {};
      selectScope = selectScope[pathPart];
      entityScope = entity[pathPart][0];
    }
    selectScope[leafMostPart] = entityScope[leafMostPart];

    return acc;
  };
}
