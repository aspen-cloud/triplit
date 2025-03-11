import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
  TxStatus,
} from '../../src/types.js';
import { Tuple } from '../../src/codec.js';
import { BTreeKVStore } from '../../src/kv-store/storage/memory-btree.js';
import { MemoryTransaction } from '../../src/kv-store/transactions/memory-tx.js';
import {
  ScopedKVStore,
  ScopedKVStoreTransaction,
} from '../../src/kv-store/utils/scoped-store.js';

/**
 * This is a in-memory implementation of a KVStore that's used for testing that can have a provided delay for each operation
 */
export class InMemoryTestKVStore implements KVStore {
  private store: BTreeKVStore;
  readonly delay: number | undefined;
  readonly txDelay: number | undefined;

  constructor(
    options: {
      prefix?: Tuple;
      store?: BTreeKVStore;
      delay?: number;
      txDelay?: number;
    } = {}
  ) {
    this.delay = options.delay;
    this.txDelay = options.txDelay ?? this.delay;
    this.store = options.store ?? new BTreeKVStore();
  }
  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    if (this.delay !== undefined) await pause(this.delay);
    return this.store.count(options, scope);
  }

  scope(scope: Tuple): ScopedKVStore<this> {
    return new ScopedKVStore(this, scope);
  }

  async clear(scope?: Tuple): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    this.store.clear(scope);
  }

  async get(key: Tuple, scope?: Tuple): Promise<any> {
    if (this.delay !== undefined) await pause(this.delay);
    return this.store.get(key, scope);
  }

  async set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    this.store.set(key, value, scope);
  }

  async delete(key: Tuple, scope?: Tuple): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    this.store.delete(key, scope);
  }

  async *scan(
    scanOptions: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    if (this.delay !== undefined) await pause(this.delay);
    yield* this.store.scan(scanOptions, scope);
  }

  async *scanValues(
    scanOptions: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<any> {
    if (this.delay !== undefined) await pause(this.delay);
    yield* this.store.scanValues(scanOptions, scope);
  }

  transact(): KVStoreTransaction {
    const tx = new MemoryTransaction(this.store);
    return new InMemoryTestKvStoreTransaction(tx, {
      delay: this.txDelay,
    });
  }

  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    await this.store.applyEdits(sets, deletes);
  }
}

class InMemoryTestKvStoreTransaction implements KVStoreTransaction {
  private edits: InMemoryTestKVStore;
  private deletes: InMemoryTestKVStore;
  private delay: number | undefined;
  private tx: MemoryTransaction;

  constructor(
    tx: MemoryTransaction,
    options: {
      delay?: number;
      edits?: InMemoryTestKVStore;
      deletes?: InMemoryTestKVStore;
    } = {}
  ) {
    this.tx = tx;
    this.delay = options.delay;
    this.edits = options.edits ?? new InMemoryTestKVStore();
    this.deletes = options.deletes ?? new InMemoryTestKVStore();
  }
  status: TxStatus = 'open';

  count(options: CountOptions, scope?: Tuple): Promise<number> {
    return this.tx.count(options, scope);
  }

  scope(scope: Tuple): ScopedKVStoreTransaction<this> {
    return new ScopedKVStoreTransaction(this, scope);
  }

  async clear(scope?: Tuple): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    this.tx.clear(scope);
  }

  async get(key: Tuple, scope?: Tuple): Promise<any> {
    if (this.delay !== undefined) await pause(this.delay);
    return this.tx.get(key, scope);
  }

  async set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    await this.tx.set(key, value, scope);
  }

  async delete(key: Tuple, scope?: Tuple): Promise<void> {
    if (this.delay !== undefined) await pause(this.delay);
    await this.tx.delete(key, scope);
  }

  async *scan(scanOptions: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    if (this.delay !== undefined) await pause(this.delay);
    yield* this.tx.scan(scanOptions, scope);
  }

  async *scanValues(
    scanOptions: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<any> {
    if (this.delay !== undefined) await pause(this.delay);
    yield* this.tx.scanValues(scanOptions, scope);
  }

  async commit(): Promise<void> {
    await this.tx.commit();
    this.status = 'committed';
  }

  cancel(): void {
    this.status = 'cancelled';
  }
}

function pause(delay: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delay));
}
