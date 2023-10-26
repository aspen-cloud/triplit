import { ValuePointer } from '@sinclair/typebox/value';
import { Model, Models, ResultTypeFromModel, Timestamped } from './schema.js';
import { Attribute, EntityId, TripleRow } from './triple-store.js';
import { QueryClauseFormattingError } from './errors.js';
import { TimestampType } from './data-types/base.js';
import { timestampCompare } from './timestamp.js';
import { CollectionQuery } from './collection-query.js';
import { CollectionNameFromModels } from './db.js';
import { ExtractOperators } from './data-types/type.js';

type Path = string;
// Should be friendly types that we pass into queries
// Not to be confused with the Value type that we store in the triple store
type Value =
  | number
  | string
  | boolean
  | Date
  | null
  | number[]
  | boolean[]
  | string[];

export type FilterStatement<
  M extends Model<any> | undefined,
  K extends M extends Model<any>
    ? keyof M['properties']
    : Path = M extends Model<any> ? keyof M['properties'] : Path
> = [
  K,
  M extends Model<any> ? ExtractOperators<M['properties'][K]> : string,
  Value // TODO: We could make this tighter by inspecting the type
];

export function isFilterStatement(
  filter: WhereFilter<any>
): filter is FilterStatement<any> {
  return (
    filter instanceof Array &&
    filter.length === 3 &&
    typeof filter[0] === 'string' &&
    typeof filter[1] === 'string'
  );
}

export type FilterGroup<M extends Model<any> | undefined> = {
  mod: 'or' | 'and';
  filters: WhereFilter<M>[];
};

export type SubQueryFilter<
  M extends Models<any, any> | undefined = any,
  CN extends CollectionNameFromModels<M> = any
> = {
  exists: CollectionQuery<M, CN>;
};

export type WhereFilter<M extends Model<any> | undefined> =
  | FilterStatement<M>
  | FilterGroup<M>
  | SubQueryFilter;

export type QueryWhere<M extends Model<any> | undefined> = WhereFilter<M>[];

export type ValueCursor = [value: Value, entityId: EntityId];

export type QueryOrder<M extends Model<any> | undefined> = [
  property: M extends Model<any> ? keyof ResultTypeFromModel<M> : Path,
  direction: 'ASC' | 'DESC'
];

export interface Query<M extends Model<any> | undefined> {
  where: QueryWhere<M>;
  select: (M extends Model<any> ? keyof ResultTypeFromModel<M> : Path)[];
  order?: QueryOrder<M>[];
  limit?: number;
  after?: ValueCursor;
  entityId?: string;
  vars?: Record<string, any>;
}

export function entityToResultReducer<T extends Timestamped<object>>(
  entity: T,
  triple: TripleRow
) {
  const { attribute, value: rawValue, timestamp, expired: isExpired } = triple;

  // Set tombstones as undefined, so we can continue to reduce and check timestamp
  const value = isExpired ? undefined : rawValue;

  if (attribute[0] === '_collection')
    return {
      ...entity,
      _collection: [value, timestamp],
    };
  const [_collectionName, ...path] = attribute;

  // Ensure that any number paths are converted to arrays in the entity
  // THIS IS USED FOR RULES
  for (let i = 0; i < path.length; i++) {
    const part = path[i];
    if (typeof part === 'number') {
      const pointerToParent = '/' + path.slice(0, i).join('/');
      const existingParent = ValuePointer.Get(entity, pointerToParent);
      if (!existingParent) {
        // console.log('creating array at', pointerToParent, entity);
        ValuePointer.Set(entity, pointerToParent, []);
      }
    }
  }
  updateEntityAtPath(entity, path, value, timestamp);
  return entity;
}

function updateEntityAtPath(
  entity: any,
  path: Attribute,
  value: any,
  timestamp: TimestampType
) {
  const pointer = '/' + path.join('/');
  const currentValue = ValuePointer.Get(entity, pointer);
  if (currentValue && timestampCompare(timestamp, currentValue[1]) < 0) {
    return;
  }

  // If we get an object marker, assign an empty object to the pointer if it doesn't exist
  if (value === '{}') {
    if (currentValue == undefined) ValuePointer.Set(entity, pointer, {});
    return;
  }

  ValuePointer.Set(entity, pointer, [value, timestamp]);
}

