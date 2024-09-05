import {
  IndexNotFoundError,
  InvalidTimestampIndexScanError,
} from './errors.js';
import MultiTupleStore, {
  ScopedMultiTupleOperator,
} from './multi-tuple-store.js';
import { QueryValue, ValueCursor } from './query/types/collection-query.js';
import { Timestamp } from './timestamp.js';
import { TripleStoreTransaction } from './triple-store-transaction.js';
import { KeyValuePair, MIN, MAX } from '@triplit/tuple-database';
import { genToArr, mapGen } from './utils/generator.js';

// Value should be serializable, this is what goes into triples
// Not to be confused with the Value type we define on queries
export type TupleValue = number | string | boolean | null;
export type EntityId = string;
export type AttributeItem = string | number;
export type Attribute = AttributeItem[];
export type Expired = boolean;
export type TenantId = string;

export type EAV = [EntityId, Attribute, TupleValue];
export type TripleKey = [EntityId, Attribute, TupleValue, Timestamp];
export type TripleRow = {
  id: EntityId;
  attribute: Attribute;
  value: TupleValue;
  timestamp: Timestamp;
  expired: Expired;
};

export type TripleMetadata = { expired: Expired };

export type EATIndex = {
  key: ['EAT', EntityId, Attribute, Timestamp];
  value: [TupleValue, TripleMetadata['expired']];
};

export type AVEIndex = {
  key: ['AVE', Attribute, TupleValue, EntityId, Timestamp];
  value: TripleMetadata;
};

export type VAEIndex = {
  key: ['VAE', TupleValue, Attribute, EntityId, Timestamp];
  value: TripleMetadata;
};

export type ClientTimestampIndex = {
  key: ['clientTimestamp', string, Timestamp, EntityId, Attribute, TupleValue]; // [tenant, 'clientTimestamp', client]
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
  triples: TripleRow[],
  tx: TripleStoreTransaction
) => void | Promise<void>;

export type TripleStoreBeforeCommitHook = (
  triples: Record<string, TripleRow[]>,
  tx: TripleStoreTransaction
) => void | Promise<void>;

export type TripleStoreAfterCommitHook = (
  triples: Record<string, TripleRow[]>,
  tx: TripleStoreTransaction
) => void | Promise<void>;

export type TripleStoreHooks = {
  beforeInsert: TripleStoreBeforeInsertHook[];
  beforeCommit: TripleStoreBeforeCommitHook[];
  afterCommit: TripleStoreAfterCommitHook[];
};

// TODO: This really should be TupleValue
export type RangeContraints = {
  greaterThan?: QueryValue;
  greaterThanCursor?: ValueCursor;
  greaterThanOrEqual?: QueryValue;
  greaterThanOrEqualCursor?: ValueCursor;
  lessThan?: QueryValue;
  lessThanCursor?: ValueCursor;
  lessThanOrEqual?: QueryValue;
  lessThanOrEqualCursor?: ValueCursor;
  direction?: 'ASC' | 'DESC';
};

// TODO: figure out prefix issue
export function indexToTriple(
  index: TupleIndex,
  prefix: string[] = []
): TripleRow {
  const indexKey = index.key.slice(
    0 + (prefix?.length ?? 0)
  ) as TupleIndex['key'];
  const indexType = indexKey[0];
  let e, a, v, t;
  switch (indexType) {
    case 'EAT':
      [, e, a, t] = indexKey as EATIndex['key'];
      v = index.value[0];
      break;
    case 'AVE':
      [, a, v, e, t] = indexKey as AVEIndex['key'];
      break;
    // case 'VAE':
    //   [, v, a, e, t] = indexKey as VAEIndex['key'];
    //   break;
    case 'clientTimestamp':
      [, , t, e, a, v] = indexKey as ClientTimestampIndex['key'];
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
    expired:
      indexType === 'EAT'
        ? index.value[1]
        : indexType === 'AVE'
        ? false
        : index.value.expired,
  };
}

export async function* scanToTriples(
  tx: MultiTupleStoreOrTransaction,
  scanParams: Parameters<MultiTupleStoreOrTransaction['scan']>[0]
) {
  yield* mapGen(tx.scan(scanParams), (index) => indexToTriple(index));
}

export async function* findByCollection(
  tx: MultiTupleStoreOrTransaction,
  collectionName: string,
  direction?: 'ASC' | 'DESC'
) {
  yield* scanToTriples(tx, {
    prefix: ['EAT'],
    gte: [collectionName],
    // @ts-ignore
    lt: [collectionName + MAX],
    reverse: direction === 'DESC',
  });
}

export async function* findByEAT(
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
  yield* scanToTriples(tx, scanArgs);
}

export async function* findByAVE(
  tx: MultiTupleStoreOrTransaction,
  [attribute, value, entityId]: [
    attribute?: Attribute,
    value?: TupleValue,
    entityId?: EntityId
  ] = [],
  direction?: 'ASC' | 'DESC'
) {
  yield* scanToTriples(tx, {
    prefix: ['AVE'],
    gte: [attribute ?? MIN, value ?? MIN, entityId ?? MIN],
    // @ts-ignore
    lt: [[...(attribute ?? []), ...(value ? [] : [MAX])], value ?? MAX, MAX],
    reverse: direction === 'DESC',
  });
}

