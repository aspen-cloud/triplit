import { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  CountOptions,
  decodeTuple,
  encodeTuple,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
  Tuple,
} from '../../index.js';
import { MemoryTransaction } from '../transactions/memory-tx.js';
import { ScopedKVStore } from '../utils/scoped-store.js';

export class CloudflareDurableObjectKVStore implements KVStore {
  db: DurableObjectStorage;

  // NOTE: string constructor is rarely used and MAY be dangerous because it actually brings in sqlite dep
  constructor(database: DurableObjectStorage) {
    this.db = database;
  }
  scope(scope: Tuple): KVStore {
    return new ScopedKVStore(this, scope);
  }
  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }
  applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      const deletePromises: Promise<boolean>[] = [];
      for await (const key of deletes) {
        const encodedKey = encodeTuple(key);
        deletePromises.push(tx.delete(encodedKey));
      }
      await Promise.all(deletePromises);
      const setPromises: Promise<void>[] = [];
      for await (const [key, value] of sets) {
        const encodedKey = encodeTuple(key);
        setPromises.push(tx.put(encodedKey, value));
      }
      await Promise.all(setPromises);
    });
  }
  get(key: Tuple, scope?: Tuple): Promise<any> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    return this.db.get(encodedKey);
  }
  set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    return this.db.put(encodedKey, value);
  }
  delete(key: Tuple, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    return this.db.delete(encodedKey).then(() => undefined);
  }
  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = await this.db.list({ start: low, end: high });
    for (const [k, v] of results) {
      const key = decodeTuple(k);
      const prefixLength = (scope?.length ?? 0) + options.prefix.length;
      const keyWithoutPrefix = prefixLength > 0 ? key.slice(prefixLength) : key;
      if (keyWithoutPrefix.length === 0) continue;
      yield [keyWithoutPrefix, v];
    }
  }
  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = await this.db.list({ start: low, end: high });
    for (const v of results.values()) {
      yield v;
    }
  }
  async clear(scope?: Tuple): Promise<void> {
    if (!scope) {
      return this.db.deleteAll();
    }
    for await (const [key] of this.scan({ prefix: [] }, scope)) {
      await this.delete(key, scope);
    }
  }
  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    return (await this.db.list({ start: low, end: high })).size;
  }
}