export function triplesToEntities(
  triples: TripleRow[]
  // TODO: should be timestamped type from a model...figure out how / when to do this
  // Want a proper way to say "this is what i expect the shape of the result to be" with a generic
): Map<string, any> {
  return triples.reduce((acc, triple) => {
    const { id } = triple;
    const entityObj = acc.get(id) ?? {};
    acc.set(id, entityToResultReducer(entityObj, triple));
    return acc;
  }, new Map());
}

export function constructEntity(triples: TripleRow[], id: string) {
  const entities = triplesToEntities(triples);
  return entities.get(id);
}

// This is deprecated
export function queryResultToJson(
  results: Map<string, Record<string, Set<any>>>
) {
  const entries = Array.from(results.entries());
  const jsonifiedEntries = entries.map(([id, vals]) => [
    id,
    setRecordToArrayRecord(vals),
  ]);
  return Object.fromEntries(jsonifiedEntries);
}

function setRecordToArrayRecord(
  record: Record<string, Set<any>>
): Record<string, any[]> {
  return Object.fromEntries(
    Object.entries(record).map(([id, set]) => [id, Array.from(set)])
  );
}

export function or<M extends Model<any> | undefined>(where: QueryWhere<M>) {
  return { mod: 'or' as const, filters: where };
}

export function and<M extends Model<any> | undefined>(where: QueryWhere<M>) {
  return { mod: 'and' as const, filters: where };
}

type FilterInput<M extends Model<any> | undefined> =
  | FilterStatement<M>
  | WhereFilter<M>[]
  | [QueryWhere<M>];

type OrderInput<M extends Model<any> | undefined> =
  | QueryOrder<M>
  | QueryOrder<M>[]
  | [QueryOrder<M>[]];

export type QUERY_INPUT_TRANSFORMERS<M extends Model<any> | undefined> =
  ReturnType<typeof QUERY_INPUT_TRANSFORMERS<M>>;

// TODO: add functional type guards for conditionals
export const QUERY_INPUT_TRANSFORMERS = <
  M extends Model<any> | undefined
>() => ({
  where: (...args: FilterInput<M>): QueryWhere<M> => {
    if (typeof args[0] === 'string') {
      /**
       * E.g. where("id", "=", "123")
       */
      return [args as FilterStatement<M>];
    } else if (
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((filter) => typeof filter === 'object')
    ) {
      /**
       *  E.g. where([["id", "=", "123"], ["name", "=", "foo"]])
       */
      return args[0] as QueryWhere<M>;
    } else if (args.every((arg) => typeof arg === 'object')) {
      /**
       * E.g. where(["id", "=", "123"], ["name", "=", "foo"]);
       */
      return args as QueryWhere<M>;
    } else {
      throw new QueryClauseFormattingError('where', args);
    }
  },
  order: (...args: OrderInput<M>): QueryOrder<M>[] | undefined => {
    if (!args[0]) return undefined;
    /**
     * E.g. order("id", "ASC")
     */
    if (
      args.length === 2 &&
      (args as any[]).every((arg) => typeof arg === 'string')
    ) {
      return [[...args] as QueryOrder<M>];
    }
    /**
     * E.g. order(["id", "ASC"], ["name", "DESC"])
     */
    if (args.every((arg) => arg instanceof Array)) {
      return args as NonNullable<Query<M>['order']>;
    }
    /**
     * E.g. order([["id", "ASC"], ["name", "DESC"]])
     */
    if (
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((arg) => arg instanceof Array)
    ) {
      return args[0] as NonNullable<Query<M>['order']>;
    }

    throw new QueryClauseFormattingError('order', args);
  },
});

export type QueryBuilderInputs<M extends Model<any> | undefined> = {
  where: FilterInput<M>;
  order: OrderInput<M>;
};
