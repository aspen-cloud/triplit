import { ValuePointer } from '@sinclair/typebox/value';
import Builder from './utils/builder';
import {
  Query,
  Operator,
  FilterStatement,
  FilterGroup,
  entityToResultReducer,
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
} from './triple-store';
import { Pipeline } from './utils/pipeline';
import { appendCollectionToId, stripCollectionFromId } from './db';
import { InvalidFilterError } from './errors';

export default function CollectionQueryBuilder<
  M extends Model<any> | undefined
>(collectionName: string, schema?: M, params?: Query<M>) {
  // TODO fixup ts so that select/where are actually optional
  return Builder<CollectionQuery<M>>({
    collectionName,
    schema,
    ...params,
    where: params?.where ?? [],
    select: params?.select ?? [],
  });
}

export type CollectionQuery<M extends Model<any> | undefined> = Query<M> & {
  collectionName: string;
  schema?: M;
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
  const order = query.order;
  const limit = query.limit;
  const where = query.where;
  const select = query.select;
  const resultOrder = await (order
    ? tx.findValuesInRange(
        [query.collectionName, ...(order[0] as string).split('.')],
        {
          direction: order[1],
          ...(query.after
            ? order[1] === 'DESC'
              ? { lessThan: query.after }
              : { greaterThan: query.after }
            : {}),
        }
      )
    : tx.findByAVE([['_collection'], query.collectionName]));

  const allEntities = await (includeTriples
    ? getCollectionEntitiesAndTriples(tx, query.collectionName)
    : tx.getEntities(query.collectionName));

  const resultTriples: TripleRow[] = [];
  const entities = await new Pipeline(resultOrder)
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
    .take(limit ?? Infinity)
    .toArray();

  const results = new Map(entities);

  if (select && select.length > 0) {
    for (const result of results) {
      const [entId, entity] = result;
      const selectedEntity = select.reduce<any>((acc, selectPath) => {
        const pathParts = (selectPath as string).split('.');
        let scope = acc;
        for (const pathPart of pathParts) {
          scope[pathPart] = entity[selectPath];
          scope = scope[pathPart];
        }
        return acc;
      }, {});
      results.set(entId, selectedEntity);
    }
  }
  if (includeTriples) {
    return {
      results,
      triples: filterToLatestEntityAttribute(resultTriples),
    };
  }
  return new Map(
    [...results].map(([id, entity]) => [
      id,
      timestampedObjectToPlainObject(entity),
    ])
  ) as FetchResult<Q>;
}

function doesEntityObjMatchWhere<Q extends CollectionQuery<any>>(
  entityObj: any,
  where: Q['where'],
  schema?: Q['schema']
) {
  const basicStatements = where.filter(
    (statement): statement is FilterStatement<Q['schema']> =>
      statement instanceof Array
  );

  const orStatements = where.filter(
    (statement): statement is FilterGroup<Q['schema']> =>
      'mod' in statement && statement.mod === 'or'
  );

  const andStatements = where.filter(
    (statement): statement is FilterGroup<Q['schema']> =>
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
function entitySatisfiesAllFilters<Q extends CollectionQuery<any>>(
  entity: any,
  filters: FilterStatement<Q['schema']>[],
  schema?: Q['schema']
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
        if (dataType && dataType['x-crdt-type'] === 'Set') {
          const pointer = '/' + path.replace('.', '/');
          const value: Record<string, [boolean, Timestamp]> = ValuePointer.Get(
            entity,
            pointer
          );
          return Object.entries(value)
            .filter(([_v, [inSet, _ts]]) => inSet)
            .some(([v]) => isOperatorSatisfied(op, v, filterValue));
        }
        const maybeValue = path
          .split('.')
          .reduce((acc, curr) => acc && acc[curr], entity);
        if (!maybeValue) console.warn(`${path} not found in ${entity}`);
        if (
          maybeValue &&
          (!(maybeValue instanceof Array) || maybeValue.length > 2)
        ) {
          throw new InvalidFilterError(
            [path, op, filterValue],
            `Received an unexpected value (${maybeValue}) for path ${path} in entity ${entity} interpreted as ${dataType}. This is likely caused by a missing or incorrect schema, or because a filter path was provided that does not lead to a leaf attribute in the entity`
          );
        }
        const [value, _ts] = maybeValue ?? [undefined, undefined];
        return isOperatorSatisfied(op, value, filterValue);
      });
    })
  );
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

