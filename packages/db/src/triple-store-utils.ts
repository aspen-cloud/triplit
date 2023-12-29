import { MIN, MAX } from 'tuple-database';
import {
  IndexNotFoundError,
  InvalidTimestampIndexScanError,
} from './errors.js';
import MultiTupleStore, {
  ScopedMultiTupleOperator,
} from './multi-tuple-store.js';
import { ValueCursor } from './query.js';
import { Timestamp } from './timestamp.js';
import { TripleStoreTransaction } from './triple-store-transaction.js';
import { KeyValuePair } from '@triplit/tuple-database';

// Value should be serializable, this is what goes into triples
// Not to be confused with the Value type we define on queries
export type Value = number | string | boolean | null;
export type EntityId = string;
export type AttributeItem = string | number;
export type Attribute = AttributeItem[];
export type Expired = boolean;
export type TenantId = string;

export type EAV = [EntityId, Attribute, Value];
export type TripleKey = [EntityId, Attribute, Value, Timestamp];
export type TripleRow = {
  id: EntityId;
  attribute: Attribute;
  value: Value;
  timestamp: Timestamp;
  expired: Expired;
};

export type TripleMetadata = { expired: Expired };

export type EATIndex = {
  key: ['EAT', EntityId, Attribute, Timestamp];
  value: [Value, TripleMetadata['expired']];
};

export type AVEIndex = {
  key: ['AVE', Attribute, Value, EntityId, Timestamp];
  value: TripleMetadata;
};

export type VAEIndex = {
  key: ['VAE', Value, Attribute, EntityId, Timestamp];
  value: TripleMetadata;
};

export type ClientTimestampIndex = {
  key: ['clientTimestamp', string, Timestamp, EntityId, Attribute, Value]; // [tenant, 'clientTimestamp', client]
  value: TripleMetadata;
};

export type MetadataIndex = {
  key: ['metadata', EntityId, ...Attribute];
  value: any;
};

export type WithTenantIdPrefix<T extends KeyValuePair> = {
  key: [TenantId, ...T['key']];
  value: T['value'];
};

export type TripleIndex = EATIndex | AVEIndex | VAEIndex | ClientTimestampIndex;
export type TupleIndex = TripleIndex | MetadataIndex;
// export type TenantTripleIndex = WithTenantIdPrefix<TripleIndex>;

type MultiTupleStoreOrTransaction =
  | ScopedMultiTupleOperator<TupleIndex>
  | MultiTupleStore<TupleIndex>;

export type MetadataListener = (changes: {
  updates: EAV[];
  deletes: [entityId: string, attribute?: Attribute][];
}) => void | Promise<void>;

export type TripleStoreBeforeInsertHook = (
  triple: TripleRow[],
  tx: TripleStoreTransaction
) => void | Promise<void>;

export type TripleStoreBeforeCommitHook = (
  tx: TripleStoreTransaction
) => void | Promise<void>;

export type TripleStoreHooks = {
  beforeInsert: TripleStoreBeforeInsertHook[];
};

export function indexToTriple(index: TupleIndex): TripleRow {
  const indexType = index.key[0];
  let e, a, v, t;
  switch (indexType) {
    case 'EAT':
      [, e, a, t] = index.key as EATIndex['key'];
      v = index.value[0];
      break;
    case 'AVE':
      [, a, v, e, t] = index.key as AVEIndex['key'];
      break;
    // case 'VAE':
    //   [, v, a, e, t] = index.key as VAEIndex['key'];
    //   break;
    case 'clientTimestamp':
      [, , t, e, a, v] = index.key as ClientTimestampIndex['key'];
      break;
    default:
      throw new IndexNotFoundError(indexType);
  }
  return {
    id: e,
    attribute: a,
    value: v,
    timestamp: t,
    // @ts-ignore
    expired: indexType === 'EAT' ? index.value[1] : index.value.expired,
  };
}

export async function scanToTriples(
  tx: MultiTupleStoreOrTransaction,
  ...scanParams: Parameters<MultiTupleStoreOrTransaction['scan']>
) {
  // @ts-ignore
  return (await tx.scan(...scanParams)).map(indexToTriple);
}

export async function findByCollection(
  tx: MultiTupleStoreOrTransaction,
  collectionName: string,
  direction?: 'ASC' | 'DESC'
) {
  return scanToTriples(tx, {
    prefix: ['EAT'],
    gte: [collectionName],
    // @ts-ignore
    lt: [collectionName + MAX],
    reverse: direction === 'DESC',
  });
}

export async function findByEAT(
  tx: MultiTupleStoreOrTransaction,
  [entityId, attribute]: [entityId?: EntityId, attribute?: Attribute] = [],
  direction?: 'ASC' | 'DESC'
) {
  const scanArgs = {
    prefix: ['EAT'],
    gte: [entityId ?? MIN, attribute ?? MIN],
    // @ts-ignore
    lt: [entityId ?? MAX, [...(attribute ?? []), MAX], MAX],
    reverse: direction === 'DESC',
  };
  return scanToTriples(tx, scanArgs);
}

