import { compareTuple, Tuple } from '../../codec.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';
import BTree_ from 'sorted-btree';
// @ts-expect-error - BTree import broken
const BTree = ('default' in BTree_ ? BTree_.default : BTree_) as typeof BTree_;
// @ts-expect-error - BTree import broken
type BTree<K, V> = InstanceType<typeof BTree<K, V>>;
import { MemoryTransaction } from '../transactions/memory-tx.js';
import { debugFreeze } from '../../macros/debug.js';
import { ScopedKVStore } from '../utils/scoped-store.js';

export class BTreeKVStore implements KVStore {
  data: BTree<Tuple, any>;
  constructor(data?: BTree<Tuple, any>) {
    this.data =
      data ??
      // @ts-expect-error - BTree import broken
      new BTree(undefined, compareTuple);
  }

  get(key: Tuple, scope?: Tuple) {
    const fullKey = scope ? [...scope, ...key] : key;
    return Promise.resolve(this.data.get(fullKey));
  }

  set(key: Tuple, value: any, scope?: Tuple) {
    const fullKey = scope ? [...scope, ...key] : key;

    debugFreeze(value);

    this.data.set(fullKey, value);
    return Promise.resolve();
  }

  delete(key: Tuple, scope?: Tuple) {
    const fullKey = scope ? [...scope, ...key] : key;
    this.data.delete(fullKey);
    return Promise.resolve();
  }

  // @ts-expect-error - not returning async iter
  *scan(options: ScanOptions, scope?: Tuple): AsyncIterable<[Tuple, any]> {
    const low = scope ? [...scope, ...options.prefix] : options.prefix;
    const high = [...low, '\uffff'];
    const results: [Tuple, any][] = [];
    this.data.forRange(low, high, false, (key: string[], value: any) => {
      const prefixLength = (scope?.length ?? 0) + options.prefix.length;
      const keyWithoutPrefix = prefixLength > 0 ? key.slice(prefixLength) : key;
      if (keyWithoutPrefix.length === 0) return;
      results.push([keyWithoutPrefix, value]);
    });
    yield* results;
  }

  // @ts-expect-error - not returning async iter
  *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    const low = scope ? [...scope, ...options.prefix] : options.prefix;
    const high = [...low, '\uffff'];
    const results: [Tuple, any][] = [];
    this.data.forRange(low, high, false, (_key: string[], value: any) => {
      results.push(value);
    });
    yield* results;
  }

  count(options: CountOptions, scope?: Tuple): Promise<number> {
    const low = scope ? [...scope, ...options.prefix] : options.prefix;
    if (!low.length) {
      return this.data.size;
    }
    const high = [...low, '\uffff'];
    return this.data.forRange(low, high, false);
    // let count = 0;
    // this.data.forRange(low, high, false, () => {
    //   count++;
    // });
    // return Promise.resolve(count);
  }

  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }

  async clear(scope?: Tuple): Promise<void> {
    if (!scope?.length) {
      this.data.clear();
      return;
    }
    for await (const [key] of this.scan({ prefix: scope })) {
      await this.delete(key, scope);
    }
  }

  scope(prefix: Tuple): ScopedKVStore<this> {
    return new ScopedKVStore(this, prefix);
  }

  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    for await (const key of deletes) {
      this.data.delete(key);
    }
    for await (const [key, value] of sets) {
      this.data.set(key, value);
    }
  }
}
