import { Model, TypeFromModel, updateEntityAtPath } from './schema';
import { EntityId, TripleRow } from './triple-store';

type Path = string;
type Value = number | string | null;
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
  order?: [
    property: M extends Model<any> ? keyof M['properties'] : Path,
    direction: 'ASC' | 'DESC'
  ][];
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

export const QUERY_INPUT_TRANSFORMERS = <
  Q extends Query<any>,
  M extends Q extends Query<infer Model> ? Model : any
>() => ({
  where: (
    ...args: FilterStatement<M> | WhereFilter<M>[] | [QueryWhere<M>]
  ): QueryWhere<M> => {
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
  order: (
    ...args:
      | NonNullable<Query<M>['order']>
      | QueryOrder<M>[]
      | [NonNullable<Query<M>['order']>]
  ): Query<M>['order'] => {
    /**
     * E.g. order("id", "ASC")
     */
    if (args.length === 2 && args.every((arg) => typeof arg === 'string')) {
      return [args];
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
  where:
    | FilterStatement<M, string | Date | number | null>
    | WhereFilter<M>[]
    | [QueryWhere<M>];
  order: NonNullable<Query<M>['order']> | [Query<M>['order']];
};
