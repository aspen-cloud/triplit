import { Tuple } from '../../codec.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
  TxStatus,
} from '../../types.js';
import { BTreeKVStore } from '../storage/memory-btree.js';
import {
  asyncIterConcat,
  asyncIterMap,
  asyncIterUnique,
} from '../../utils/iterators.js';
import {
  TransactionAlreadyCanceledError,
  TransactionAlreadyCommittedError,
} from '../../errors.js';

export class MemoryTransaction implements KVStoreTransaction {
  private sets: KVStore;
  private deletes: KVStore;
  private _status: TxStatus = 'open';

  constructor(
    public storage: KVStore,
    sets?: KVStore,
    deletes?: KVStore
  ) {
    this.sets = sets ?? new BTreeKVStore();
    this.deletes = deletes ?? new BTreeKVStore();
  }

  get status() {
    return this._status;
  }

  scope(prefix: Tuple): KVStoreTransaction {
    return new MemoryTransaction(
      this.storage.scope(prefix),
      this.sets.scope(prefix),
      this.deletes.scope(prefix)
    );
  }

  // TODO: I think this is wrong -- it should be scanning
  // the storage and adding all of the keys to the deletes.
  async clear(prefix?: Tuple): Promise<void> {
    this.checkTxStatusBeforeOperation();
    await this.sets.clear(prefix);
    await this.deletes.clear(prefix);
  }

  async get(key: Tuple, prefix?: Tuple): Promise<any> {
    this.checkTxStatusBeforeOperation();
    const isDeleted = (await this.deletes.get(key, prefix)) === null;
    const set = await this.sets.get(key, prefix);
    if (isDeleted) return set;
    const value = await this.storage.get(key, prefix);
    if (set === undefined) return value;
    return set;
  }

  async set(key: Tuple, value: any, prefix?: Tuple): Promise<void> {
    this.checkTxStatusBeforeOperation();
    return this.sets.set(key, value, prefix);
  }

  async delete(key: Tuple, prefix?: Tuple): Promise<void> {
    this.checkTxStatusBeforeOperation();
    await this.sets.delete(key, prefix);
    // https://github.com/qwertie/btree-typescript - setting undefined avoids allocating memory, acting more like a Set
    return this.deletes.set(key, null, prefix);
  }

  /**
   * Need to properly merge the scan results from the store and the edits.
   * This should remove any keys that have been deleted in the edits, aply updates, and add new keys.
   * For the addition of new keys, proper lexicographical ordering should occur to ensure the correct order.
   */
  async *scan(
    scanOptions: ScanOptions,
    prefix?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    this.checkTxStatusBeforeOperation();
    for await (const [key, value] of asyncIterUnique(
      asyncIterConcat(
        this.storage.scan(scanOptions, prefix),
        this.sets.scan(scanOptions, prefix),
        this.deletes.scan(scanOptions, prefix)
      ),
      ([k]) => JSON.stringify(k)
    )) {
      const fullKey = scanOptions.prefix?.length
        ? [...scanOptions.prefix, ...key]
        : key;
      const set = await this.sets.get(fullKey, prefix);
      const isDeleted = (await this.deletes.get(fullKey, prefix)) === null;
      if (!isDeleted && set === undefined) {
        yield [key, value];
        continue;
      }
      if (isDeleted && set === undefined) continue;
      yield [key, set];
    }
  }

  async *scanValues(
    scanOptions: ScanOptions,
    prefix?: Tuple
  ): AsyncIterable<any> {
    yield* asyncIterMap(
      this.scan(scanOptions, prefix),
      ([_key, value]) => value
    );
  }

  async count(options: CountOptions, prefix?: Tuple): Promise<number> {
    this.checkTxStatusBeforeOperation();
    let count = 0;
    for await (const [key] of this.scan({ prefix: options.prefix }, prefix)) {
      count++;
    }
    return Promise.resolve(count);
  }

  async commit(): Promise<void> {
    this.checkTxStatusBeforeOperation();
    await this.storage.applyEdits(
      this.sets.scan({ prefix: [] }),
      asyncIterMap(this.deletes.scan({ prefix: [] }), (it) => it[0])
    );
    this._status = 'committed';
  }

  private checkTxStatusBeforeOperation() {
    if (this._status === 'open') return;
    if (this._status === 'committed')
      throw new TransactionAlreadyCommittedError();
    if (this._status === 'cancelled')
      throw new TransactionAlreadyCanceledError();
  }

  cancel(): void {
    this.checkTxStatusBeforeOperation();
    this._status = 'cancelled';
  }
}
