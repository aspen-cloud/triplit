import {
  AsyncTupleDatabaseClient,
  AsyncTupleStorageApi,
  MAX,
  MIN,
  WriteOps,
  KeyValuePair,
  AsyncTupleDatabase,
  TupleStorageApi,
} from 'tuple-database';
import { Timestamp, timestampCompare } from './timestamp';
import MultiTupleStore, {
  MultiTupleTransaction,
  ScopedMultiTupleOperator,
  StorageScope,
} from './multi-tuple-store';
import { Clock } from './clocks/clock';
import { MemoryClock } from './clocks/memory-clock';
import { entityToResultReducer, ValueCursor } from './query';
import {
  IndexNotFoundError,
  InvalidTimestampIndexScanError,
  WriteRuleError,
} from './errors';

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

export type EAVIndex = {
  key: ['EAV', EntityId, Attribute, Value, Timestamp];
  value: TripleMetadata;
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

type WithTenantIdPrefix<T extends KeyValuePair> = {
  key: [TenantId, ...T['key']];
  value: T['value'];
};

export type TripleIndex = EAVIndex | AVEIndex | VAEIndex | ClientTimestampIndex;
type TupleIndex = TripleIndex | MetadataIndex;
// export type TenantTripleIndex = WithTenantIdPrefix<TripleIndex>;

type MultiTupleStoreOrTransaction =
  | ScopedMultiTupleOperator<TupleIndex>
  | MultiTupleStore<TupleIndex>;

function indexToTriple(index: TupleIndex): TripleRow {
  const indexType = index.key[0];
  let e, a, v, t;
  switch (indexType) {
    case 'EAV':
      [, e, a, v, t] = index.key as EAVIndex['key'];
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
    expired: index.value.expired,
  };
}

function isTupleStorage(object: any): object is AsyncTupleStorageApi {
  if (typeof object !== 'object') return false;
  const storageKeys: (keyof AsyncTupleStorageApi)[] = [
    'close',
    'commit',
    'scan',
  ];
  return storageKeys.every((objKey) => objKey in object);
}

export interface TripleStoreApi {
  // Mutation methods
  insertTriple(tripleRow: TripleRow): void;
  insertTriples(triplesInput: TripleRow[]): void;
  deleteTriple(tripleRow: TripleRow): void;
  deleteTriples(triplesInput: TripleRow[]): void;
  setValue(...triple: EAV): void;

  // Read methods
  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;
  findMaxTimestamp(clientId: string): Promise<Timestamp | undefined>;
  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ): Promise<TripleRow[]>;

  findByEAV(
    [entityId, attribute, value]: [
      entityId?: EntityId,
      attribute?: Attribute,
      value?: Value
    ],
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;

  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute,
      value?: Value,
      entityId?: EntityId
    ],
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;

  // findByVAE(
  //   [value, attribute, entityId]: [
  //     value?: Value,
  //     attribute?: Attribute,
  //     entityId?: EntityId
  //   ],
  //   direction?: 'ASC' | 'DESC'
  // ): Promise<TripleRow[]>;

  findByEntity(id?: EntityId): Promise<TripleRow[]>;

  findByEntityAttribute(
    id: EntityId,
    attribute: Attribute
  ): Promise<TripleRow[]>;

  findByAttribute(attribute: Attribute): Promise<TripleRow[]>;

  // findByValue(value: Value): Promise<TripleRow[]>;

  // metadata operations
  readMetadataTuples(entityId: string, attribute?: Attribute): Promise<EAV[]>;
  updateMetadataTuples(updates: EAV[]): Promise<void>;
  deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ): Promise<void>;
}

type MetadataListener = (changes: {
  updates: EAV[];
  deletes: [entityId: string, attribute?: Attribute][];
}) => void | Promise<void>;

export class TripleStoreOperator implements TripleStoreApi {
  tupleOperator: ScopedMultiTupleOperator<TupleIndex>;
  private txMetadataListeners: Set<MetadataListener> = new Set();

  readonly clock: Clock;

  assignedTimestamp?: Timestamp;

