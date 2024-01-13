import { ValuePointer } from '@sinclair/typebox/value';
import { Model, Models, SelectModelFromModel } from './schema.js';
import { QueryClauseFormattingError } from './errors.js';
import { timestampCompare } from './timestamp.js';
import { CollectionNameFromModels, ModelFromModels } from './db.js';
import { ExtractOperators } from './data-types/type.js';
import { RecordType } from './data-types/record.js';
import { QueryType } from './data-types/query.js';
import { EntityId, TripleRow } from './triple-store-utils.js';

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
  K extends M extends Model<any> ? RecordPaths<M> : Path = M extends Model<any>
    ? RecordPaths<M>
    : Path
> = [
  K,
  M extends Model<any> ? ExtractOperators<ExtractTypeAtPath<M, K>> : string,
  Value // TODO: We could make this tighter by inspecting the type
];

type RecordPaths<R extends RecordType<any>> = R extends RecordType<any>
  ? {
      [K in keyof R['properties']]: R['properties'][K] extends RecordType<any>
        ?
            | `${string & K}`
            | `${string & K}.${RecordPaths<
                // @ts-ignore
                R['properties'][K]
              >}`
        : `${string & K}`;
    }[keyof R['properties']]
  : never;

type ExtractTypeAtPath<
  M extends RecordType<any>,
  P extends any // should be a dot notation path
> = P extends `${infer K}.${infer Rest}` // if path is nested
  ? K extends keyof M['properties'] // if key is a valid key
    ? M['properties'][K] extends RecordType<any> // if value at key is a record type
      ? ExtractTypeAtPath<
          // @ts-ignore
          M['properties'][K],
          Rest
        > // recurse
      : never // if value at key is not a record type
    : never // if key is not a valid key
  : P extends keyof M['properties'] // if path is not nested
  ? M['properties'][P] // return value at path
  : never; // if path is not valid

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
  property: M extends Model<any> ? RecordPaths<SelectModelFromModel<M>> : Path,
  direction: 'ASC' | 'DESC'
];

type RelationAttributes<M extends Model<any>> = {
  [K in keyof M['properties']]: M['properties'][K] extends QueryType<any, any>
    ? K
    : never;
}[keyof M['properties']];

export type RelationSubquery<M extends Models<any, any> | undefined> = {
  attributeName: string;
  subquery: CollectionQuery<M, any>;
  cardinality: 'one' | 'many';
};

export type CollectionQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  where?: QueryWhere<ModelFromModels<M, CN>>;
  select?: (
    | (M extends Models<any, any>
        ? RecordPaths<SelectModelFromModel<ModelFromModels<M, CN>>>
        : Path)
    | RelationSubquery<M>
  )[];
  // | [string, CollectionQuery<M, any>]
  order?: QueryOrder<ModelFromModels<M, CN>>[];
  limit?: number;
  after?: ValueCursor;
  entityId?: string;
  vars?: Record<string, any>;
  collectionName: CN;
  include?: Partial<
    Record<
      M extends Models<any, any>
        ? RelationAttributes<ModelFromModels<M, CN>>
        : string,
      Query<M, any> | null
    >
  >;
};

export type Query<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Omit<CollectionQuery<M, CN>, 'collectionName'>;

export class Entity {
  data: Record<string, any> = {};
  triples: Record<string, TripleRow> = {};
  tripleHistory: Record<string, TripleRow[]> = {};

  constructor(init?: { data?: Record<string, any>; triples: TripleRow[] }) {
    if (init) {
      this.data = init.data ?? {};
      this.triples = init.triples.reduce((acc, triple) => {
        acc['/' + triple.attribute.join('/')] = triple;
        return acc;
      }, {} as Record<string, TripleRow>);
    }
  }

  applyTriple(triple: TripleRow): boolean {
    const {
      attribute,
      value: rawValue,
      timestamp,
      expired: isExpired,
    } = triple;

    // Set tombstones as undefined, so we can continue to reduce and check timestamp
    const value = isExpired ? undefined : rawValue;
    if (attribute[0] === '_collection') {
      const pointer = '/_collection';
      ValuePointer.Set(this.data, pointer, [value, timestamp]);
      this.triples[pointer] = triple;
      this.tripleHistory[pointer]
        ? this.tripleHistory[pointer].push(triple)
        : (this.tripleHistory[pointer] = [triple]);
      return true;
    }

    const [_collectionName, ...path] = attribute;
    const pointer = '/' + path.join('/');

    this.tripleHistory[pointer]
      ? this.tripleHistory[pointer].push(triple)
      : (this.tripleHistory[pointer] = [triple]);

    // TODO: implement this
    // Ensure that any number paths are converted to arrays in the entity
    // THIS IS USED FOR RULES
    for (let i = 0; i < path.length; i++) {
      const part = path[i];
      if (typeof part === 'number') {
        const pointerToParent = '/' + path.slice(0, i).join('/');
        const existingParent = ValuePointer.Get(this.data, pointerToParent);
        if (!existingParent) {
          // console.log('creating array at', pointerToParent, entity);
          ValuePointer.Set(this.data, pointerToParent, []);
        }
      }
    }

    const currentValue = ValuePointer.Get(this.data, pointer);
    if (currentValue && timestampCompare(timestamp, currentValue[1]) < 0) {
      return false;
    }

    // If we get an object marker, assign an empty object to the pointer if it doesn't exist
    if (value === '{}') {
      // if (currentValue == undefined || currentValue[0] == undefined)
      ValuePointer.Set(this.data, pointer, {});
      this.triples[pointer] = triple;
      return true;
    }

    ValuePointer.Set(this.data, pointer, [value, timestamp]);
    this.triples[pointer] = triple;
    return true;
  }
}