export async function* findValuesInRange(
  tx: MultiTupleStoreOrTransaction,
  attribute: Attribute,
  constraints: RangeContraints = {}
) {
  const prefix = ['AVE', attribute];
  const TUPLE_LENGTH = 5;

  // Args accept either a cursor or a value, use min/max if cursor not provided
  const greaterThanCursor = !!constraints.greaterThanCursor
    ? constraints.greaterThanCursor
    : constraints.greaterThan
    ? ([constraints.greaterThan, MAX] as const)
    : undefined;
  const greaterThanOrEqualCursor = !!constraints.greaterThanOrEqualCursor
    ? constraints.greaterThanOrEqualCursor
    : constraints.greaterThanOrEqual
    ? ([constraints.greaterThanOrEqual, MIN] as const)
    : undefined;
  const lessThanCursor = !!constraints.lessThanCursor
    ? constraints.lessThanCursor
    : constraints.lessThan
    ? ([constraints.lessThan, MIN] as const)
    : undefined;
  const lessThanOrEqualCursor = !!constraints.lessThanOrEqualCursor
    ? constraints.lessThanOrEqualCursor
    : constraints.lessThanOrEqual
    ? ([constraints.lessThanOrEqual, MAX] as const)
    : undefined;

  const scanArgs = {
    prefix,
    gt: greaterThanCursor && [
      ...greaterThanCursor,
      ...new Array(
        TUPLE_LENGTH - prefix.length - greaterThanCursor.length
      ).fill(MAX),
    ],
    gte: greaterThanOrEqualCursor && [
      ...greaterThanOrEqualCursor,
      ...new Array(
        TUPLE_LENGTH - prefix.length - greaterThanOrEqualCursor.length
      ).fill(MIN),
    ],
    lt: lessThanCursor && [
      ...lessThanCursor,
      ...new Array(TUPLE_LENGTH - prefix.length - lessThanCursor.length).fill(
        MIN
      ),
    ],
    lte: lessThanOrEqualCursor && [
      ...lessThanOrEqualCursor,
      ...new Array(
        TUPLE_LENGTH - prefix.length - lessThanOrEqualCursor.length
      ).fill(MAX),
    ],
    reverse: constraints.direction === 'DESC',
  };
  yield* scanToTriples(tx, scanArgs);
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

export async function* findByEntity(
  tx: MultiTupleStoreOrTransaction,
  id?: EntityId
) {
  yield* findByEAT(tx, [id]);
}

export async function* findByEntityAttribute(
  tx: MultiTupleStoreOrTransaction,
  id: EntityId,
  attribute: Attribute
) {
  yield* findByEAT(tx, [id, attribute]);
}

export async function* findByAttribute(
  tx: MultiTupleStoreOrTransaction,
  attribute: Attribute
) {
  yield* findByAVE(tx, [attribute]);
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
export async function* findByClientTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string,
  scanDirection: 'lt' | 'lte' | 'gt' | 'gte' | 'eq',
  timestamp: Timestamp | undefined
) {
  if (!timestamp && !scanDirection.startsWith('gt')) {
    return [];
  }
  let scanParams: Parameters<MultiTupleStoreOrTransaction['scan']>[0];
  switch (scanDirection) {
    case 'lt':
      scanParams = {
        lt: [timestamp!],
      };
      break;
    case 'lte':
      scanParams = {
        lte: [[...timestamp!, MAX]],
      };
      break;
    case 'gt':
      scanParams = {
        gt: [[...(timestamp ?? []), MIN]],
      };
      break;
    case 'gte':
      scanParams = {
        gte: [[...(timestamp ?? [])]],
      };
      break;
    case 'eq':
      scanParams = {
        gte: [timestamp!],
        lt: [[...timestamp!, MAX]],
      };
      break;
    default:
      throw new InvalidTimestampIndexScanError(
        `Cannot perform a scan with direction ${scanDirection}.`
      );
  }
  yield* scanToTriples(tx, {
    prefix: ['clientTimestamp', clientId],
    ...scanParams,
  });
}

export async function findMaxClientTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string
): Promise<Timestamp | undefined> {
  const res = (await genToArr(
    tx.scan({
      prefix: ['clientTimestamp', clientId],
      reverse: true,
      limit: 1,
    })
  )) as ClientTimestampIndex[];
  return res[0]?.key[2];
}

export async function findAllClientIds(
  tx: MultiTupleStoreOrTransaction
): Promise<string[]> {
  const clientIds: Set<string> = new Set();
  let lastClientId: string | typeof MIN = MIN;
  while (true) {
    const res = await genToArr(
      tx.scan({
        prefix: ['clientTimestamp'],
        gt: [lastClientId, MAX, MAX, MAX, MAX],
        limit: 1,
      })
    );
    if (res.length === 0) {
      break;
    }
    const tuple = res[0] as ClientTimestampIndex;
    const clientId = tuple.key[1];
    if (!clientId) {
      throw new Error('Empty client ID found in clientTimestamp index');
    }
    if (clientIds.has(clientId)) {
      throw new Error('Duplicate client ID found in clientTimestamp index');
    }
    clientIds.add(tuple.key[1]);
    lastClientId = clientId;
  }
  return Array.from(clientIds);
}

// We use the _collection tuple to indicate if an entity delete should occur
export function isTupleEntityDeleteMarker(tuple: TupleIndex) {
  // @ts-ignore TODO: need to fix to support subspaces
  const collectionMarker = tuple.key[3][0];
  return collectionMarker === '_collection' && tuple.value.expired;
}

export function triplesToStateVector(triples: TripleRow[]): Timestamp[] {
  const clientClocks = new Map<string, number>();
  triples.forEach((t) => {
    // only set the clock if it is greater than the current clock for each client
    const [tick, clientId] = t.timestamp;
    const currentClock = clientClocks.get(clientId);
    if (!currentClock || tick > currentClock) {
      clientClocks.set(clientId, tick);
    }
  });
  return [...clientClocks.entries()].map(([clientId, timestamp]) => [
    timestamp,
    clientId,
  ]);
}