  hooks: {
    before: ((
      triple: TripleRow[],
      tx: TripleStoreTransaction
    ) => void | Promise<void>)[];
  };

  constructor({
    tupleOperator,
    clock,
    hooks,
  }: {
    tupleOperator: ScopedMultiTupleOperator<TupleIndex>;
    clock: Clock;
    hooks: {
      before: ((
        triple: TripleRow[],
        tx: TripleStoreTransaction
      ) => void | Promise<void>)[];
    };
  }) {
    this.tupleOperator = tupleOperator;
    this.clock = clock;
    this.hooks = hooks;
  }

  async getTransactionTimestamp() {
    if (!this.assignedTimestamp) {
      this.assignedTimestamp = await this.clock.getNextTimestamp();
    }
    return this.assignedTimestamp;
  }

  async findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByCollection(this.tupleOperator, collection, direction);
  }

  async findValuesInRange(
    attribute: Attribute,
    constraints:
      | {
          greaterThan?: ValueCursor;
          lessThan?: ValueCursor;
          direction?: 'ASC' | 'DESC';
        }
      | undefined
  ) {
    return findValuesInRange(this.tupleOperator, attribute, constraints);
  }

  async findByEAV(
    tupleArgs: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined,
      value?: Value | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByEAV(this.tupleOperator, tupleArgs, direction);
  }
  findByAVE(
    tupleArgs: [
      attribute?: Attribute | undefined,
      value?: Value | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByAVE(this.tupleOperator, tupleArgs, direction);
  }
  // findByVAE(
  //   tupleArgs: [
  //     value?: Value | undefined,
  //     attribute?: Attribute | undefined,
  //     entityId?: string | undefined
  //   ],
  //   direction?: 'ASC' | 'DESC' | undefined
  // ): Promise<TripleRow[]> {
  //   return findByVAE(this.tupleOperator, tupleArgs, direction);
  // }
  async findByEntity(id?: string | undefined): Promise<TripleRow[]> {
    return findByEntity(this.tupleOperator, id);
  }
  async findByEntityAttribute(
    id: string,
    attribute: Attribute
  ): Promise<TripleRow[]> {
    return findByEntityAttribute(this.tupleOperator, id, attribute);
  }
  async findByAttribute(attribute: Attribute): Promise<TripleRow[]> {
    return findByAttribute(this.tupleOperator, attribute);
  }
  // async findByValue(value: Value): Promise<TripleRow[]> {
  //   return findByValue(this.tupleOperator, value);
  // }

  getEntity(entityId: string) {
    return getEntity(this.tupleOperator, entityId);
  }

  getEntities(collectionName: string) {
    return getEntities(this.tupleOperator, collectionName);
  }

  // async commit(): Promise<void> {
  //   if (this.isCanceled) {
  //     console.warn('Cannot commit already canceled transaction.');
  //     return;
  //   }
  //   await this.tupleOperator.commit();
  // }

  // async cancel(): Promise<void> {
  //   if (this.isCanceled) {
  //     console.warn('Attempted to cancel already canceled transaction.');
  //     return;
  //   }
  //   await this.tupleOperator.cancel();
  //   this.isCanceled = true;
  // }

  findMaxTimestamp(clientId: string) {
    return findMaxTimestamp(this.tupleOperator, clientId);
  }

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte' | 'eq',
    timestamp: Timestamp | undefined
  ) {
    return findByClientTimestamp(
      this.tupleOperator,
      clientId,
      scanDirection,
      timestamp
    );
  }

  async insertTriple(tripleRow: TripleRow): Promise<void> {
    await this.insertTriples([tripleRow]);
  }

  async insertTriples(
    triplesInput: TripleRow[],
    shouldValidate = true
  ): Promise<void> {
    if (!triplesInput.length) return;
    for (const hook of this.hooks.before) {
      await hook(triplesInput, this);
    }
    for (const triple of triplesInput) {
      if (triple.value === undefined) {
        throw new Error("Cannot use 'undefined' as a value");
      }
      await this.addTripleToIndex(this.tupleOperator, triple, shouldValidate);
    }
  }

  private async addTripleToIndex(
    tx: ScopedMultiTupleOperator<TupleIndex>,
    tripleInput: TripleRow,
    shouldValidate = true
  ) {
    const { id: id, attribute, value, timestamp, expired } = tripleInput;

    if (expired) {
      console.info('Skipping index for expired triple');
      return;
    }

    // If we already have this triple, skip it (performance optimization)
    // This does add another binary search, so might be worth patching tuple-db to let us do this in tx.set()
    if (await tx.exists(['EAV', id, attribute, value, timestamp])) {
      console.warn("inserting triple that's already in the db");
      return;
    }

    const metadata = { expired };

    tx.set(['EAV', id, attribute, value, timestamp], metadata);
    tx.set(['AVE', attribute, value, id, timestamp], metadata);
    // // tx.set(['VAE', value, attribute, id, timestamp], metadata);
    tx.set(
      ['clientTimestamp', timestamp[1], timestamp, id, attribute, value],
      metadata
    );
  }

  async deleteTriple(trip: TripleRow) {
    this.deleteTriples([trip]);
  }

  async deleteTriples(triples: TripleRow[]) {
    const tx = this.tupleOperator;
    for (const triple of triples) {
      const { id: id, attribute, value, timestamp } = triple;
      tx.remove(['EAV', id, attribute, value, timestamp]);
      tx.remove(['AVE', attribute, value, id, timestamp]);
      tx.remove(['VAE', value, attribute, id, timestamp]);
      tx.remove([
        'clientTimestamp',
        timestamp[1],
        timestamp,
        id,
        attribute,
        value,
      ]);
    }
  }

  async readMetadataTuples(entityId: string, attribute?: Attribute) {
    const tuples = await this.tupleOperator.scan({
      prefix: ['metadata', entityId, ...(attribute ?? [])],
    });

    return tuples.map(mapStaticTupleToEAV);
  }

  async updateMetadataTuples(updates: EAV[]) {
    for (const [entityId, attribute, value] of updates) {
      this.tupleOperator.set(['metadata', entityId, ...attribute], value);
    }
    await Promise.all(
      [...this.txMetadataListeners].map((cb) => cb({ updates, deletes: [] }))
    );
  }

  async deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ) {
    for (const [entityId, attribute] of deletes) {
      (
        await this.tupleOperator.scan({
          prefix: ['metadata', entityId, ...(attribute ?? [])],
        })
      ).forEach((tuple) => this.tupleOperator.remove(tuple.key));
    }
    await Promise.all(
      [...this.txMetadataListeners].map((cb) => cb({ updates: [], deletes }))
    );
  }

  onMetadataChange(callback: MetadataListener) {
    this.txMetadataListeners.add(callback);
    return () => {
      this.txMetadataListeners.delete(callback);
    };
  }

  async setValue(id: EntityId, attribute: Attribute, value: Value) {
    if (value === undefined) {
      throw new Error("Cannot use 'undefined' as a value");
    }
    const timestamp = await this.getTransactionTimestamp();
    const existingTriples = await this.findByEntityAttribute(id, attribute);
    const olderTriples = existingTriples.filter(
      ({ timestamp, expired }) =>
        timestampCompare(timestamp, timestamp) == -1 && !expired
    );

    await this.deleteTriples(olderTriples);

    const newerTriples = existingTriples.filter(
      ({ timestamp }) => timestampCompare(timestamp, timestamp) == 1
    );
    if (newerTriples.length === 0) {
      await this.insertTriples([
        { id, attribute, value, timestamp, expired: false },
      ]);
    }
  }

  async expireEntityAttribute(id: EntityId, attribute: Attribute) {
    const timestamp = await this.getTransactionTimestamp();
    const existingTriples = await this.findByEntityAttribute(id, attribute);
    await this.deleteTriples(existingTriples);
    await this.insertTriples([
      { id, attribute, value: null, timestamp, expired: true },
    ]);
  }
}

