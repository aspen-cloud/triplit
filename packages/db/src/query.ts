import { ValuePointer } from '@sinclair/typebox/value';
import { Model, TimestampedTypeFromModel, updateEntityAtPath } from './schema';
import { EntityId, TripleRow } from './triple-store';

type Path = string;
// Should be friendly types that we pass into queries
// Not to be confused with the Value type that we store in the triple store
type Value = number | string | boolean | Date | null;

export type FilterStatement<
  M extends Model | undefined,
  K extends M extends Model ? keyof M : Path = M extends Model ? keyof M : Path
> = [
  K,
  M extends Model ? M[K]['supportedOperations'][number] : string,
  Value // TODO: We could make this tighter by inspecting the type
];
export type FilterGroup<M extends Model | undefined> = {
  mod: 'or' | 'and';
  filters: WhereFilter<M>[];
};

export type SubQuery = {
  exists: Query<any>;
};

export type WhereFilter<M extends Model | undefined> =
  | FilterStatement<M>
  | FilterGroup<M>
  | SubQuery;

export type QueryWhere<M extends Model | undefined> = WhereFilter<M>[];

export type ValueCursor = [value: Value, entityId: EntityId];

export type QueryOrder<M extends Model | undefined> = [
  property: M extends Model ? keyof M : Path,
  direction: 'ASC' | 'DESC'
];

export interface Query<M extends Model | undefined> {
  where: QueryWhere<M>;
  select: (M extends Model ? keyof M : Path)[];
  order?: QueryOrder<M>[];
  limit?: number;
  after?: ValueCursor;
  entityId?: string;
  vars?: Record<string, any>;
}

export function entityToResultReducer<M extends Model>(
  entity: TimestampedTypeFromModel<M>,
  triple: TripleRow
) {
  // TODO support tombstones and timestamps
  const { attribute, value, timestamp, expired: isExpired } = triple;
  if (isExpired) return entity;
  if (attribute[0] === '_collection')
    return { ...entity, _collection: [value, timestamp] };
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

export function constructEntities(
  triples: TripleRow[]
): Map<string, TimestampedTypeFromModel<Model>> {
  return triples.reduce((acc, triple) => {
    const { id } = triple;
    const entityObj = acc.get(id) ?? {};
    acc.set(id, entityToResultReducer(entityObj, triple));
    return acc;
  }, new Map());
}

export function constructEntity(triples: TripleRow[], id: string) {
  const entities = constructEntities(triples);
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

export function or<M extends Model | undefined>(where: QueryWhere<M>) {
  return { mod: 'or' as const, filters: where };
}

export function and<M extends Model | undefined>(where: QueryWhere<M>) {
  return { mod: 'and' as const, filters: where };
}

type FilterInput<M extends Model | undefined> =
  | FilterStatement<M>
  | WhereFilter<M>[]
  | [QueryWhere<M>];

type OrderInput<M extends Model | undefined> =
  | QueryOrder<M>
  | QueryOrder<M>[]
  | [QueryOrder<M>[]];

// TODO: add functional type guards for conditionals
export const QUERY_INPUT_TRANSFORMERS = <
  Q extends Query<any>,
  M extends Q extends Query<infer Model> ? Model : any
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
      throw new Error('Where clause of query is not formatted correctly');
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

    throw new Error('Order clause of query is not formatted correctly');
  },
});

export type QueryBuilderInputs<M extends Model | undefined> = {
  where: FilterInput<M>;
  order: OrderInput<M>;
};
