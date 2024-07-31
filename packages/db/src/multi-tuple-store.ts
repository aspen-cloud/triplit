import {
  KeyValuePair,
  ScanArgs,
  Tuple,
  AsyncTupleDatabaseClient,
  AsyncTupleRootTransactionApi,
  Unsubscribe,
  transactionalReadWriteAsync,
  WriteOps,
} from '@triplit/tuple-database';
import { compareTuple } from '@triplit/tuple-database/helpers/compareTuple.js';
import {
  TuplePrefix,
  TupleToObject,
  RemoveTupleValuePairPrefix,
} from '@triplit/tuple-database/database/typeHelpers';
import { DBScanFailureError, NotImplementedError } from './errors.js';
import { MirroredArray } from './utils/mirrored-array.js';

export type StorageScope = {
  read?: string[];
  write?: string[];
};

export type TransactionScope<TupleSchema extends KeyValuePair> = {
  read: AsyncTupleRootTransactionApi<TupleSchema>[];
  write: AsyncTupleRootTransactionApi<TupleSchema>[];
};

type MultiTupleStoreBeforeCommitHook<TupleSchema extends KeyValuePair> = (
  tx: MultiTupleTransaction<TupleSchema>
) => void | Promise<void>;

type MultiTupleStoreBeforeInsertHook<TupleSchema extends KeyValuePair> = (
  tuple: TupleSchema,
  tx: MultiTupleTransaction<TupleSchema>
) => void | Promise<void>;

type MultiTupleStoreBeforeScanHook<TupleSchema extends KeyValuePair> = (
  scanArgs: ScanArgs<any, any> | undefined,
  tx: MultiTupleTransaction<TupleSchema>
) => void | Promise<void>;

type MultiTupleStoreAfterCommitHook<TupleSchema extends KeyValuePair> = (
  tx: MultiTupleTransaction<TupleSchema>
) => void | Promise<void>;

type MultiTupleStoreHooks<TupleSchema extends KeyValuePair> = {
  // Runs before committing a transaction
  beforeCommit: MultiTupleStoreBeforeCommitHook<TupleSchema>[];
  // Runs before setting a tuple value in a transaction
  beforeInsert: MultiTupleStoreBeforeInsertHook<TupleSchema>[];
  // Runs before any scan operation
  beforeScan: MultiTupleStoreBeforeScanHook<TupleSchema>[];
  // Runs after committing a transaction (notably different from reactivity hooks, which are fire and forget in the event loop)
  afterCommit: MultiTupleStoreAfterCommitHook<TupleSchema>[];
};

export default class MultiTupleStore<TupleSchema extends KeyValuePair> {
  readonly storageScope?: StorageScope;
  storage: Record<string, AsyncTupleDatabaseClient<TupleSchema>>;
  readonly hooks: MultiTupleStoreHooks<TupleSchema>;
  private _inheritedHooks: MultiTupleStoreHooks<TupleSchema>;
  private _ownHooks: MultiTupleStoreHooks<TupleSchema>;
  reactivity: MultiTupleReactivity;
  // subspacePrefix: Tuple;

  constructor({
    storage,
    storageScope,
    hooks,
    reactivity,
  }: {
    storage: Record<string, AsyncTupleDatabaseClient<TupleSchema>>;
    storageScope?: { read?: string[]; write?: string[] };
    hooks?: MultiTupleStoreHooks<TupleSchema>;
    reactivity?: MultiTupleReactivity;
  }) {
    this.storage = storage;
    this.storageScope = storageScope;
    this._inheritedHooks = hooks ?? {
      beforeCommit: [],
      beforeInsert: [],
      beforeScan: [],
      afterCommit: [],
    };
    this._ownHooks = {
      beforeCommit: [],
      beforeInsert: [],
      beforeScan: [],
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
      beforeScan: MirroredArray(
        this._inheritedHooks.beforeScan,
        this._ownHooks.beforeScan
      ),
      afterCommit: MirroredArray(
        this._inheritedHooks.afterCommit,
        this._ownHooks.afterCommit
      ),
    };
    this.reactivity = reactivity ?? new MultiTupleReactivity();
  }