function subscribeResultsAndTriples<Q extends CollectionQuery<any>>(
  tripleStore: TripleStore,
  query: Q,
  subscriptionCallback: (
    args: [results: FetchResult<Q>, newTriples: TripleRow[]]
  ) => void,
  schema?: Q['schema']
) {
  const order = query.order;
  const limit = query.limit;
  const asyncUnSub = async () => {
    let { results, triples } = await fetch(tripleStore, query, {
      includeTriples: true,
      schema,
    });
    subscriptionCallback([
      new Map(
        [...results].map(([id, entity]) => [
          id,
          timestampedObjectToPlainObject(entity),
        ])
      ) as FetchResult<Q>,
      triples,
    ]);

    const unsub = tripleStore.onWrite(async ({ inserts, deletes }) => {
      let nextResult = new Map(results);
      const matchedTriples = [];
      const updatedEntities = new Set<string>(
        [...inserts, ...deletes].map(({ id }) => stripCollectionFromId(id))
      );
      for (const entity of updatedEntities) {
        const entityTriples = filterToLatestEntityAttribute(
          await tripleStore.findByEntity(
            appendCollectionToId(query.collectionName, entity)
          )
        );
        const entityObj = entityTriples.reduce(
          entityToResultReducer,
          query.schema ? initialize(query.schema) : {}
        );
        const isInCollection =
          entityObj['_collection'] &&
          entityObj['_collection'][0] === query.collectionName;
        const isInResult =
          isInCollection &&
          doesEntityObjMatchWhere(entityObj, query.where ?? [], schema);

        let satisfiesOrder = true;

        if (order) {
          const allValues = [...nextResult.values()];
          const valueRange = [
            allValues.at(0)[order[0]][0],
            allValues.at(-1)[order[0]][0],
          ];
          const entityValue = entityObj[order[0]][0];
          satisfiesOrder =
            order[1] === 'ASC'
              ? entityValue <= valueRange[1]
              : entityValue >= valueRange[0];
        }

        if (isInResult && satisfiesOrder) {
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

        if (limit && entries.length < limit) {
          const lastResultEntry = entries[entries.length - 1];
          const backFillQUery = {
            ...query,
            limit: limit - entries.length,
            after: [
              lastResultEntry[1][order![0]][0],
              appendCollectionToId(query.collectionName, lastResultEntry[0]),
            ],
          };
          const backFilledResults = await fetch(tripleStore, backFillQUery, {
            schema,
            includeTriples: true,
          });
          entries.push(...backFilledResults.results);
        }

        if (order) {
          const [prop, dir] = order;
          entries.sort(([_aId, a], [_bId, b]) => {
            // TODO support multi-level props probably using TypeBox json pointer
            const direction =
              a[prop][0] < b[prop][0] ? -1 : a[prop][0] == b[prop][0] ? 0 : 1;

            return dir === 'ASC' ? direction : direction * -1;
          });
        }

        nextResult = new Map(entries.slice(0, limit));
      }
      results = nextResult as FetchResult<Q>;
      // console.timeEnd('query recalculation');
      subscriptionCallback([
        new Map(
          [...results].map(([id, entity]) => [
            id,
            timestampedObjectToPlainObject(entity),
          ])
        ) as FetchResult<Q>,
        matchedTriples,
      ]);
    });
    return unsub;
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
  subscriptionCallback: (results: FetchResult<Q>) => void,
  schema?: Q['schema']
) {
  return subscribeResultsAndTriples(
    tripleStore,
    query,
    ([results]) => {
      subscriptionCallback(results);
    },
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
  subscriptionCallback: (results: TripleRow[]) => void,
  schema?: Q['schema']
) {
  return subscribeResultsAndTriples(
    tripleStore,
    query,
    ([_results, triples]) => {
      subscriptionCallback(triples);
    },
    schema
  );
}
