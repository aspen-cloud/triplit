import { combineHashes, fnv1aHash, hashObject } from '../utils/hash.js';
import {
  CollectionQuery,
  PreparedInclusions,
  PreparedOrder,
  PreparedOrderStatement,
  PreparedQuery,
  PreparedWhere,
  PreparedWhereFilter,
  QueryAfter,
} from '../types.js';
import {
  isBooleanFilter,
  isFilterGroup,
  isFilterStatement,
  isSubQueryFilter,
} from '../filters.js';
import { TriplitError } from '../errors.js';
import { encodingByte, Value } from '../codec.js';

// Should update this as we add more query properties
const COLLECTION_QUERY_PROPS = [
  'after',
  'collectionName',
  'select',
  // 'entityId',
  'include',
  'limit',
  'order',
  'vars',
  'where',
] as const satisfies (keyof CollectionQuery)[];

/**
 * Hashes a query object to a unique string, ignoring non-query properties. Thus the hash is of the query the server will see.
 */
export function hashQuery<Q extends CollectionQuery>(params: Q) {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([key]) =>
      (COLLECTION_QUERY_PROPS as string[]).includes(key)
    )
  );
  const hash = hashObject(queryParams).toString();
  return hash;
}

const COLLECTION_NAME_PREFIX = fnv1aHash('C');
/**
 * Returns a hash of the query that is stable across varying ordering of inputs (like select and where)
 */
// This has some small potential for collisions, but that is small as is, and inputs are not fully random so there is a more limited input space for the hash
// One vector could be in places where we join strings to create a sort key for a filter
export function hashPreparedQuery(query: PreparedQuery): number {
  let h = COLLECTION_NAME_PREFIX;
  h = combineHashes(h, fnv1aHash(query.collectionName));

  if (query.where) {
    const hash = hashFilters(query.where);
    h = combineHashes(h, hash);
  }

  if (query.order) {
    const hash = hashOrder(query.order);
    h = combineHashes(h, hash);
  }

  if (query.limit != undefined) {
    const hash = hashLimit(query.limit);
    h = combineHashes(h, hash);
  }

  if (query.after) {
    const hash = hashAfter(query.after);
    h = combineHashes(h, hash);
  }

  if (query.include) {
    const hash = hashInclusions(query.include);
    h = combineHashes(h, hash);
  }

  if (query.select) {
    const hash = hashSelect(query.select);
    h = combineHashes(h, hash);
  }

  return h;
}

const BOOL_FILTER_PREFIX = fnv1aHash('B');
const STATEMENT_FILTER_PREFIX = fnv1aHash('S');
const GROUP_FILTER_PREFIX = fnv1aHash('G');
const SUBQUERY_FILTER_PREFIX = fnv1aHash('Q');
export function hashFilter(filter: PreparedWhereFilter): {
  hash: number;
  sortKey: string; // Using a sort key for the potential chance of a collision, but i do think thats pretty unlikely and you could just return the hash and sort on that
} {
  if (isBooleanFilter(filter)) {
    let h = BOOL_FILTER_PREFIX;
    const stringified = filter.toString();
    h = combineHashes(h, fnv1aHash(stringified));
    return {
      hash: h,
      sortKey: `B|${stringified}`,
    };
  } else if (isFilterStatement(filter)) {
    let h = STATEMENT_FILTER_PREFIX;
    h = combineHashes(h, fnv1aHash(filter[0]));
    h = combineHashes(h, fnv1aHash(filter[1]));
    const encodedValue = encodeHashValue(filter[2]);
    h = combineHashes(h, fnv1aHash(encodedValue));
    return {
      hash: h,
      sortKey: `S|${filter[0]}|${filter[1]}|${encodedValue}`,
    };
  } else if (isFilterGroup(filter)) {
    let h = GROUP_FILTER_PREFIX;
    h = combineHashes(h, fnv1aHash(filter.mod));
    const hash = hashFilters(filter.filters);
    h = combineHashes(h, hash);
    return {
      hash: h,
      sortKey: `G|${filter.mod}|${hash}`,
    };
  } else if (isSubQueryFilter(filter)) {
    let h = SUBQUERY_FILTER_PREFIX;
    const queryHash = hashPreparedQuery(filter.exists);
    h = combineHashes(h, queryHash);
    return {
      hash: h,
      sortKey: `Q|${h}`,
    };
  }
  throw new TriplitError(
    'Could not hash filter, it is not a valid filter type'
  );
}