export class TripleStoreTransaction extends TripleStoreOperator {
  tupleTx: MultiTupleTransaction<TupleIndex>;

  constructor({
    tupleTx,
    clock,
    hooks,
  }: {
    tupleTx: MultiTupleTransaction<TupleIndex>;
    clock: Clock;
    hooks: {
      before: ((
        triple: TripleRow[],
        tx: TripleStoreTransaction
      ) => void | Promise<void>)[];
    };
  }) {
    super({ tupleOperator: tupleTx, clock, hooks });
    this.tupleTx = tupleTx;
  }

  async commit(): Promise<void> {
    await this.tupleTx.commit();
  }

  async cancel(): Promise<void> {
    await this.tupleTx.cancel();
  }

  withScope(scope: StorageScope) {
    return new TripleStoreOperator({
      tupleOperator: this.tupleTx.withScope(scope),
      clock: this.clock,
      hooks: this.hooks,
    });
  }

  beforeInsert(
    callback: (
      triples: TripleRow[],
      tx: TripleStoreTransaction
    ) => void | Promise<void>
  ) {
    this.hooks.before.push(callback);
  }
}

export class TripleStore implements TripleStoreApi {
  stores: Record<
    string,
    AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>
  >;
  storageScope: string[];
  tupleStore: MultiTupleStore<TupleIndex>;
  clock: Clock;
  tenantId: string;
  hooks: {
    before: ((
      triple: TripleRow[],
      tx: TripleStoreTransaction
    ) => void | Promise<void>)[];
  };

