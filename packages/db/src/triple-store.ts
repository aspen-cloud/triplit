import {
  AsyncTupleDatabaseClient,
  AsyncTupleStorageApi,
  WriteOps,
  AsyncTupleDatabase,
  TupleStorageApi,
  compareTuple,
} from '@triplit/tuple-database';
import { Timestamp } from './timestamp.js';
import MultiTupleStore, {
  MultiTupleReactivity,
  MultiTupleTransaction,
  StorageScope,
} from './multi-tuple-store.js';
import { Clock } from './clocks/clock.js';
import { MemoryClock } from './clocks/memory-clock.js';
import { TripleStoreOptionsError, WriteRuleError } from './errors.js';
import { TripleStoreTransaction } from './triple-store-transaction.js';
import {
  EAV,
  TupleIndex,
  TripleStoreHooks,
  TripleMetadata,
  EATIndex,
  TripleStoreBeforeInsertHook,
  findByEntity,
  findByEntityAttribute,
  findByAttribute,
  findMaxClientTimestamp,
  findByClientTimestamp,
  indexToTriple,
  TripleRow,
  EntityId,
  Attribute,
  WithTenantIdPrefix,
  findByCollection,
  findByAVE,
  findByEAT,
  TupleValue,
  findValuesInRange,
  mapStaticTupleToEAV,
  TripleStoreBeforeCommitHook,
  TripleStoreAfterCommitHook,
  findAllClientIds,
  RangeContraints,
  AVEIndex,
} from './triple-store-utils.js';
import { copyHooks } from './utils.js';
import { TRIPLE_STORE_MIGRATIONS } from './triple-store-migrations.js';

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
  insertTriple(tripleRow: TripleRow): Promise<void>;
  insertTriples(triplesInput: TripleRow[]): Promise<void>;
  deleteTriple(tripleRow: TripleRow): Promise<void>;
  deleteTriples(triplesInput: TripleRow[]): Promise<void>;
  setValue(...value: EAV): Promise<void>;
  setValues(values: EAV[]): Promise<void>;
  expireEntity(id: EntityId): Promise<void>;
  expireEntityAttribute(id: EntityId, attribute: Attribute): Promise<void>;
  expireEntityAttributes(
    values: { id: EntityId; attribute: Attribute }[]
  ): Promise<void>;

  // Read methods
  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;
  findMaxClientTimestamp(clientId: string): Promise<Timestamp | undefined>;
  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ): Promise<TripleRow[]>;
  findAllClientIds(): Promise<string[]>;

  findByEAT(
    [entityId, attribute]: [entityId?: EntityId, attribute?: Attribute],
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;

  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute,
      value?: TupleValue,
      entityId?: EntityId
    ],
    direction?: 'ASC' | 'DESC'
  ): Promise<TripleRow[]>;

  findByEntity(id?: EntityId): Promise<TripleRow[]>;

  findByEntityAttribute(
    id: EntityId,
    attribute: Attribute
  ): Promise<TripleRow[]>;

  findByAttribute(attribute: Attribute): Promise<TripleRow[]>;

  findValuesInRange(
    attribute: Attribute,
    constraints: RangeContraints | undefined
  ): Promise<TripleRow[]>;

  // metadata operations
  readMetadataTuples(entityId: string, attribute?: Attribute): Promise<EAV[]>;
  updateMetadataTuples(updates: EAV[]): Promise<void>;
  deleteMetadataTuples(
    deletes: [entityId: string, attribute?: Attribute][]
  ): Promise<void>;
}

type RemoveFirstFromTuple<T extends any[]> = T['length'] extends 0
  ? never
  : ((...b: T) => void) extends (a: any, ...b: infer I) => void
  ? I
  : [];

