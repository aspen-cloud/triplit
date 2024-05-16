import {
  ModelPaths,
  Models,
  Path,
  RelationAttributes,
  SchemaPaths,
} from './schema/types';
import { Timestamp, timestampCompare } from './timestamp.js';
import { CollectionNameFromModels, ModelFromModels } from './db.js';
import { ExtractOperators, ExtractValueInputs } from './data-types/type.js';
import { RecordType } from './data-types/record.js';
import { EntityId, TripleRow } from './triple-store-utils.js';
import { encodeValue } from '@triplit/tuple-database';

// Should be friendly types that we pass into queries
// Not to be confused with the Value type that we store in the triple store
export type QueryValue =
  | number
  | string
  | boolean
  | Date
  | null
  | number[]
  | boolean[]
  | string[];

export type FilterStatement<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>,
  K extends M extends Models<any, any>
    ? SchemaPaths<M, CN>
    : Path = M extends Models<any, any> ? SchemaPaths<M, CN> : Path
> = [
  K,
  M extends Models<any, any>
    ? ExtractOperators<ExtractTypeAtPath<ModelFromModels<M, CN>, K>>
    : string,
  M extends Models<any, any>
    ? ExtractValueInputs<ExtractTypeAtPath<ModelFromModels<M, CN>, K>>
    : QueryValue
];

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
  filter: WhereFilter<any, any>
): filter is FilterStatement<any, any> {
  return (
    filter instanceof Array &&
    filter.length === 3 &&
    typeof filter[0] === 'string' &&
    typeof filter[1] === 'string'
  );
}

export type FilterGroup<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  mod: 'or' | 'and';
  filters: WhereFilter<M, CN>[];
};

export type SubQueryFilter<
  M extends Models<any, any> | undefined = any,
  CN extends CollectionNameFromModels<M> = any
> = {
  exists: CollectionQuery<M, CN>;
};

export type WhereFilter<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = FilterStatement<M, CN> | FilterGroup<M, CN> | SubQueryFilter;

export type QueryWhere<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = WhereFilter<M, CN>[];

export type ValueCursor = [value: QueryValue, entityId: EntityId];

export type QueryOrder<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = [
  property: M extends Models<any, any> ? SchemaPaths<M, CN> : Path,
  direction: 'ASC' | 'DESC'
];

export type QueryResultCardinality = 'one' | 'many';

export type RelationSubquery<M extends Models<any, any> | undefined> = {
  attributeName: string;
  subquery: CollectionQuery<M, any>;
  cardinality: QueryResultCardinality;
};

export type QuerySelection<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = QuerySelectionValue<M, CN>[];

export type QuerySelectionValue<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> =
  | (M extends Models<any, any> ? ModelPaths<M, CN> : Path)
  | RelationSubquery<M>;

export type CollectionQuery<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = {
  where?: QueryWhere<M, CN>;
  select?: QuerySelection<M, CN>;
  // | [string, CollectionQuery<M, any>]
  order?: QueryOrder<M, CN>[];
  limit?: number;
  after?: [ValueCursor, boolean];
  entityId?: string; // Syntactic sugar for where("id", "=", entityId), should not be relied on in query engine
  vars?: Record<string, any>;
  collectionName: CN;
  include?: Partial<
    Record<
      M extends Models<any, any>
        ? RelationAttributes<ModelFromModels<M, CN>>
        : string,
      CollectionQuery<M, any> | null
    >
  >;
};

export type Query<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
> = Omit<CollectionQuery<M, CN>, 'collectionName'>;

type TimestampedData =
  | [QueryValue, Timestamp]
  | [Record<string, TimestampedData>, Timestamp];
type EntityData = Record<string, TimestampedData>;

export class Entity {
  data: EntityData = {};
  triples: Record<string, TripleRow> = {};
  tripleHistory: Record<string, TripleRow[]> = {};

  constructor(init?: { data?: EntityData; triples: TripleRow[] }) {
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
    let value: any = isExpired ? undefined : rawValue;

    // Handle _collection attribute
    if (attribute[0] === '_collection') {
      const pointer = '/_collection';
      EntityPointer.Set(this.data, pointer, value, timestamp);
      this.triples[pointer] = triple;
      this.tripleHistory[pointer]
        ? this.tripleHistory[pointer].push(triple)
        : (this.tripleHistory[pointer] = [triple]);
      return true;
    }

    const [_collectionName, ...path] = attribute;
    const escapedPath = path.map((part) =>
      part.toString().replaceAll('/', '~')
    );
    const pointer = '/' + escapedPath.join('/');

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
        const existingParent = EntityPointer.Get(this.data, pointerToParent);
        if (!existingParent) {
          // console.log('creating array at', pointerToParent, entity);
          EntityPointer.Set(this.data, pointerToParent, [], timestamp);
        }
      }
    }

    // Skip if current value or a parent value has a newer timestamp
    {
      let pointer = '/';
      for (let i = 0; i < path.length; i++) {
        pointer += path[i];
        const currentValue = EntityPointer.Get(this.data, pointer);
        if (currentValue && timestampCompare(timestamp, currentValue[1]) < 0) {
          return false;
        }
        pointer += '/';
      }
    }

    // If we get an object marker, assign an empty object to the pointer if it doesn't exist
    if (value === '{}') {
      const currentValue = EntityPointer.Get(this.data, pointer);
      if (currentValue === undefined) {
        value = {};
      } else {
        // delete everything with less than to timestamp
        // TODO: should we clean up triple data?
        const cleanedData = pruneExpiredChildren(currentValue, timestamp);
        if (!cleanedData) value = {};
        else value = cleanedData[0];
      }
    }

    // Update data at pointer
    EntityPointer.Set(this.data, pointer, value, timestamp);
    this.triples[pointer] = triple;
    return true;
  }
}

