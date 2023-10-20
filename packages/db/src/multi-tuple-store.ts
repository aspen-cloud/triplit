import {
  Callback,
  KeyValuePair,
  ScanArgs,
  Tuple,
  AsyncTupleDatabaseClient,
  AsyncTupleRootTransactionApi,
  Unsubscribe,
  transactionalReadWriteAsync,
} from 'tuple-database';
import { compareTuple } from 'tuple-database/helpers/compareTuple.js';
import {
  TuplePrefix,
  TupleToObject,
  RemoveTupleValuePairPrefix,
} from 'tuple-database/database/typeHelpers';
import { DBScanFailureError, NotImplementedError } from './errors.js';

export type StorageScope = {
  read?: string[];
  write?: string[];
};

export type TransactionScope<TupleSchema extends KeyValuePair> = {
  read: AsyncTupleRootTransactionApi<TupleSchema>[];
  write: AsyncTupleRootTransactionApi<TupleSchema>[];
};

type MultiTupleStoreBeforeInsertHook<TupleSchema extends KeyValuePair> = (
  tuple: TupleSchema,
  tx: MultiTupleTransaction<TupleSchema>
) => void | Promise<void>;

type MultiTupleStoreBeforeCommitHook = () => void | Promise<void>;

type MultiTupleStoreHooks<TupleSchema extends KeyValuePair> = {
  beforeInsert: MultiTupleStoreBeforeInsertHook<TupleSchema>[];
  beforeCommit: MultiTupleStoreBeforeCommitHook[];
};

export default class MultiTupleStore<TupleSchema extends KeyValuePair> {
  readonly storageScope?: StorageScope;
  storage: Record<string, AsyncTupleDatabaseClient<TupleSchema>>;
  hooks: MultiTupleStoreHooks<TupleSchema>;
  // subspacePrefix: Tuple;

  constructor({
    storage,
    storageScope,
  }: {
    storage: Record<string, AsyncTupleDatabaseClient<TupleSchema>>;
    storageScope?: { read?: string[]; write?: string[] };
  }) {
    this.storage = storage;
    this.storageScope = storageScope;
    this.hooks = {
      beforeInsert: [],
      beforeCommit: [],
    };
  }

  getStorageClients(context?: 'read' | 'write') {
    if (context && this.storageScope && this.storageScope[context]) {
      return this.storageScope[context]!.map(
        (storageKey) => this.storage[storageKey]
      );
    }
    return Object.values(this.storage);
  }

  beforeInsert(callback: MultiTupleStoreBeforeInsertHook<TupleSchema>) {
    this.hooks.beforeInsert.push(callback);
  }

  beforeCommit(callback: MultiTupleStoreBeforeCommitHook) {
    this.hooks.beforeCommit.push(callback);
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
    callback: Callback<Extract<TupleSchema, { key: TupleToObject<P> }>>
  ): Unsubscribe {
    const unsubFuncs = this.getStorageClients('read').map((store) =>
      store.subscribe(args, callback)
    );
    return () => {
      Promise.all(unsubFuncs).then((unsubs) =>
        unsubs.forEach((unsub) => unsub())
      );
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
    }) as MultiTupleStore<RemoveTupleValuePairPrefix<TupleSchema, P>>;
  }

  transact(scope?: StorageScope): MultiTupleTransaction<TupleSchema> {
    return new MultiTupleTransaction({
      scope: scope ?? this.storageScope,
      store: this,
      hooks: {
        beforeInsert: [...this.hooks.beforeInsert],
        beforeCommit: [...this.hooks.beforeCommit],
      },
    });
  }

  async autoTransact<T>(
    callback: (tx: MultiTupleTransaction<TupleSchema>) => Promise<T>,
    scope: StorageScope | undefined
  ) {
    try {
      // @ts-ignore
      return await transactionalReadWriteAsync()(callback)(
        // @ts-ignore
        scope
          ? new MultiTupleStore({ storage: this.storage, storageScope: scope })
          : this
      );
    } catch (e) {
      throw e;
    }
  }

  async clear() {
    await Promise.all(
      Object.values(this.storage).map(async (store) => {
        await transactionalReadWriteAsync()(async (tx) => {
          const allData = await tx.scan();
          await Promise.all(allData.map((data) => tx.remove(data.key)));
        })(
          // @ts-ignore
          store
        );
      })
    );
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
  remove(tuple: Tuple) {
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
  isCanceled = false;
  hooks: MultiTupleStoreHooks<TupleSchema>;

  constructor({
    store,
    scope,
    hooks,
  }: {
    store: MultiTupleStore<TupleSchema>;
    scope?: StorageScope;
    hooks: MultiTupleStoreHooks<TupleSchema>;
  }) {
    const txs = Object.fromEntries(
      Object.entries(store.storage).map(([storageKey, store]) => [
        storageKey,
        store.transact(),
      ])
    );
    const readKeys = scope?.read ?? Object.keys(store.storage);
    const writeKeys = scope?.write ?? Object.keys(store.storage);
    super({
      txScope: {
        read: readKeys.map((storageKey) => txs[storageKey]),
        write: writeKeys.map((storageKey) => txs[storageKey]),
      },
      hooks,
    });
    this.txs = txs;
    this.store = store;
    this.hooks = hooks;
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
    if (this.isCanceled) {
      console.warn('Cannot commit already canceled transaction.');
      return;
    }
    for (const beforeHook of this.hooks.beforeCommit) {
      await beforeHook();
    }
    await Promise.all(Object.values(this.txs).map((tx) => tx.commit()));
  }
  async cancel() {
    if (this.isCanceled) {
      console.warn('Attempted to cancel already canceled transaction.');
      return;
    }
    await Promise.all(Object.values(this.txs).map((tx) => tx.cancel()));
    this.isCanceled = true;
  }
}
