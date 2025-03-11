// This codec is should create a component-wise lexicographically sortable array.

// @ts-expect-error
import * as elen from 'elen';

export const MIN = null;
export const MAX = true;

export type Value = string | number | boolean | null | Array<Value> | object;

export type Tuple = Value[];

export type EncodingOptions = {
  delimiter?: string;
  escape?: string;
  disallow?: string[];
};

// TODO: make TriplitError
class UnreachableError extends Error {
  constructor(obj: never, message?: string) {
    super((message + ': ' || 'Unreachable: ') + obj);
  }
}

function isPlainObject(value: any): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

type Compare<T> = (a: T, b: T) => number;

function compare<K extends string | number | boolean>(a: K, b: K): number {
  if (a > b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  return 0;
}

// null < object < array < number < string < boolean
export const encodingByte = {
  null: 'b',
  object: 'c',
  array: 'd',
  number: 'e',
  string: 'f',
  boolean: 'g',
} as const;

export type EncodingType = keyof typeof encodingByte;

export const encodingRank = new Map<EncodingType, number>(
  Object.entries(encodingByte)
    .sort((a, b) => {
      return a[1] < b[1] ? -1 : 1;
    })
    .map(([key], i) => [key as EncodingType, i])
);

export function encodeValue(value: Value, options?: EncodingOptions): string {
  if (value === null) {
    return encodingByte.null;
  }
  if (value === true || value === false) {
    return encodingByte.boolean + value;
  }
  if (typeof value === 'string') {
    for (const disallowed of options?.disallow ?? []) {
      if (value.includes(disallowed)) {
        throw new Error(`Disallowed character found: ${disallowed}.`);
      }
    }
    return encodingByte.string + value;
  }
  if (typeof value === 'number') {
    return encodingByte.number + elen.encode(value);
  }
  if (Array.isArray(value)) {
    return encodingByte.array + encodeTuple(value, options);
  }
  if (typeof value === 'object') {
    return encodingByte.object + encodeObjectValue(value, options);
  }
  throw new UnreachableError(value, 'Unknown value type');
}

export function encodingTypeOf(value: Value): EncodingType {
  if (value === null) {
    return 'null';
  }
  if (value === true || value === false) {
    return 'boolean';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  throw new UnreachableError(value, 'Unknown value type');
}

const decodeType = Object.fromEntries(
  Object.entries(encodingByte).map(([key, value]) => [value, key])
) as {
  [key: string]: keyof typeof encodingByte;
};

export function decodeValue(str: string, options?: EncodingOptions): Value {
  const encoding: EncodingType = decodeType[str[0]];
  const rest = str.slice(1);

  if (encoding === 'null') {
    return null;
  }
  if (encoding === 'boolean') {
    return JSON.parse(rest);
  }
  if (encoding === 'string') {
    return rest;
  }
  if (encoding === 'number') {
    return elen.decode(rest);
  }
  if (encoding === 'array') {
    return decodeTuple(rest, options);
  }
  if (encoding === 'object') {
    return decodeObjectValue(rest, options);
  }
  throw new UnreachableError(encoding, 'Invalid encoding byte');
}

// TODO: disallow null byte (?)
// TODO: simplify for our needs
export function encodeTuple(tuple: Tuple, options?: EncodingOptions) {
  const delimiter = options?.delimiter ?? '\x01';
  const escape = options?.escape ?? '\x02';
  const reEscapeByte = new RegExp(`${escape}`, 'g');
  const reDelimiterByte = new RegExp(`${delimiter}`, 'g');
  return tuple
    .map((value, i) => {
      const encoded = encodeValue(value, options);
      return (
        encoded
          // B -> BB or \ -> \\
          .replace(reEscapeByte, escape + escape)
          // A -> BA or x -> \x
          .replace(reDelimiterByte, escape + delimiter) + delimiter
      );
    })
    .join('');
}

export function decodeTuple(str: string, options?: EncodingOptions) {
  if (str === '') {
    return [];
  }

  const delimiter = options?.delimiter ?? '\x01';
  const escape = options?.escape ?? '\x02';

  // Capture all of the escaped BB and BA pairs and wait
  // til we find an exposed A.
  const matcher = new RegExp(
    `(${escape}(${escape}|${delimiter})|${delimiter})`,
    'g'
  );
  const reEncodedEscape = new RegExp(escape + escape, 'g');
  const reEncodedDelimiter = new RegExp(escape + delimiter, 'g');
  const tuple: Tuple = [];
  let start = 0;
  while (true) {
    const match = matcher.exec(str);
    if (match === null) {
      return tuple;
    }
    if (match[0][0] === escape) {
      // If we match a escape+escape or escape+delimiter then keep going.
      continue;
    }
    const end = match.index;
    const escaped = str.slice(start, end);
    const unescaped = escaped
      // BB -> B
      .replace(reEncodedEscape, escape)
      // BA -> A
      .replace(reEncodedDelimiter, delimiter);
    const decoded = decodeValue(unescaped, options);
    tuple.push(decoded);
    // Skip over the \x01.
    start = end + 1;
  }
}

function encodeObjectValue(obj: object, options?: EncodingOptions) {
  if (!isPlainObject(obj)) {
    throw new Error('Cannot serialize this object.');
  }
  const entries = Object.entries(obj)
    .sort(([k1], [k2]) => compare(k1, k2))
    // We allow undefined values in objects, but we want to strip them out before
    // serializing.
    .filter(([key, value]) => value !== undefined);
  return encodeTuple(entries as Tuple, options);
}

function decodeObjectValue(str: string, options?: EncodingOptions) {
  const entries = decodeTuple(str, options) as Array<[string, Value]>;
  const obj: Record<string, any> = {};
  for (const [key, value] of entries) {
    obj[key] = value;
  }
  return obj;
}

export function compareValue(a: Value, b: Value): number {
  const at = encodingTypeOf(a);
  const bt = encodingTypeOf(b);
  if (at === bt) {
    if (at === 'array') {
      return compareTuple(a as any, b as any);
    } else if (at === 'object') {
      if (a === b) return 0;
      // TODO: prototype.compare for classes.
      // NOTE: it's a bit contentious to allow for unsortable data inside a sorted array.
      // But it is convenient at times to be able to do this sometimes and just assume that
      // thee classes are unsorted.
      if (isPlainObject(a)) {
        if (isPlainObject(b)) {
          // Plain objects are ordered.
          // This is convenient for meta types like `{date: "2021-12-01"}` =>  [["date", "2021-12-01"]]
          return compareObject(a as any, b as any);
        } else {
          // json > class
          return -1;
        }
      } else if (isPlainObject(b)) {
        // json > class
        return 1;
      } else {
        // class != class
        return 1;
      }
    } else if (at === 'boolean') {
      return compare(a as boolean, b as boolean);
    } else if (at === 'null') {
      return 0;
    } else if (at === 'number') {
      return compare(a as number, b as number);
    } else if (at === 'string') {
      return compare(a as string, b as string);
    } else {
      throw new UnreachableError(at);
    }
  }

  return compare(encodingRank.get(at)!, encodingRank.get(bt)!);
}

function compareObject(
  a: { [key: string]: Value },
  b: { [key: string]: Value }
) {
  const ae = Object.entries(a)
    .filter(([k, v]) => v !== undefined)
    .sort(([k1], [k2]) => compare(k1, k2));
  const be = Object.entries(b)
    .filter(([k, v]) => v !== undefined)
    .sort(([k1], [k2]) => compare(k1, k2));

  const len = Math.min(ae.length, be.length);

  for (let i = 0; i < len; i++) {
    const [ak, av] = ae[i];
    const [bk, bv] = be[i];
    const dir = compareValue(ak, bk);
    if (dir === 0) {
      const dir2 = compareValue(av, bv);
      if (dir2 === 0) {
        continue;
      }
      return dir2;
    }
    return dir;
  }

  if (ae.length > be.length) {
    return 1;
  } else if (ae.length < be.length) {
    return -1;
  } else {
    return 0;
  }
}

export function compareTuple(a: Tuple, b: Tuple) {
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const dir = compareValue(a[i], b[i]);
    if (dir === 0) {
      continue;
    }
    return dir;
  }

  if (a.length > b.length) {
    return 1;
  } else if (a.length < b.length) {
    return -1;
  } else {
    return 0;
  }
}

export function ValueToString(value: Value) {
  if (value === null) {
    return 'null';
  } else {
    return JSON.stringify(value);
  }
}

export function TupleToString(tuple: Tuple) {
  return `[${tuple.map(ValueToString).join(',')}]`;
}