  withStorageScope(scope: StorageScope) {
    return new MultiTupleStore({
      storage: this.storage,
      storageScope: scope,
      hooks: this.hooks,
      reactivity: this.reactivity,
    });
  }

  getStorageClients(context?: 'read' | 'write') {
    if (context && this.storageScope && this.storageScope[context]) {
      return this.storageScope[context]!.map(
        (storageKey) => this.storage[storageKey]
      );
    }
    return Object.values(this.storage);
  }

  getStorageClientsEntries(context?: 'read' | 'write') {
    if (context && this.storageScope && this.storageScope[context]) {
      return this.storageScope[context]!.map(
        (storageKey) => [storageKey, this.storage[storageKey]] as const
      );
    }
    return Object.entries(this.storage);
  }

  beforeInsert(callback: MultiTupleStoreBeforeInsertHook<TupleSchema>) {
    this._ownHooks.beforeInsert.push(callback);
  }

  beforeCommit(callback: MultiTupleStoreBeforeCommitHook<TupleSchema>) {
    this._ownHooks.beforeCommit.push(callback);
  }

  afterCommit(callback: MultiTupleStoreAfterCommitHook<TupleSchema>) {
    this._ownHooks.afterCommit.push(callback);
  }

  beforeScan(callback: MultiTupleStoreBeforeScanHook<TupleSchema>) {
    this._ownHooks.beforeScan.push(callback);
  }

  async scan<T extends Tuple, P extends TuplePrefix<T>>(
    args?: ScanArgs<T, P> | undefined,
    txId?: string | undefined
  ): Promise<Extract<TupleSchema, { key: TupleToObject<P> }>[]> {
    const storages = this.getStorageClients('read');

    const comparer = (a: TupleSchema, b: TupleSchema) =>
      (compareTuple(a.key, b.key) * (args?.reverse ? -1 : 1)) as 1 | -1 | 0;

    return mergeMultipleSortedArrays(
      await Promise.all(storages.map((store) => store.scan(args, txId))),
      comparer
    );
  }

  subscribe<T extends Tuple, P extends TuplePrefix<T>>(
    args: ScanArgs<T, P>,
    callback: MultiTupleReactivityCallback<TupleSchema>
  ): Unsubscribe {
    const unsubFuncs = this.getStorageClientsEntries('read').map(
      ([storeId, store]) =>
        store.subscribe(args, (writeOps, txId) => {
          const reactivityId = this.reactivity.getReactivityId(storeId, txId);
          if (!reactivityId) {
            // Shouldnt happen, but problematic if it does (we're not tracking updates properly)
            console.warn('Not tracking reactivity for', storeId, txId);
            return;
          }
          this.reactivity.updateCallback(
            reactivityId,
            callback,
            writeOps,
            storeId,
            txId
          );
        })
    );
    return () => {
      Promise.all(unsubFuncs).then((unsubs) =>
        unsubs.forEach((unsub) => unsub())
      );
      // TODO: clean up reactivity
    };
  }

  // get<T extends Tuple>(
  //   tuple: T,
  //   txId?: string | undefined
  // ):
  //   | (Extract<TupleSchema, { key: TupleToObject<T> }> extends unknown
  //       ? Extract<TupleSchema, { key: TupleToObject<T> }>['value']
  //       : never)
  //   | undefined {
  //   throw new Error('Method not implemented.');
  // }

