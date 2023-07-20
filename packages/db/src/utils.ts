import SetType from './data-types/set';
import { EAV } from './triple-store';
import { TuplePrefix } from './utility-types';

// TODO: add tests for Document.insert (notably for insert Set<number> or a non-string Set)
export function objectToTuples(
  object: any,
  prefix: (string | number)[] = []
): [...(string | number)[], number | string | null][] {
  if (object == null || typeof object !== 'object') {
    return [[...prefix, object as string | number | null]];
  }
  // Maybe we support Maps in the future, for now this is secretly a helper for Sets
  if (object instanceof Map) {
    return [...object.entries()].flatMap(([key, val]) =>
      objectToTuples(val, [...prefix, key])
    );
  }
  if (object instanceof Set) {
    const normalizedObj = SetType.fromJSON(object);
    return objectToTuples(normalizedObj, prefix);
  }
  if (object instanceof Array) {
    return object.flatMap((val, i) => objectToTuples(val, [...prefix, i]));
  }
  return Object.keys(object).flatMap((key) =>
    objectToTuples(object[key], [...prefix, key])
  );
}

export function pathValsToObj(pathVals: any[][]) {
  return pathVals.reduce(updateObjWithPathVal, {});
}

function updateObjWithPathVal(obj: any, pathVal: any[]) {
  const paths = pathVal.slice(0, -1);
  const value = pathVal.at(-1);
  let scope = obj;
  for (let i = 0; i < paths.length; i++) {
    const key = paths[i];
    if (i === paths.length - 1) {
      scope[key] = value;
      continue;
    }
    // if key already exists just update scope
    if (scope[key] !== undefined) {
      scope = scope[key];
      continue;
    }
    const nextKey = paths[i + 1];
    // heuristic for is an array
    if (nextKey === 0) {
      scope[key] = [];
    } else {
      scope[key] = {};
    }
    scope = scope[key];
  }
  return obj;
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
      if (!acc[curr]) acc[curr] = {};
      return acc[curr];
    }, result[e]);
  }
  return result as T;
}
