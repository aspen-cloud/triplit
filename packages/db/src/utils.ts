import { UnserializableValueError } from './errors.js';
import { Attribute, EAV, Value } from './triple-store.js';
import { TuplePrefix } from './utility-types.js';

function setToJSON(val: Set<string>) {
  // NOTE: Previously this returned an object from entries, but that loses some information as all keys are converted to strings
  // This caused query issues down the line when queries expecting numbers were searching over strings and failing

  return new Map(Array.from(val).map((item) => [toSerializable(item), true]));
}

export function serializedItemToTuples(
  object: any,
  prefix: Attribute = []
): [Attribute, Value][] {
  if (object == null || typeof object !== 'object') {
    return [[prefix, object as Value]];
  }
  // Although we dont strictly support arrays, we have them in schema rules
  // Currently need a way to serialize them...so we need to handle arrays
  if (Array.isArray(object)) {
    return object.flatMap((val, i) =>
      serializedItemToTuples(val, [...prefix, i])
    );
  }
  return Object.keys(object).flatMap((key) =>
    serializedItemToTuples(object[key], [...prefix, key])
  );
}

// TODO: add tests for Document.insert (notably for insert Set<number> or a non-string Set)
export function objectToTuples(
  object: any,
  prefix: (string | number)[] = []
): [...(string | number)[], number | string | null][] {
  if (object == null || typeof object !== 'object') {
    return [[...prefix, object as string | number | null]];
  }
  if (object instanceof Date)
    return [[...prefix, object.toISOString() as string]];

  // Maybe we support Maps in the future, for now this is secretly a helper for Sets
  if (object instanceof Map) {
    return [...object.entries()].flatMap(([key, val]) =>
      objectToTuples(val, [...prefix, key])
    );
  }
  if (object instanceof Set) {
    const normalizedObj = setToJSON(object);
    // TEMPORARILY USE THIS TO RESOLVE ISSUE WITH EMPTY SETS
    // Will unify implementations with refactor
    if (normalizedObj.size === 0)
      return objectToTuples(new Map([['_', false]]), prefix);
    return objectToTuples(normalizedObj, prefix);
  }
  if (object instanceof Array) {
    return object.flatMap((val, i) => objectToTuples(val, [...prefix, i]));
  }
  return Object.keys(object).flatMap((key) =>
    objectToTuples(object[key], [...prefix, key])
  );
}

// TODO: go deeper on proper inserts
function toSerializable(val: any) {
  if (val == null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) return val.toISOString();
  throw new UnserializableValueError(val);
}

export function triplesToObject<T>(triples: TuplePrefix<EAV>[]) {
  const result: any = {};
  for (const [e, a, v] of triples) {
    if (!result[e]) result[e] = {};
    a.reduce((acc, curr, i) => {
      if (i === a.length - 1) {
        acc[curr] = v;
        return acc;
      }
      if (!acc[curr]) acc[curr] = typeof a[i + 1] === 'number' ? [] : {};
      return acc[curr];
    }, result[e]);
  }
  return result as T;
}