  async exists<T extends Tuple>(
    tuple: T,
    txId?: string | undefined
  ): Promise<boolean> {
    return (
      await Promise.all(
        this.getStorageClients('read').map((store) => store.exists(tuple, txId))
      )
    ).some((exists) => exists);
  }
  subspace<P extends TuplePrefix<TupleSchema['key']>>(
    prefix: P
  ): MultiTupleStore<RemoveTupleValuePairPrefix<TupleSchema, P>> {
    const prefixedStorages = Object.fromEntries(
      Object.entries(this.storage).map(([storageKey, store]) => [
        storageKey,
        store.subspace(prefix),
      ])
    );
    return new MultiTupleStore({
      storage: prefixedStorages,
      storageScope: this.storageScope,
      // @ts-expect-error
      hooks: this.hooks,
      reactivity: this.reactivity,
    }) as MultiTupleStore<RemoveTupleValuePairPrefix<TupleSchema, P>>;
  }

  transact(scope?: StorageScope): MultiTupleTransaction<TupleSchema> {
    return new MultiTupleTransaction({
      scope: scope ?? this.storageScope,
      store: this,
      hooks: this.hooks,
    });
  }

  async autoTransact<T>(
    callback: (tx: MultiTupleTransaction<TupleSchema>) => Promise<T>,
    scope: StorageScope | undefined
  ) {
    try {
      return await transactionalReadWriteAsync(5, {
        exponentialBackoff: true,
        jitter: true,
      })(
        // @ts-ignore
        callback
      )(
        // @ts-ignore
        scope
          ? new MultiTupleStore({
              storage: this.storage,
              storageScope: scope,
              hooks: this.hooks,
              reactivity: this.reactivity,
            })
          : this
      );
    } catch (e) {
      throw e;
    }
  }

  async clear() {
    await this.autoTransact(async (tx) => {
      const allData = await tx.scan();
      allData.forEach((data) => tx.remove(data.key));
    }, this.storageScope);
  }

  close(): void {
    throw new NotImplementedError('MultiTupleStore.close() method');
  }
}

export class ScopedMultiTupleOperator<TupleSchema extends KeyValuePair> {
  readonly txScope: TransactionScope<TupleSchema>;
  hooks: MultiTupleStoreHooks<TupleSchema>;
  constructor({
    txScope,
    hooks,
  }: {
    txScope: TransactionScope<TupleSchema>;
    hooks: MultiTupleStoreHooks<TupleSchema>;
  }) {
    this.txScope = txScope;
    this.hooks = hooks;
  }

  async scan<T extends Tuple, P extends TuplePrefix<T>>(
    args?: ScanArgs<T, P> | undefined
  ): Promise<TupleSchema[]> {
    const comparer = (a: TupleSchema, b: TupleSchema) =>
      (compareTuple(a.key, b.key) * (args?.reverse ? -1 : 1)) as 1 | -1 | 0;

    return mergeMultipleSortedArrays(
      await Promise.all(this.txScope.read.map((store) => store.scan(args))),
      comparer
    );
  }

  async exists<T extends Tuple>(tuple: T): Promise<boolean> {
    return (
      await Promise.all(this.txScope.read.map((store) => store.exists(tuple)))
    ).some((exists) => exists);
  }

  // get: <T extends Tuple>(tuple: T) => (Extract<TupleSchema, { key: TupleToObject<T>; }> extends unknown ? Extract<TupleSchema, { key: TupleToObject<T>; }>['value'] : never) | undefined;
  // exists: <T extends Tuple>(tuple: T) => boolean;
  remove(tuple: TupleSchema['key']) {
    this.txScope.write.forEach((tx) => tx.remove(tuple));
  }

  // write: (writes: WriteOps<TupleSchema>) => TupleRootTransactionApi<TupleSchema>;

  async set<Key extends Tuple>(
    tuple: Key,
    value: Extract<TupleSchema, { key: TupleToObject<Key> }> extends unknown
      ? Extract<TupleSchema, { key: TupleToObject<Key> }>['value']
      : never
  ) {
    for (const beforeHook of this.hooks.beforeInsert) {
      // @ts-ignore
      await beforeHook({ key: tuple, value }, this);
    }
    this.txScope.write.forEach((tx) => tx.set(tuple, value));
  }
}