async function addIndexesToTransaction(
  tupleTx: MultiTupleTransaction<TupleIndex>
) {
  // Add AVE and clientTimestamp indexes for each EAV insert
  for (const [store, writes] of Object.entries(tupleTx.writes)) {
    const { set = [] } = writes;
    if (set.length === 0) continue;
    const scopedTx = tupleTx.withScope({ read: [store], write: [store] });

    // NOTE: based on the current implementation of the tuple store, it's faster to perform removes at the end
    let expiredAVE: AVEIndex['key'][] = [];

    // To maintain interactivity on large inserts, we should batch these
    for (const { key, value: tupleValue } of set.slice()) {
      const [_client, indexType, ...indexKey] = key;
      if (indexType !== 'EAT') continue;

      const [id, attribute, timestamp] = indexKey as RemoveFirstFromTuple<
        EATIndex['key']
      >;
      const [value, isExpired] = tupleValue;
      if (isExpired) {
        expiredAVE.push(['AVE', attribute, value, id, timestamp]);
      } else {
        scopedTx.set(['AVE', attribute, value, id, timestamp], {
          expired: isExpired,
        });
      }
      scopedTx.set(
        [
          'clientTimestamp',
          (timestamp as Timestamp)[1],
          timestamp,
          id,
          attribute,
          value,
        ],
        {
          expired: isExpired,
        }
      );
    }

    for (const tuple of expiredAVE) {
      scopedTx.remove(tuple);
    }
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
  hooks: TripleStoreHooks;
  reactivity: MultiTupleReactivity;

  constructor({
    storage,
    stores,
    tenantId,
    clock,
    reactivity,
    storageScope = [],
    enableGarbageCollection = false,
  }: {
    storage?:
      | (TupleStorageApi | AsyncTupleStorageApi)
      | Record<string, TupleStorageApi | AsyncTupleStorageApi>;
    stores?: Record<
      string,
      AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>
    >;
    reactivity?: MultiTupleReactivity;
    tenantId?: string;
    storageScope?: string[];
    clock?: Clock;
    enableGarbageCollection?: boolean;
  }) {
    this.hooks = {
      beforeCommit: [],
      beforeInsert: [],
      afterCommit: [],
    };
    if (!stores && !storage)
      throw new TripleStoreOptionsError(
        'Must provide either storage or stores'
      );
    if (stores && storage)
      throw new TripleStoreOptionsError(
        'Cannot provide both storage and stores'
      );

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
    this.reactivity = reactivity ?? new MultiTupleReactivity();
    this.tupleStore = new MultiTupleStore<WithTenantIdPrefix<TupleIndex>>({
      storage: normalizedStores,
      reactivity: this.reactivity,
    }).subspace([this.tenantId]) as MultiTupleStore<TupleIndex>;

    this.clock = clock ?? new MemoryClock();
    this.clock.assignToStore(this);

    this.tupleStore.beforeCommit(addIndexesToTransaction);

    if (enableGarbageCollection) {
      this.afterCommit(
        throttle(() => {
          this.collectGarbage();
        }, 1000)
      );
    }
  }

  async ensureStorageIsMigrated() {
    for (const migrate of TRIPLE_STORE_MIGRATIONS) {
      await migrate(this.tupleStore);
    }
  }

  beforeInsert(callback: TripleStoreBeforeInsertHook) {
    this.hooks.beforeInsert.push(callback);
  }

  beforeCommit(callback: TripleStoreBeforeCommitHook) {
    this.hooks.beforeCommit.push(callback);
  }

  afterCommit(callback: TripleStoreAfterCommitHook) {
    this.hooks.afterCommit.push(callback);
  }

  findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByCollection(this.tupleStore, collection, direction);
  }

  findByEAT(
    [entityId, attribute]: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByEAT(this.tupleStore, [entityId, attribute], direction);
  }
  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute | undefined,
      value?: TupleValue | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ): Promise<TripleRow[]> {
    return findByAVE(this.tupleStore, [attribute, value, entityId], direction);
  }

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

  async findValuesInRange(
    attribute: Attribute,
    constraints: RangeContraints | undefined
  ) {
    return findValuesInRange(this.tupleStore, attribute, constraints);
  }

  findMaxClientTimestamp(clientId: string) {
    return findMaxClientTimestamp(this.tupleStore, clientId);
  }

  findAllClientIds() {
    return findAllClientIds(this.tupleStore);
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

  async transact<Output>(
    callback: (tx: TripleStoreTransaction) => Promise<Output>,
    scope?: StorageScope
  ) {
    let isCanceled = false;
    const { tx, output } = await this.tupleStore.autoTransact(
      async (tupleTx) => {
        tupleTx.beforeScan(async (args, tx) => {
          // We scan when checking write rules and repeated indexing is a bottleneck on large inserts
          // This is a bandaid fix, but we should try to prevent repeated indexing
          if (args!.prefix[0] === 'EAT') return;
          await addIndexesToTransaction(tx);
        });
        const tx = new TripleStoreTransaction({
          tupleTx: tupleTx,
          clock: this.clock,
          hooks: copyHooks(this.hooks),
        });
        let output: Output | undefined;
        if (isCanceled) return { tx, output };
        try {
          output = await callback(tx);
        } catch (e) {
          if (e instanceof WriteRuleError) {
            isCanceled = true;
            await tx.cancel();
          }
          throw e;
        }
        return { tx, output };
      },
      scope
    );
    return {
      txId: tx.assignedTimestamp
        ? JSON.stringify(tx.assignedTimestamp)
        : undefined,
      output,
    };
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
      reactivity: this.reactivity,
    });
  }

  async setValue(
    entity: string,
    attribute: Attribute,
    value: TupleValue
  ): Promise<void> {
    await this.transact(async (tx) => {
      await tx.setValue(entity, attribute, value);
    });
  }

  async setValues(values: EAV[]): Promise<void> {
    await this.transact(async (tx) => {
      await tx.setValues(values);
    });
  }

  async expireEntity(id: string) {
    await this.transact(async (tx) => {
      await tx.expireEntity(id);
    });
  }

  async expireEntityAttribute(id: string, attribute: Attribute) {
    await this.transact(async (tx) => {
      await tx.expireEntityAttribute(id, attribute);
    });
  }

  async expireEntityAttributes(values: { id: string; attribute: Attribute }[]) {
    await this.transact(async (tx) => {
      await tx.expireEntityAttributes(values);
    });
  }

  async insertTriple(tripleRow: TripleRow) {
    await this.transact(async (tx) => {
      await tx.insertTriple(tripleRow);
    });
  }

  async insertTriples(triplesInput: TripleRow[]) {
    await this.transact(async (tx) => {
      await tx.insertTriples(triplesInput);
    });
  }

  onInsert(
    callback: (inserts: Record<string, TripleRow[]>) => void | Promise<void>
  ) {
    async function writesCallback(
      storeWrites: Record<string, WriteOps<TupleIndex>>
    ) {
      const mappedInserts = Object.fromEntries(
        Object.entries(storeWrites)
          .filter(([_store, writes]) => {
            const { set = [] } = writes;
            return set.length > 0;
          })
          .map(([store, writes]) => {
            const { set = [] } = writes;
            const inserts = set.map((w) => indexToTriple(w));
            return [store, inserts];
          })
      );

      await callback(mappedInserts);
    }
    const unsub = this.tupleStore.subscribe(
      { prefix: ['EAT'] },
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
    callback: (
      writes: Record<string, { inserts: TripleRow[]; deletes: TripleRow[] }>
    ) => void | Promise<void>
  ) {
    async function writesCallback(
      storeWrites: Record<string, WriteOps<TupleIndex>>
    ) {
      const mappedWrites = Object.fromEntries(
        Object.entries(storeWrites)
          .filter(([_store, writes]) => {
            const { set = [], remove = [] } = writes;
            return set.length > 0 || remove.length > 0;
          })
          .map(([store, writes]) => {
            const { set = [], remove = [] } = writes;
            const inserts = set.map((w) => indexToTriple(w));
            const deletes = remove.map((w) =>
              //@ts-ignore
              indexToTriple({ key: w, value: { expired: false } })
            );
            return [store, { inserts, deletes }];
          })
      );

      await callback(mappedWrites);
    }
    const unsub = this.tupleStore.subscribe(
      { prefix: ['EAT'] },
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

  async collectGarbage() {
    const allTriples = await this.findByEAT([]);
    const triplesToDelete = [];
    let currentEntityId: string | null = null;
    let currentAttribute: any = [];
    for (let i = allTriples.length - 1; i >= 0; i--) {
      const triple = allTriples[i];
      if (
        triple.id === currentEntityId &&
        compareTuple(triple.attribute, currentAttribute) === 0
      ) {
        triplesToDelete.push(triple);
        continue;
      }
      currentEntityId = triple.id;
      currentAttribute = triple.attribute;
    }
    await this.deleteTriples(triplesToDelete);
  }
}

function throttle(callback: () => void, delay: number) {
  let wait = false;
  let refire = false;
  function refireOrReset() {
    if (refire) {
      callback();
      refire = false;
      setTimeout(refireOrReset, delay);
    } else {
      wait = false;
    }
  }
  return function () {
    if (!wait) {
      callback();
      wait = true;
      setTimeout(refireOrReset, delay);
    } else {
      refire = true;
    }
  };
}