// Check existing children of assignment, if has any keys GTE timestamp, keep them, otherwise delete them
export function pruneExpiredChildren(
  timestampedData: TimestampedData,
  timestamp: Timestamp
) {
  // If value has children (ie object), prune child values
  if (typeof timestampedData[0] === 'object' && timestampedData[0] !== null) {
    const [obj, ts] = timestampedData as [
      Record<string, TimestampedData>,
      Timestamp
    ];
    // Prune expired children
    for (const key in obj) {
      const value = obj[key];
      const expiryResult = pruneExpiredChildren(value, timestamp);
      if (!expiryResult) {
        delete obj[key];
      }
    }
    // If everything was expired, return undefined
    if (
      Object.keys(obj).length === 0 &&
      timestampCompare(ts, timestamp) === -1
    ) {
      return undefined;
    }
    // If there is data return timestamped data
    return [obj, ts];
  }

  // Base case: return undefined if timestamp is less than the given timestamp, otherwise return timestamped data
  if (timestampCompare(timestampedData[1], timestamp) === -1) {
    return undefined;
  }
  return timestampedData;
}

export namespace EntityPointer {
  function Escape(component: string) {
    return component.indexOf('~') === -1
      ? component
      : component.replace(/~1/g, '/').replace(/~0/g, '~');
  }
  /** Formats the given pointer into navigable key components */
  export function* Format(pointer: string): IterableIterator<string> {
    if (pointer === '') throw new Error(`Invalid pointer: "${pointer}"`);
    let [start, end] = [0, 0];
    for (let i = 0; i < pointer.length; i++) {
      const char = pointer.charAt(i);
      if (char === '/') {
        if (i === 0) {
          start = i + 1;
        } else {
          end = i;
          yield Escape(pointer.slice(start, end));
          start = i + 1;
        }
      } else {
        end = i;
      }
    }
    yield Escape(pointer.slice(start));
  }
  /** Sets the value at the given pointer. If the value at the pointer does not exist it is created */
  export function Set(
    value: any,
    pointer: string,
    update: unknown,
    timestamp: Timestamp
  ): void {
    if (pointer === '')
      throw new Error(
        `ValuePointerRootSetError - (${JSON.stringify(
          value
        )}, ${pointer}, ${JSON.stringify([update, timestamp])})`
      ); // throw new ValuePointerRootSetError(value, pointer, [update, timestamp])
    let [owner, next, key] = [null as any, value, ''];
    for (const component of Format(pointer)) {
      // This is contextual which I dont love, but if we are setting a tombstone for an already tombstoned value, just stop
      if (update === undefined && next === undefined) return;

      // If the next value is undefined, create it to continue traversing path
      if (next === undefined) {
        next = {};
        // so we dont lose the reference to the owner/parent
        owner[key][0] = next;
      }
      if (next[component] === undefined) next[component] = [{}, undefined];
      owner = next;
      next = next[component][0];
      key = component;
    }
    owner[key] = [update, timestamp];
  }
  /** Deletes a value at the given pointer */
  export function Delete(value: any, pointer: string): void {
    throw new Error('EntityPointer.Delete() is not implemented');
  }
  /** Returns true if a value exists at the given pointer */
  export function Has(value: any, pointer: string): boolean {
    throw new Error('EntityPointer.Has() is not implemented');
  }
  /** Gets the value at the given pointer */
  export function Get(value: any, pointer: string): any {
    if (pointer === '') return value;
    let current = value;
    // Root values are untimestamped
    let root = true;
    for (const component of Format(pointer)) {
      const next = root ? current[component] : current[0]?.[component];
      if (next === undefined) return undefined;
      current = next;
      root = false;
    }
    return current;
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

export function or<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(where: QueryWhere<M, CN>) {
  return { mod: 'or' as const, filters: where };
}

export function and<
  M extends Models<any, any> | undefined,
  CN extends CollectionNameFromModels<M>
>(where: QueryWhere<M, CN>) {
  return { mod: 'and' as const, filters: where };
}

export function compareCursors(
  cursor1: ValueCursor | undefined,
  cursor2: ValueCursor | undefined
) {
  if (!cursor1 && !cursor2) return 0;
  if (!cursor1) return -1;
  if (!cursor2) return 1;
  let cursor1Value = cursor1[0];
  let cursor2Value = cursor2[0];
  // hack
  if (cursor1Value instanceof Date) cursor1Value = cursor1Value.getTime();
  if (cursor2Value instanceof Date) cursor2Value = cursor2Value.getTime();
  if (cursor1Value !== cursor2Value)
    return encodeValue(cursor1Value) > encodeValue(cursor2Value) ? 1 : -1;
  if (cursor1[1] !== cursor2[1]) return cursor1[1] > cursor2[1] ? 1 : -1;
  return 0;
}