export function updateEntity(entity: Entity, triples: TripleRow[]) {
  return triples.reduce((hasChanges, triple) => {
    return entity.applyTriple(triple) || hasChanges;
  }, false);
}

export function triplesToEntities(
  triples: TripleRow[],
  maxTimestamps?: Map<string, number>
) {
  return triples.reduce((acc, triple) => {
    const { id, timestamp } = triple;
    // Limits triple application to a point in time
    if (maxTimestamps) {
      const [_clock, client] = timestamp;
      // if timestamp is greater, return early and dont apply triple
      if (!maxTimestamps.has(client)) return acc;
      const stateVectorEntry = maxTimestamps.get(client)!;
      if (
        stateVectorEntry &&
        timestampCompare(timestamp, [stateVectorEntry, client]) > 0
      ) {
        return acc;
      }
    }
    const entityObj = acc.get(id) ?? new Entity();
    entityObj.applyTriple(triple);
    acc.set(id, entityObj);
    return acc;
  }, new Map<string, Entity>());
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

export type QUERY_INPUT_TRANSFORMERS<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = ReturnType<typeof QUERY_INPUT_TRANSFORMERS<M, CN>>;

// TODO: add functional type guards for conditionals
export const QUERY_INPUT_TRANSFORMERS = <
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>() => ({
  where: (
    _q: Query<M, CN>,
    ...args: FilterInput<ModelFromModels<M, CN>>
  ): QueryWhere<ModelFromModels<M, CN>> => {
    if (typeof args[0] === 'string') {
      /**
       * E.g. where("id", "=", "123")
       */
      return [args as FilterStatement<ModelFromModels<M, CN>>];
    } else if (
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((filter) => typeof filter === 'object')
    ) {
      /**
       *  E.g. where([["id", "=", "123"], ["name", "=", "foo"]])
       */
      return args[0] as QueryWhere<ModelFromModels<M, CN>>;
    } else if (args.every((arg) => typeof arg === 'object')) {
      /**
       * E.g. where(["id", "=", "123"], ["name", "=", "foo"]);
       */
      return args as QueryWhere<ModelFromModels<M, CN>>;
    } else {
      throw new QueryClauseFormattingError('where', args);
    }
  },
  order: (
    _q: Query<M, CN>,
    ...args: OrderInput<ModelFromModels<M, CN>>
  ): QueryOrder<ModelFromModels<M, CN>>[] | undefined => {
    if (!args[0]) return undefined;
    /**
     * E.g. order("id", "ASC")
     */
    if (
      args.length === 2 &&
      (args as any[]).every((arg) => typeof arg === 'string')
    ) {
      return [[...args] as QueryOrder<ModelFromModels<M, CN>>];
    }
    /**
     * E.g. order(["id", "ASC"], ["name", "DESC"])
     */
    if (args.every((arg) => arg instanceof Array)) {
      return args as NonNullable<Query<M, CN>['order']>;
    }
    /**
     * E.g. order([["id", "ASC"], ["name", "DESC"]])
     */
    if (
      args.length === 1 &&
      args[0] instanceof Array &&
      args[0].every((arg) => arg instanceof Array)
    ) {
      return args[0] as NonNullable<Query<M, CN>['order']>;
    }

    throw new QueryClauseFormattingError('order', args);
  },
  include<
    RName extends M extends Models<any, any>
      ? RelationAttributes<ModelFromModels<M, CN>>
      : never
  >(
    q: Query<M, CN>,
    relationName: RName,
    query?: Query<M, RName>
  ): Record<string, any> {
    return {
      ...q.include,
      // Set to null so the inclusion of the key can be serialized
      [relationName]: query ?? null,
    };
  },
});

export type QueryBuilderInputs<M extends Model<any> | undefined> = {
  where: FilterInput<M>;
  order: OrderInput<M>;
};