function mergeMultipleSortedArrays<T>(
  arrays: T[][],
  comparer: (a: T, b: T) => -1 | 0 | 1
): T[] {
  const pointers = arrays.map(() => 0);
  const resultSize = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Array(resultSize);
  let itemCount = 0;
  while (itemCount < resultSize) {
    let candidateList = null;
    for (let i = 0; i < arrays.length; i++) {
      const item = arrays[i][pointers[i]];
      if (!item) continue;
      if (candidateList == null) {
        candidateList = i;
        continue;
      }
      if (comparer(item, arrays[candidateList][pointers[candidateList]]) < 0) {
        candidateList = i;
      }
    }
    if (candidateList == null) {
      throw new DBScanFailureError(
        'While merging scan results, could not select a result set to take from. This should never happen.'
      );
    }
    result[itemCount++] = arrays[candidateList][pointers[candidateList]++];
  }
  return result;
}

export class MultiTupleTransaction<
  TupleSchema extends KeyValuePair
> extends ScopedMultiTupleOperator<TupleSchema> {
  readonly txs: Record<string, AsyncTupleRootTransactionApi<TupleSchema>>;
  readonly store: MultiTupleStore<TupleSchema>;
  isCancelled = false;
  readonly hooks: MultiTupleStoreHooks<TupleSchema>;
  private _inheritedHooks: MultiTupleStoreHooks<TupleSchema>;
  private _ownHooks: MultiTupleStoreHooks<TupleSchema>;

  id: string = Math.random().toString(36).slice(2);

  constructor({
    store,
    scope,
    hooks,
  }: {
    store: MultiTupleStore<TupleSchema>;
    scope?: StorageScope;
    hooks: MultiTupleStoreHooks<TupleSchema>;
  }) {
    const txEntries = Object.entries(store.storage).map(
      ([storageKey, store]) => [storageKey, store.transact()] as const
    );
    const txs = Object.fromEntries(txEntries);
    const readKeys = scope?.read ?? Object.keys(store.storage);
    const writeKeys = scope?.write ?? Object.keys(store.storage);
    super({
      txScope: {
        read: readKeys.map((storageKey) => txs[storageKey]),
        write: writeKeys.map((storageKey) => txs[storageKey]),
      },
      hooks,
    });
    for (const [storageKey, tx] of txEntries) {
      store.reactivity.trackSubTx(storageKey, tx.id, this.id);
    }
    this.txs = txs;
    this.store = store;
    this._inheritedHooks = hooks ?? {
      beforeCommit: [],
      beforeInsert: [],
      beforeScan: [],
      afterCommit: [],
    };
    this._ownHooks = {
      beforeCommit: [],
      beforeInsert: [],
      beforeScan: [],
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
      beforeScan: MirroredArray(
        this._inheritedHooks.beforeScan,
        this._ownHooks.beforeScan
      ),
      afterCommit: MirroredArray(
        this._inheritedHooks.afterCommit,
        this._ownHooks.afterCommit
      ),
    };
  }

  get writes() {
    return Object.fromEntries(
      Object.entries(this.txs).map(([id, tx]) => [id, tx.writes])
    );
  }

  beforeScan(callback: MultiTupleStoreBeforeScanHook<TupleSchema>) {
    this._ownHooks.beforeScan.push(callback);
  }

  beforeCommit(callback: MultiTupleStoreBeforeCommitHook<TupleSchema>) {
    this._ownHooks.beforeCommit.push(callback);
  }

  afterCommit(callback: MultiTupleStoreAfterCommitHook<TupleSchema>) {
    this._ownHooks.afterCommit.push(callback);
  }

  async scan<T extends Tuple, P extends TuplePrefix<T>>(
    args?: ScanArgs<T, P> | undefined
  ): Promise<TupleSchema[]> {
    for (const beforeHook of this.hooks.beforeScan) {
      await beforeHook(args, this);
    }
    const comparer = (a: TupleSchema, b: TupleSchema) =>
      (compareTuple(a.key, b.key) * (args?.reverse ? -1 : 1)) as 1 | -1 | 0;

    return mergeMultipleSortedArrays(
      await Promise.all(this.txScope.read.map((store) => store.scan(args))),
      comparer
    );
  }

  withScope(scope: StorageScope) {
    const readKeys = scope.read ?? Object.keys(this.store.storage);
    const writeKeys = scope.write ?? Object.keys(this.store.storage);
    return new ScopedMultiTupleOperator({
      txScope: {
        read: readKeys.map((storageKey) => this.txs[storageKey]),
        write: writeKeys.map((storageKey) => this.txs[storageKey]),
      },
      hooks: this.hooks,
    });
  }

  async commit() {
    if (this.isCancelled) {
      console.warn('Cannot commit already canceled transaction.');
      return;
    }
    // Run before hooks
    for (const beforeHook of this.hooks.beforeCommit) {
      await beforeHook(this);
    }

    // perform commit
    await Promise.all(Object.values(this.txs).map((tx) => tx.commit()));

    // run after hooks
    for (const afterHook of this.hooks.afterCommit) {
      await afterHook(this);
    }

    // schedule reactivity callbacks
    this.store.reactivity.emit(this.id);
  }
  async cancel() {
    if (this.isCancelled) {
      console.warn('Attempted to cancel already canceled transaction.');
      return;
    }
    await Promise.all(Object.values(this.txs).map((tx) => tx.cancel()));
    this.isCancelled = true;
  }
}