const FILTER_PREFIX = fnv1aHash('F');
export function hashFilters(filters: PreparedWhere): number {
  let h = FILTER_PREFIX;
  const filterHashes = filters.map(hashFilter);
  filterHashes.sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0
  );
  for (const fh of filterHashes) {
    h = combineHashes(h, fh.hash);
  }
  return h;
}

const ORDER_PREFIX = fnv1aHash('O');
export function hashOrder(order: PreparedOrder) {
  let oh = ORDER_PREFIX;
  for (const statement of order) {
    oh = combineHashes(oh, hashOrderStatement(statement));
  }
  return oh;
}

const ORDER_STATEMENT_PREFIX = fnv1aHash('o');
export function hashOrderStatement(order: PreparedOrderStatement) {
  let oh = ORDER_STATEMENT_PREFIX;
  oh = combineHashes(oh, fnv1aHash(order[0]));
  oh = combineHashes(oh, fnv1aHash(order[1]));
  if (order[2]) oh = combineHashes(oh, hashPreparedQuery(order[2].subquery));
  return oh;
}

const SELECT_PREFIX = fnv1aHash('P'); // S taken, P for Pick
export function hashSelect(select: string[]) {
  let sh = SELECT_PREFIX;
  const sorted = [...select].sort();
  for (const s of sorted) {
    sh = combineHashes(sh, fnv1aHash(s));
  }
  return sh;
}

const INCLUSION_PREFIX = fnv1aHash('I');
export function hashInclusions(include: PreparedInclusions) {
  let ih = INCLUSION_PREFIX;
  const sorted = Object.entries(include).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  for (const [key, value] of sorted) {
    ih = combineHashes(ih, fnv1aHash(key));
    ih = combineHashes(ih, fnv1aHash(value.cardinality));
    ih = combineHashes(ih, hashPreparedQuery(value.subquery));
  }
  return ih;
}

const AFTER_PREFIX = fnv1aHash('A');
export function hashAfter(after: QueryAfter) {
  let ah = AFTER_PREFIX;
  const [cursor, inclusive] = after;
  for (const c of cursor) {
    ah = combineHashes(ah, fnv1aHash(encodeHashValue(c)));
  }
  ah = combineHashes(ah, fnv1aHash(inclusive.toString()));
  return ah;
}

const LIMIT_PREFIX = fnv1aHash('L');
export function hashLimit(limit: number) {
  let lh = LIMIT_PREFIX;
  lh = combineHashes(lh, fnv1aHash(limit.toString()));
  return lh;
}

const hashEncodingByte = {
  undefined: 'a',
  ...encodingByte,
};

export function encodeHashValue(value: Value | undefined): string {
  if (value === undefined) {
    return hashEncodingByte.undefined;
  }
  if (value === null) {
    return hashEncodingByte.null;
  }
  if (value === true || value === false) {
    return encodingByte.boolean + value;
  }
  if (typeof value === 'string') {
    return encodingByte.string + value;
  }
  if (typeof value === 'number') {
    return encodingByte.number + value;
  }
  if (Array.isArray(value)) {
    // TODO: JSON.stringify may not be strictly correct
    return encodingByte.array + JSON.stringify(value);
  }
  if (typeof value === 'object') {
    // TODO: JSON.stringify may not be strictly correct
    return encodingByte.object + JSON.stringify(value);
  }
  throw new TriplitError(`Failed to encode hash value: ${value}`);
}