  constructor({
    storage,
    stores,
    tenantId,
    clock,
    storageScope = [],
  }: {
    storage?:
      | (TupleStorageApi | AsyncTupleStorageApi)
      | Record<string, TupleStorageApi | AsyncTupleStorageApi>;
    stores?: Record<
      string,
      AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>
    >;
    tenantId?: string;
    storageScope?: string[];
    clock?: Clock;
  }) {
    this.hooks = {
      before: [],
    };
    if (!stores && !storage)
      throw new Error('Must provide either storage or stores');
    if (stores && storage)
      throw new Error('Cannot provide both storage and stores');

    this.storageScope = storageScope;
    let normalizedStores;
    if (stores) {
      normalizedStores = stores;
    } else {
      const confirmedStorage = storage!;
      normalizedStores = isTupleStorage(confirmedStorage)
        ? {
            primary: new AsyncTupleDatabaseClient<
              WithTenantIdPrefix<TupleIndex>
            >(new AsyncTupleDatabase(confirmedStorage)),
          }
        : Object.fromEntries(
            Object.entries(confirmedStorage).map(([k, v]) => [
              k,
              new AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>(
                new AsyncTupleDatabase(v)
              ),
            ])
          );
    }
    // Server side database should provide a tenantId (project id)
    this.stores = normalizedStores;
    this.tenantId = tenantId ?? 'client';
    this.tupleStore = new MultiTupleStore<WithTenantIdPrefix<TupleIndex>>({
      storage: normalizedStores,
    }).subspace([this.tenantId]) as MultiTupleStore<TupleIndex>;

    this.clock = clock ?? new MemoryClock();
    this.clock.assignToStore(this);
  }