export function findByAVE(
  tx: MultiTupleStoreOrTransaction,
  [attribute, value, entityId]: [
    attribute?: Attribute,
    value?: Value,
    entityId?: EntityId
  ] = [],
  direction?: 'ASC' | 'DESC'
) {
  return scanToTriples(tx, {
    prefix: ['AVE'],
    gte: [attribute ?? MIN, value ?? MIN, entityId ?? MIN],
    // @ts-ignore
    lt: [[...(attribute ?? []), ...(value ? [] : [MAX])], value ?? MAX, MAX],
    reverse: direction === 'DESC',
  });
}

export function findValuesInRange(
  tx: MultiTupleStoreOrTransaction,
  attribute: Attribute,
  {
    greaterThan,
    lessThan,
    direction,
  }: {
    greaterThan?: ValueCursor;
    lessThan?: ValueCursor;
    direction?: 'ASC' | 'DESC';
  } = {}
) {
  const prefix = ['AVE', attribute];
  const TUPLE_LENGTH = 5;
  const scanArgs = {
    prefix,
    gt: greaterThan && [
      ...greaterThan,
      ...new Array(TUPLE_LENGTH - prefix.length - greaterThan.length).fill(MAX),
    ],
    lt: lessThan && [
      ...lessThan,
      ...new Array(TUPLE_LENGTH - prefix.length - lessThan.length).fill(MIN),
    ],
    reverse: direction === 'DESC',
  };
  return scanToTriples(tx, scanArgs);
}

// function findByVAE(
//   tx: MultiTupleStoreOrTransaction,
//   [value, attribute, entityId]: [
//     value?: Value,
//     attribute?: Attribute,
//     entityId?: EntityId
//   ] = [],
//   direction?: 'ASC' | 'DESC'
// ) {
//   return scanToTriples(tx, {
//     prefix: ['VAE'],
//     gte: [value ?? MIN, attribute ?? MIN, entityId ?? MIN],
//     // @ts-ignore
//     lt: [value ?? MAX, [...(attribute ?? []), MAX], MAX],
//     reverse: direction === 'DESC',
//   });
// }

export async function findByEntity(
  tx: MultiTupleStoreOrTransaction,
  id?: EntityId
): Promise<TripleRow[]> {
  return findByEAT(tx, [id]);
}

export async function findByEntityAttribute(
  tx: MultiTupleStoreOrTransaction,
  id: EntityId,
  attribute: Attribute
): Promise<TripleRow[]> {
  return findByEAT(tx, [id, attribute]);
}

export async function findByAttribute(
  tx: MultiTupleStoreOrTransaction,
  attribute: Attribute
): Promise<TripleRow[]> {
  return findByAVE(tx, [attribute]);
}

// async function findByValue(
//   tx: MultiTupleStoreOrTransaction,
//   value: Value
// ): Promise<TripleRow[]> {
//   return findByVAE(tx, [value]);
// }

export function mapStaticTupleToEAV(tuple: { key: any[]; value: any }): EAV {
  const [_index, entityId, ...path] = tuple.key;
  return [entityId, path, tuple.value];
}

// NOTE: SOME WEIRD STUFF GOING ON WITH TUPLE DATABASE AND gt/lte with array prefixes
export async function findByClientTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string,
  scanDirection: 'lt' | 'lte' | 'gt' | 'gte' | 'eq',
  timestamp: Timestamp | undefined
) {
  const indexPrefix = ['clientTimestamp', clientId];
  if (scanDirection === 'lt') {
    if (!timestamp) return [];
    return await scanToTriples(tx, {
      prefix: indexPrefix,
      lt: [timestamp],
    });
  }
  if (scanDirection === 'lte') {
    if (!timestamp) return [];
    return await scanToTriples(tx, {
      prefix: indexPrefix,
      lte: [[...timestamp, MAX]],
    });
  }
  if (scanDirection === 'gt') {
    return scanToTriples(tx, {
      prefix: indexPrefix,
      gt: [[...(timestamp ?? []), MIN]],
    });
  }
  if (scanDirection === 'gte') {
    return scanToTriples(tx, {
      prefix: indexPrefix,
      gte: [[...(timestamp ?? [])]],
    });
  }
  if (scanDirection === 'eq') {
    if (!timestamp) return [];
    return await scanToTriples(tx, {
      prefix: indexPrefix,
      gte: [timestamp],
      lt: [[...timestamp, MAX]],
    });
  }
  throw new InvalidTimestampIndexScanError(
    `Cannot perfom a scan with direction ${scanDirection}.`
  );
}

export async function findMaxClientTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string
): Promise<Timestamp | undefined> {
  const res = (await tx.scan({
    prefix: ['clientTimestamp', clientId],
    reverse: true,
  })) as ClientTimestampIndex[];
  return res[0]?.key[2];
}

// We use the _collection tuple to indicate if an entity delete should occur
export function isTupleEntityDeleteMarker(tuple: TupleIndex) {
  // @ts-ignore TODO: need to fix to support subspaces
  const collectionMarker = tuple.key[3][0];
  return collectionMarker === '_collection' && tuple.value.expired;
}
