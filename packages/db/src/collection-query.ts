import { ValuePointer } from '@sinclair/typebox/value';
import Builder from './utils/builder';
import {
  Query,
  Operator,
  FilterStatement,
  FilterGroup,
  entityToResultReducer,
  constructEntity,
  QUERY_INPUT_TRANSFORMERS,
  QueryBuilderInputs,
} from './query';
import {
  getSchemaFromPath,
  initialize,
  Model,
  timestampedObjectToPlainObject,
  TypeFromModel,
  UnTimestampedObject,
} from './schema';
import { Timestamp, timestampCompare } from './timestamp';
import {
  Attribute,
  EntityId,
  TripleRow,
  TripleStore,
  TripleStoreTransaction,
  Value,
} from './triple-store';
import { Pipeline } from './utils/pipeline';
import { EntityIdMissingError, InvalidFilterError } from './errors';
import {
  stripCollectionFromId,
  appendCollectionToId,
  splitIdParts,
} from './db-helpers';

export default function CollectionQueryBuilder<
  M extends Model<any> | undefined
>(collectionName: string, params?: Query<M>) {
  // TODO fixup ts so that select/where are actually optional
  return Builder<CollectionQuery<M>, 'collectionName', QueryBuilderInputs<M>>(
    {
      collectionName,
      ...params,
      where: params?.where ?? [],
      select: params?.select ?? [],
      vars: params?.vars ?? {},
    },
    {
      protectedFields: ['collectionName'],
      inputTransformers: QUERY_INPUT_TRANSFORMERS<Query<M>, M>(),
    }
  );
}

export type CollectionQuery<M extends Model<any> | undefined> = Query<M> & {
  collectionName: string;
};

export type FetchResult<C extends CollectionQuery<any>> =
  C extends CollectionQuery<infer M>
    ? M extends Model<any>
      ? Map<string, UnTimestampedObject<TypeFromModel<M>>>
      : M extends undefined
      ? Map<string, any>
      : never
    : never;

export interface FetchOptions {
  includeTriples?: boolean;
  schema?: Model<any>;
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
export async function fetch<Q extends CollectionQuery<any>>(
  tx: TripleStoreTransaction | TripleStore,
  query: Q,
  options?: FetchOptions & {
    includeTriples: false;
  }
): Promise<FetchResult<Q>>;
export async function fetch<Q extends CollectionQuery<any>>(
  tx: TripleStoreTransaction | TripleStore,
  query: Q,
  options?: FetchOptions & { includeTriples: true }
): Promise<{ results: FetchResult<Q>; triples: TripleRow[] }>;
export async function fetch<Q extends CollectionQuery<any>>(
  tx: TripleStoreTransaction | TripleStore,
  query: Q,
  { includeTriples = false, schema }: FetchOptions = {}
) {
  const where = query.where;
  if (query.entityId) {
    const storeId = appendCollectionToId(query.collectionName, query.entityId);
    const triples = await tx.findByEntity(storeId);
    const entity = constructEntity(triples, storeId);
    if (!entity || !doesEntityObjMatchWhere(entity, where, schema)) {
      const results = new Map() as FetchResult<Q>;
      return includeTriples ? { results, triples } : results;
    }
    let updatedEntity = entity;
    if (schema) {
      updatedEntity = deserializeDatesInEntity(updatedEntity, schema);
    }
    if (!includeTriples)
      updatedEntity = timestampedObjectToPlainObject(updatedEntity);
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
    : tx.getEntities(query.collectionName));

  let entityCount = 0;
  let previousOrderVal: Value;
  const resultTriples: TripleRow[] = [];
  let entities = await new Pipeline(resultOrder)
    .map(async ({ id }) => {
      const entityEntry = allEntities.get(id);
      const externalId = stripCollectionFromId(id);
      if (entityEntry.triples) {
        return [externalId, entityEntry];
      } else {
        return [externalId, { triples: [], entity: entityEntry }];
      }
    })
    .filter(async ([, { entity }]) =>
      doesEntityObjMatchWhere(entity, where, schema)
    )
    .map(async ([id, { triples, entity }]) => {
      resultTriples.push(...triples);
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
      results: new Map(entities),
      triples: filterToLatestEntityAttribute(resultTriples),
    };
  }

  return new Map(
    entities.map(([id, entity]) => [
      id,
      deserializeDatesInEntity(timestampedObjectToPlainObject(entity), schema),
    ])
  ) as FetchResult<Q>;
}

function deserializeDatesInEntity(entity: any, schema?: Model<any>) {
  if (!schema) return entity;
  return Object.entries(entity).reduce((acc, [key, value]) => {
    const dataType = schema?.properties?.[key]?.['x-serialized-type'];
    if (dataType === 'date') {
      // we have a timestamped entity
      if (value instanceof Array && value.length === 2) {
        acc[key] = [
          typeof value[0] === 'string'
            ? new Date(value[0] as string)
            : value[0],
          value[1],
        ];
      } else if (typeof value === 'string') {
        acc[key] = new Date(value as string);
      } else acc[key] = value;
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as any);
}

export function doesEntityObjMatchWhere<Q extends CollectionQuery<any>>(
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
        if (dataType && dataType['x-crdt-type'] === 'Set') {
          return satisfiesSetFilter(entity, path, op, filterValue);
        }
        // Use register as default
        return satisfiesRegisterFilter(entity, path, op, filterValue);
      });
    })
  );
}

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
  return Object.entries(value)
    .filter(([_v, [inSet, _ts]]) => inSet)
    .some(([v]) => isOperatorSatisfied(op, v, filterValue));
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
    default:
      throw new InvalidFilterError(`The operator ${op} is not recognized.`);
  }
}