  beforeInsert(
    callback: (
      triples: TripleRow[],
      tx: TripleStoreTransaction
    ) => void | Promise<void>
  ) {
    this.hooks.before.push(callback);
  }

  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByCollection(this.tupleStore, collection, direction);
  }

  async findValuesInRange(
    attribute: Attribute,
    constraints:
      | {
          greaterThan?: ValueCursor;
          lessThan?: ValueCursor;
          direction?: 'ASC' | 'DESC';
        }
      | undefined
  ) {
    return findValuesInRange(this.tupleStore, attribute, constraints);
  }

  findByEAV(
    [entityId, attribute, value]: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined,
      value?: Value | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByEAV(this.tupleStore, [entityId, attribute, value], direction);
  }
  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute | undefined,
      value?: Value | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByAVE(this.tupleStore, [attribute, value, entityId], direction);
  }
  // findByVAE(
  //   [value, attribute, entityId]: [
  //     value?: Value | undefined,
  //     attribute?: Attribute | undefined,
  //     entityId?: string | undefined
  //   ],
  //   direction?: 'ASC' | 'DESC' | undefined
  // ): Promise<TripleRow[]> {
  //   return findByVAE(this.tupleStore, [value, attribute, entityId], direction);
  // }
  findByEntity(id?: string | undefined): Promise<TripleRow[]> {
    return findByEntity(this.tupleStore, id);
  }
  findByEntityAttribute(
    id: string,
    attribute: Attribute
  ): Promise<TripleRow[]> {
    return findByEntityAttribute(this.tupleStore, id, attribute);
  }
  findByAttribute(attribute: Attribute): Promise<TripleRow[]> {
    return findByAttribute(this.tupleStore, attribute);
  }
  // findByValue(value: Value): Promise<TripleRow[]> {
  //   return findByValue(this.tupleStore, value);
  // }

  getEntity(entityId: string) {
    return getEntity(this.tupleStore, entityId);
  }

  getEntities(collectionName: string) {
    return getEntities(this.tupleStore, collectionName);
  }

  findMaxTimestamp(clientId: string) {
    return findMaxTimestamp(this.tupleStore, clientId);
  }

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte' | 'eq',
    timestamp: Timestamp | undefined
  ) {
    return findByClientTimestamp(
      this.tupleStore,
      clientId,
      scanDirection,
      timestamp
    );
  }

  async transact(
    callback: (tx: TripleStoreTransaction) => Promise<void>,
    scope?: Parameters<typeof this.tupleStore.transact>[0]
  ) {
    let isCanceled = false;
    const tx = await this.tupleStore.autoTransact(async (tupleTx) => {
      const tx = new TripleStoreTransaction({
        tupleTx: tupleTx,
        clock: this.clock,
        hooks: this.hooks,
      });
      if (isCanceled) return tx;
      try {
        await callback(tx);
      } catch (e) {
        if (e instanceof WriteRuleError) {
          isCanceled = true;
          await tx.cancel();
        }
        throw e;
      }
      return tx;
    }, scope);
    return tx.assignedTimestamp
      ? JSON.stringify(tx.assignedTimestamp)
      : undefined;
  }

  setStorageScope(storageKeys: (keyof typeof this.stores)[]) {
    return new TripleStore({
      stores: Object.fromEntries(
        Object.entries(this.stores).filter(([storagekey]) =>
          storageKeys.includes(storagekey as keyof typeof this.stores)
        )
      ),
      storageScope: storageKeys,
      tenantId: this.tenantId,
      clock: this.clock,
    });
  }

  async setValue(
    entity: string,
    attribute: Attribute,
    value: Value
  ): Promise<void> {
    await this.transact(async (tx) => {
      await tx.setValue(entity, attribute, value);
    });
  }

  async insertTriple(tripleRow: TripleRow) {
    await this.transact(async (tx) => {
      await tx.insertTriple(tripleRow);
    });
  }

  async insertTriples(triplesInput: TripleRow[], shouldValidate = true) {
    await this.transact(async (tx) => {
      await tx.insertTriples(triplesInput, shouldValidate);
    });
  }

  onInsert(callback: (triples: TripleRow[]) => void) {
    function writesCallback(writes: WriteOps<TupleIndex>) {
      const { set = [] } = writes;
      if (set.length === 0) return;
      const triples = set.map((w) => indexToTriple(w));
      callback(triples);
    }
    const unsub = this.tupleStore.subscribe(
      { prefix: ['EAV'] },
      writesCallback
    );
    return () => {
      unsub();
    };
  }

  // Including this as a way to capture any change to the store
  // We need this to have outbox scoped data updates since we directly delete data now
  // This might actually be a use case for tombstones
  // This also handles rolling back on outbox deletes
  onWrite(
    callback: (writes: { inserts: TripleRow[]; deletes: TripleRow[] }) => void
  ) {
    function writesCallback(writes: WriteOps<TupleIndex>) {
      const { set = [], remove = [] } = writes;
      if (set.length === 0 && remove.length === 0) return;
      const inserts = set.map((w) => indexToTriple(w));
      const deletes = remove.map((w) =>
        //@ts-ignore
        indexToTriple({ key: w, value: { expired: false } })
      );
      callback({ inserts, deletes });
    }
    const unsub = this.tupleStore.subscribe(
      { prefix: ['EAV'] },
      writesCallback
    );
    return unsub;
  }

  async deleteTriple(triple: TripleRow) {
    await this.transact(async (tx) => {
      await tx.deleteTriples([triple]);
    });
  }

  async deleteTriples(triples: TripleRow[]) {
    await this.transact(async (tx) => {
      await tx.deleteTriples(triples);
    });
  }

  async readMetadataTuples(entityId: string, attribute?: Attribute) {
    return (
      await this.tupleStore.scan({
        prefix: ['metadata', entityId, ...(attribute ?? [])],
      })
    ).map(mapStaticTupleToEAV);
  }

  async updateMetadataTuples(updates: EAV[]) {
    await this.transact(async (tx) => {
      await tx.updateMetadataTuples(updates);
    });
  }

  async deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ) {
    await this.transact(async (tx) => {
      await tx.deleteMetadataTuples(deletes);
    });
  }

  async clear() {
    await this.tupleStore.clear();
  }
}

