import {
  AsyncTupleDatabaseClient,
  AsyncTupleStorageApi,
  WriteOps,
  AsyncTupleDatabase,
  TupleStorageApi,
} from '@triplit/tuple-database';
import { Timestamp } from './timestamp.js';
import MultiTupleStore, {
  MultiTupleReactivity,
  MultiTupleTransaction,
  StorageScope,
} from './multi-tuple-store.js';
import { Clock } from './clocks/clock.js';
import { MemoryClock } from './clocks/memory-clock.js';
import { TripleStoreOptionsError } from './errors.js';
import { TripleStoreTransaction } from './triple-store-transaction.js';
import {
  EAV,
  TupleIndex,
  TripleStoreHooks,
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
import { TRIPLE_STORE_MIGRATIONS } from './triple-store-migrations.js';
import { TransactionResult } from './query/types/index.js';
import { MirroredArray } from './utils/mirrored-array.js';
import { genToArr } from './utils/generator.js';

function isTupleStorage(object: any): object is AsyncTupleStorageApi {
  if (typeof object !== 'object') return false;
  const storageKeys: (keyof AsyncTupleStorageApi)[] = [
    'close',
    'commit',
    'scan',
  ];
  return storageKeys.every((objKey) => objKey in object);
}

export type ClearOptions = {
  full?: boolean;
};

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
  ): AsyncGenerator<TripleRow>;

  findMaxClientTimestamp(clientId: string): Promise<Timestamp | undefined>;

  findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte',
    timestamp: Timestamp | undefined
  ): AsyncGenerator<TripleRow>;

  findAllClientIds(): Promise<string[]>;

  findByEAT(
    [entityId, attribute]: [entityId?: EntityId, attribute?: Attribute],
    direction?: 'ASC' | 'DESC'
  ): AsyncGenerator<TripleRow>;

  findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute,
      value?: TupleValue,
      entityId?: EntityId
    ],
    direction?: 'ASC' | 'DESC'
  ): AsyncGenerator<TripleRow>;

  findByEntity(id?: EntityId): AsyncGenerator<TripleRow>;

  findByEntityAttribute(
    id: EntityId,
    attribute: Attribute
  ): AsyncGenerator<TripleRow>;

  findByAttribute(attribute: Attribute): AsyncGenerator<TripleRow>;

  findValuesInRange(
    attribute: Attribute,
    constraints: RangeContraints | undefined
  ): AsyncGenerator<TripleRow>;

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
        await scopedTx.set(['AVE', attribute, value, id, timestamp], {
          expired: isExpired,
        });
      }
      await scopedTx.set(
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

export class TripleStore<StoreKeys extends string = any>
  implements TripleStoreApi
{
  storageScope: string[];
  tupleStore: MultiTupleStore<TupleIndex>;
  clock: Clock;
  tenantId: string;
  readonly hooks: TripleStoreHooks;
  private _inheritedHooks: TripleStoreHooks;
  private _ownHooks: TripleStoreHooks;

  constructor({
    tenantId,
    clock,
    reactivity,
    storageScope = [],
    enableGarbageCollection = false,
    ...opts
  }: (
    | {
        storage:
          | (TupleStorageApi | AsyncTupleStorageApi)
          | Record<StoreKeys, TupleStorageApi | AsyncTupleStorageApi>;
      }
    | {
        stores: Record<
          StoreKeys,
          AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>
        >;
      }
    | {
        tupleStore: MultiTupleStore<TupleIndex>;
      }
  ) & {
    reactivity?: MultiTupleReactivity;
    tenantId?: string;
    storageScope?: string[];
    clock?: Clock;
    enableGarbageCollection?: boolean;
    hooks?: TripleStoreHooks;
  }) {
    this._inheritedHooks = opts.hooks ?? {
      beforeCommit: [],
      beforeInsert: [],
      afterCommit: [],
    };
    this._ownHooks = {
      beforeCommit: [],
      beforeInsert: [],
      afterCommit: [],
    };
    this.hooks = {
      beforeCommit: MirroredArray(
        this._inheritedHooks.beforeCommit,
        this._ownHooks.beforeCommit
      ),
      beforeInsert: MirroredArray(
        this._inheritedHooks.beforeInsert,
        this._ownHooks.beforeInsert
      ),
      afterCommit: MirroredArray(
        this._inheritedHooks.afterCommit,
        this._ownHooks.afterCommit
      ),
    };
    this.hooks = {
      beforeCommit: [],
      beforeInsert: [],
      afterCommit: [],
    };

    this.storageScope = storageScope;

    // Server side database should provide a tenantId (project id)
    this.tenantId = tenantId ?? 'client';

    if ('tupleStore' in opts) {
      this.tupleStore = opts.tupleStore;
    } else {
      if (!('stores' in opts) && !('storage' in opts)) {
        throw new TripleStoreOptionsError(
          'Must provide either storage or stores'
        );
      }
      let normalizedStores;
      if ('stores' in opts) {
        normalizedStores = opts.stores;
      } else {
        if (isTupleStorage(opts.storage)) {
          normalizedStores = {
            primary: new AsyncTupleDatabaseClient<
              WithTenantIdPrefix<TupleIndex>
            >(new AsyncTupleDatabase(opts.storage)),
          };
        } else {
          normalizedStores = Object.fromEntries(
            Object.entries(opts.storage).map(([k, v]) => [
              k,
              new AsyncTupleDatabaseClient<WithTenantIdPrefix<TupleIndex>>(
                new AsyncTupleDatabase(v)
              ),
            ])
          );
        }
      }
      this.tupleStore = new MultiTupleStore<WithTenantIdPrefix<TupleIndex>>({
        storage: normalizedStores,
      }).subspace([this.tenantId]) as MultiTupleStore<TupleIndex>;
    }

    this.clock = clock ?? new MemoryClock();
    this.clock.assignToStore(this);

    // this.tupleStore.beforeCommit(addIndexesToTransaction);
  }

  async ensureStorageIsMigrated() {
    for (const migrate of TRIPLE_STORE_MIGRATIONS) {
      await migrate(this.tupleStore);
    }
  }

  beforeInsert(callback: TripleStoreBeforeInsertHook) {
    this.hooks.beforeInsert.push(callback);
    return () => {
      this.hooks.beforeInsert = this.hooks.beforeInsert.filter(
        (cb) => cb !== callback
      );
    };
  }

  beforeCommit(callback: TripleStoreBeforeCommitHook) {
    this.hooks.beforeCommit.push(callback);
    return () => {
      this.hooks.beforeCommit = this.hooks.beforeCommit.filter(
        (cb) => cb !== callback
      );
    };
  }

  afterCommit(callback: TripleStoreAfterCommitHook) {
    this.hooks.afterCommit.push(callback);
    return () => {
      this.hooks.afterCommit = this.hooks.afterCommit.filter(
        (cb) => cb !== callback
      );
    };
  }

  async *findByCollection(
    collection: string,
    direction?: 'ASC' | 'DESC' | undefined
  ) {
    yield* findByCollection(this.tupleStore, collection, direction);
  }

  async *findByEAT(
    [entityId, attribute]: [
      entityId?: string | undefined,
      attribute?: Attribute | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ) {
    yield* findByEAT(this.tupleStore, [entityId, attribute], direction);
  }
  async *findByAVE(
    [attribute, value, entityId]: [
      attribute?: Attribute | undefined,
      value?: TupleValue | undefined,
      entityId?: string | undefined
    ],
    direction?: 'ASC' | 'DESC' | undefined
  ) {
    yield* findByAVE(this.tupleStore, [attribute, value, entityId], direction);
  }

  async *findByEntity(id?: string | undefined) {
    yield* findByEntity(this.tupleStore, id);
  }
  async *findByEntityAttribute(id: string, attribute: Attribute) {
    yield* findByEntityAttribute(this.tupleStore, id, attribute);
  }
  async *findByAttribute(attribute: Attribute) {
    yield* findByAttribute(this.tupleStore, attribute);
  }

  async *findValuesInRange(
    attribute: Attribute,
    constraints: RangeContraints | undefined
  ) {
    yield* findValuesInRange(this.tupleStore, attribute, constraints);
  }

  findMaxClientTimestamp(clientId: string) {
    return findMaxClientTimestamp(this.tupleStore, clientId);
  }

  findAllClientIds() {
    return findAllClientIds(this.tupleStore);
  }

  async *findByClientTimestamp(
    clientId: string,
    scanDirection: 'lt' | 'lte' | 'gt' | 'gte' | 'eq',
    timestamp: Timestamp | undefined
  ) {
    yield* findByClientTimestamp(
      this.tupleStore,
      clientId,
      scanDirection,
      timestamp
    );
  }

  async transact<Output>(
    callback: (tx: TripleStoreTransaction) => Promise<Output>,
    scope?: StorageScope
  ): Promise<TransactionResult<Output>> {
    const { tx, output } = await this.tupleStore.autoTransact(
      async (tupleTx) => {
        tupleTx.beforeCommit(addIndexesToTransaction);
        tupleTx.beforeScan(async (args, tx) => {
          // We scan when checking write rules and repeated indexing is a bottleneck on large inserts
          // This is a bandaid fix, but we should try to prevent repeated indexing
          if (args!.prefix[0] === 'EAT') return;
          await addIndexesToTransaction(tx);
        });
        const tx = new TripleStoreTransaction({
          tupleTx: tupleTx,
          clock: this.clock,
          hooks: this.hooks,
        });
        let output: Output | undefined;
        if (tx.isCanceled) return { tx, output };
        try {
          output = await callback(tx);
        } catch (e) {
          await tx.cancel();
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
      isCanceled: tx.isCanceled,
    };
  }

  setStorageScope(storageKeys: StoreKeys[]) {
    return new TripleStore({
      tupleStore: this.tupleStore.withStorageScope({
        read: [...storageKeys],
        write: [...storageKeys],
      }),
      storageScope: storageKeys,
      tenantId: this.tenantId,
      clock: this.clock,
      hooks: this.hooks,
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
              indexToTriple(
                // @ts-expect-error
                {
                  key: w,
                  value: { expired: false },
                }
              )
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
      await genToArr(
        this.tupleStore.scan({
          prefix: ['metadata', entityId, ...(attribute ?? [])],
        })
      )
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

  async clear({ full }: ClearOptions = {}) {
    if (full) {
      await this.tupleStore.clear();
    } else {
      // Load metadata for restore
      const restoreData: Record<
        string,
        {
          synced: TripleRow[];
          local: TupleIndex[];
        }
      > = {};

      const writeKeys =
        this.tupleStore.storageScope?.write ??
        Object.keys(this.tupleStore.storage);

      // For each write key, retrieve data to keep, clear, then write data back
      for (const storageKey of writeKeys) {
        const scopedTripleStore = this.setStorageScope([
          storageKey as StoreKeys,
        ]);
        const syncedMetadata = await genToArr(
          scopedTripleStore.findByCollection('_metadata')
        );
        const localMetadataScan = await genToArr(
          scopedTripleStore.tupleStore.scan({
            prefix: ['metadata'],
          })
        );
        restoreData[storageKey] = {
          synced: syncedMetadata,
          local: localMetadataScan,
        };
      }
      await this.tupleStore.clear();
      // Restore metadata
      await this.transact(async (tx) => {
        for (const [
          storageKey,
          { synced: syncedMetadataScan, local: localMetadataScan },
        ] of Object.entries(restoreData)) {
          const scopedTx = tx.withScope({
            read: [storageKey],
            write: [storageKey],
          });
          for (const triple of syncedMetadataScan) {
            await scopedTx.insertTriple(triple);
          }
          for (const kv of localMetadataScan) {
            await scopedTx.tupleTx.set(kv.key, kv.value);
          }
        }
      });
    }

    // Inform listeners
    for (const callback of this.onClearCallbacks) {
      await callback();
    }
  }

  onClear(callback: () => void | Promise<void>) {
    this.onClearCallbacks.push(callback);
    return () => {
      this.onClearCallbacks = this.onClearCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  private onClearCallbacks: (() => void | Promise<void>)[] = [];
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