type MultiTupleReactivityCallback<TupleSchema extends KeyValuePair> = (
  storeWrites: Record<
    string,
    WriteOps<Extract<TupleSchema, { key: TupleToObject<any> }>>
  >
) => void | Promise<void>;
type MultiTupleReactivityCallbackArgs = Record<string, WriteOps<any>>;
export class MultiTupleReactivity {
  private txCallbacks: Record<
    string,
    {
      callbacks: Set<MultiTupleReactivityCallback<any>>;
      args: MultiTupleReactivityCallbackArgs;
      subTxs: string[];
    }
  > = {};
  private subTxReactivityIds: Record<string, string> = {};
  private taskQueue = new TaskQueue();

  trackSubTx(storeId: string, txId: string, multiStoreTxId: string) {
    this.subTxReactivityIds[`${storeId}_${txId}`] = multiStoreTxId;
  }

  getReactivityId(storeId: string, txId: string) {
    return this.subTxReactivityIds[`${storeId}_${txId}`];
  }

  updateCallback(
    reactivityId: string,
    callback: MultiTupleReactivityCallback<any>,
    writeOps: WriteOps<any>,
    storeId: string,
    txId: string
  ) {
    if (!this.txCallbacks[reactivityId]) {
      this.txCallbacks[reactivityId] = {
        callbacks: new Set(),
        args: {},
        subTxs: [],
      };
    }
    this.txCallbacks[reactivityId].callbacks.add(callback);
    this.txCallbacks[reactivityId].args[storeId] = writeOps;
    this.txCallbacks[reactivityId].subTxs.push(txId);
  }

  emit(reactivityId: string) {
    const txCallbacks = this.txCallbacks[reactivityId];
    if (txCallbacks) {
      this.taskQueue.schedule(
        Array.from(txCallbacks.callbacks),
        txCallbacks.args
      );
      for (const subTxId of txCallbacks.subTxs) {
        delete this.subTxReactivityIds[subTxId];
      }
      delete this.txCallbacks[reactivityId];
    }
  }
}

class TaskQueue {
  queue: [any, any][] = [];
  isRunning = false;

  async schedule(callbacks: any[], args: any) {
    if (this.isRunning) {
      setTimeout(() => {
        this.queue.push(...callbacks.map((cb) => [cb, args] as [any, any]));
        this.run();
      });
      return;
    }
    this.queue.push(...callbacks.map((cb) => [cb, args] as [any, any]));
    this.run();
  }

  async run() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    while (this.queue.length) {
      const stuff = this.queue.shift();
      if (!stuff) break;
      const [cb, a] = stuff;
      await cb(a);
    }
    this.isRunning = false;
  }
}