async function scanToTriples(
  tx: MultiTupleStoreOrTransaction,
  ...scanParams: Parameters<MultiTupleStoreOrTransaction['scan']>
) {
  // console.log(scanParams);
  // @ts-ignore
  return (await tx.scan(...scanParams)).map(indexToTriple);
}

async function findByCollection(
  tx: MultiTupleStoreOrTransaction,
  collectionName: string,
  direction?: 'ASC' | 'DESC'
) {
  return scanToTriples(tx, {
    prefix: ['EAV'],
    gte: [collectionName],
    // @ts-ignore
    lt: [collectionName + MAX],
    reverse: direction === 'DESC',
  });
}

async function findByEAV(
  tx: MultiTupleStoreOrTransaction,
  [entityId, attribute, value]: [
    entityId?: EntityId,
    attribute?: Attribute,
    value?: Value
  ] = [],
  direction?: 'ASC' | 'DESC'
) {
  const scanArgs = {
    prefix: ['EAV'],
    gte: [entityId ?? MIN, attribute ?? MIN, value ?? MIN],
    // @ts-ignore
    lt: [entityId ?? MAX, [...(attribute ?? []), MAX], MAX],
    reverse: direction === 'DESC',
  };
  return scanToTriples(tx, scanArgs);
}

function findByAVE(
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

function findValuesInRange(
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

async function findByEntity(
  tx: MultiTupleStoreOrTransaction,
  id?: EntityId
): Promise<TripleRow[]> {
  return findByEAV(tx, [id]);
}

async function findByEntityAttribute(
  tx: MultiTupleStoreOrTransaction,
  id: EntityId,
  attribute: Attribute
): Promise<TripleRow[]> {
  return findByEAV(tx, [id, attribute]);
}

async function findByAttribute(
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

function mapStaticTupleToEAV(tuple: { key: any[]; value: any }): EAV {
  const [_index, entityId, ...path] = tuple.key;
  return [entityId, path, tuple.value];
}

// NOTE: SOME WEIRD STUFF GOING ON WITH TUPLE DATABASE AND gt/lte with array prefixes
async function findByClientTimestamp(
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

async function getEntity(tx: MultiTupleStoreOrTransaction, entityId: string) {
  const triples = await findByEntity(tx, entityId);
  if (triples.length === 0) return null;
  return triples.reduce(entityToResultReducer, {});
}

async function getEntities(
  tx: MultiTupleStoreOrTransaction,
  collectionName: string
) {
  const triples = await findByCollection(tx, collectionName);
  return triples.reduce((acc, triple) => {
    const { id } = triple;
    const entityObj = acc.get(id) ?? {};
    acc.set(id, entityToResultReducer(entityObj, triple));
    return acc;
  }, new Map());
}

async function findMaxTimestamp(
  tx: MultiTupleStoreOrTransaction,
  clientId: string
): Promise<Timestamp | undefined> {
  const res = (await tx.scan({
    prefix: ['clientTimestamp', clientId],
    reverse: true,
  })) as ClientTimestampIndex[];
  return res[0]?.key[2];
}