async function getCollectionEntitiesAndTriples(
  tx: TripleStoreTransaction | TripleStore,
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

type CollectionQuerySchema<Q extends CollectionQuery<any>> =
  Q extends CollectionQuery<infer M> ? M : never;

function subscribeSingleEntity<Q extends CollectionQuery<any>>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (args: [results: FetchResult<Q>, newTriples: TripleRow[]]) => void,
  onError?: (error: any) => void,
  schema?: CollectionQuerySchema<Q>
) {
  const asyncUnSub = async () => {
    const { collectionName, entityId } = query;
    let entity: any;
    let triples: TripleRow[] = [];
    try {
      if (!entityId) throw new EntityIdMissingError();
      const storeId = appendCollectionToId(collectionName, entityId);
      const fetchResult = await fetch(tripleStore, query, {
        includeTriples: true,
        schema,
      });
      entity = fetchResult.results.has(entityId)
        ? fetchResult.results.get(entityId)
        : null;
      triples = fetchResult.triples;
      const results = new Map(
        entity ? [[entityId, timestampedObjectToPlainObject(entity)]] : []
      ) as FetchResult<Q>;

      onResults([results, triples]);
      const unsub = tripleStore.onWrite(async ({ inserts, deletes }) => {
        try {
          const entityInserts = inserts.filter(({ id }) => id === storeId);
          const entityDeletes = deletes.filter(({ id }) => id === storeId);
          const changed = entityInserts.length > 0 || entityDeletes.length > 0;

          // Early return prevents processing if no relevant entities were updated
          if (!changed) return;

          // if we have deletes, need to re-fetch the entity
          if (entityDeletes.length) {
            const fetchResult = await fetch(tripleStore, query, {
              includeTriples: true,
              schema,
            });
            entity = fetchResult.results.has(entityId)
              ? fetchResult.results.get(entityId)
              : null;
            triples = fetchResult.triples;
          } else {
            entity = entityInserts.reduce(entityToResultReducer, entity);
            triples = filterToLatestEntityAttribute(
              triples.concat(entityInserts)
            );
          }

          if (
            entity &&
            doesEntityObjMatchWhere(entity, query.where ?? [], schema)
          ) {
            results.set(entityId, timestampedObjectToPlainObject(entity));
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

function subscribeResultsAndTriples<Q extends CollectionQuery<any>>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (args: [results: FetchResult<Q>, newTriples: TripleRow[]]) => void,
  onError?: (error: any) => void,
  schema?: Model<any>
) {
  const order = query.order;
  const limit = query.limit;
  const asyncUnSub = async () => {
    let results: FetchResult<Q> = new Map() as FetchResult<Q>;
    let triples: TripleRow[] = [];
    try {
      const fetchResult = await fetch(tripleStore, query, {
        includeTriples: true,
        schema,
      });
      results = fetchResult.results;
      triples = fetchResult.triples;
      onResults([
        new Map(
          [...results].map(([id, entity]) => [
            id,
            timestampedObjectToPlainObject(entity),
          ])
        ) as FetchResult<Q>,
        triples,
      ]);
      const unsub = tripleStore.onWrite(async ({ inserts, deletes }) => {
        try {
          let nextResult = new Map(results);
          const matchedTriples = [];
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
            const entityObj = entityTriples.reduce(
              entityToResultReducer,
              schema ? initialize(schema) : {}
            );
            const isInCollection =
              entityObj['_collection'] &&
              entityObj['_collection'][0] === query.collectionName;
            const isInResult =
              isInCollection &&
              doesEntityObjMatchWhere(entityObj, query.where ?? [], schema);

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
              matchedTriples.push(...entityTriples);
            } else {
              if (nextResult.has(entity)) {
                nextResult.delete(entity);
                matchedTriples.push(...entityTriples);
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
              const backFilledResults = await fetch(
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
                timestampedObjectToPlainObject(entity),
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

export function subscribe<Q extends CollectionQuery<any>>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (results: FetchResult<Q>) => void,
  onError?: (error: any) => void,
  schema?: CollectionQuerySchema<Q>
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

export function subscribeTriples<Q extends CollectionQuery<any>>(
  tripleStore: TripleStore,
  query: Q,
  onResults: (results: TripleRow[]) => void,
  onError?: (error: any) => void,
  schema?: CollectionQuerySchema<Q>
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
