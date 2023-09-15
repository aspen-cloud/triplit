import { ValuePointer } from '@sinclair/typebox/value';
import { Model, TypeFromModel, updateEntityAtPath } from './schema';
import { EntityId, TripleRow } from './triple-store';

type Path = string;
// Should be friendly types that we pass into queries
// Not to be confused with the Value type that we store in the triple store
type Value = number | string | boolean | Date | null;
export type Operator = '=' | '<' | '>' | '<=' | '>=' | '!=' | 'like' | 'nlike';

export type FilterStatement<M extends Model<any> | undefined, V = Value> = [
  M extends Model<any> ? keyof M['properties'] : Path,
  Operator,
  V
];
export type FilterGroup<M extends Model<any> | undefined> = {
  mod: 'or' | 'and';
  filters: WhereFilter<M>[];
};

export type WhereFilter<M extends Model<any> | undefined> =
  | FilterStatement<M>
  | FilterGroup<M>;

export type QueryWhere<M extends Model<any> | undefined> = WhereFilter<M>[];

export type ValueCursor = [value: Value, entityId: EntityId];

export type QueryOrder<M extends Model<any> | undefined> = [
  property: M extends Model<any> ? keyof M['properties'] : Path,
  direction: 'ASC' | 'DESC'
];

export interface Query<M extends Model<any> | undefined> {
  where: QueryWhere<M>;
  select: (M extends Model<any> ? keyof M['properties'] : Path)[];
  order?: QueryOrder<M>[];
  limit?: number;
  after?: ValueCursor;
  entityId?: string;
  vars?: Record<string, any>;
}

export function entityToResultReducer<M extends Model<any>>(
  entity: TypeFromModel<M>,
  triple: TripleRow
) {
  // TODO support tombestones and timestamps
  const { attribute, value, timestamp, expired: isExpired } = triple;
  if (isExpired) return entity;
  if (attribute[0] === '_collection')
    return { ...entity, _collection: [value, timestamp] };
  const [_collectionName, ...path] = attribute;

  // Ensure that any number paths are converted to arrays in the entity
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

  // const leaf = path.at(-1);
  // const maybeNum = Number(leaf);
  // if (isNaN(maybeNum)) {
  //   updateEntityAtPath(entity, path, value, timestamp);
  // } else {
  //   console.log('num path', entity, path, maybeNum);
  //   // check if the path is an array
  //   const pointerToParent = '/' + path.slice(0, -1).join('/');
  //   const existingParent = ValuePointer.Get(entity, pointerToParent);
  //   if (!existingParent) {
  //     ValuePointer.Set(entity, pointerToParent, []);
  //   }
  //   updateEntityAtPath(entity, path, maybeNum, timestamp);
  // }
  // console.log('updating', path, value, JSON.stringify(entity, null, 2));
  updateEntityAtPath(entity, path, value, timestamp);
  return entity;
}

export function constructEntities(triples: TripleRow[]) {
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

export type QueryBuilderInputs<M extends Model<any> | undefined> = {
  where: FilterInput<M>;
  order: OrderInput<M>;
};
