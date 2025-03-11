import { Tuple } from '../../codec.js';
import { type Database } from 'lmdb';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';

import { MemoryTransaction } from '../transactions/memory-tx.js';
import { TriplitError } from '../../errors.js';
import { ScopedKVStore } from '../utils/scoped-store.js';

export class LmdbKVStore implements KVStore {
  constructor(private db: Database) {}

  get(key: Tuple, scope?: Tuple) {
    const fullKey = (scope ? [...scope, ...key] : key) as string[];
    return this.db.get(fullKey);
  }

  async set(key: Tuple, value: any, scope?: Tuple) {
    const fullKey = (scope ? [...scope, ...key] : key) as string[];
    await this.db.put(fullKey, value);
    return Promise.resolve();
  }

  async delete(key: Tuple, scope?: Tuple) {
    const fullKey = (scope ? [...scope, ...key] : key) as string[];
    await this.db.remove(fullKey);
    return Promise.resolve();
  }

  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const start = (
      scope ? [...scope, ...options.prefix] : options.prefix
    ) as string[];
    const end = [...start, '\uffff'] as string[];
    for await (const { key, value } of this.db.getRange({ start, end })) {
      // LMDB seeming converts keys with one element to a string
      if (typeof key === 'string') {
        yield [[key], value];
        continue;
      }
      if (Array.isArray(key)) {
        const prefixLength = (scope?.length ?? 0) + options.prefix.length;
        const keyWithoutPrefix =
          prefixLength > 0 ? key.slice(prefixLength) : key;
        if (keyWithoutPrefix.length === 0) continue;
        yield [keyWithoutPrefix as string[], value];
        continue;
      }
      throw new TriplitError('Unable to decode key from LMDB');
    }
  }

  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    const start = (
      scope ? [...scope, ...options.prefix] : options.prefix
    ) as string[];
    const end = [...start, '\uffff'] as string[];
    for await (const { value } of this.db.getRange({ start, end })) {
      yield value;
    }
  }

  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    const start = (
      scope ? [...scope, ...options.prefix] : options.prefix
    ) as string[];
    const end = [...start, '\uffff'] as string[];
    let count = 0;
    for await (const _ of this.db.getRange({ start, end })) {
      count++;
    }
    return count;
  }

  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }

  async clear(scope?: Tuple): Promise<void> {
    if (!scope?.length) {
      return await this.db.clearAsync();
    }
    await this.db.transaction(async () => {
      for await (const [key] of this.scan({ prefix: [] }, scope)) {
        await this.delete(key, scope);
      }
    });
  }

  scope(scope: Tuple) {
    return new ScopedKVStore(this, scope);
  }

  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    await this.db.transaction(async () => {
      for await (const key of deletes) {
        await this.db.remove(key as string[]);
      }
      for await (const [key, value] of sets) {
        await this.db.put(key as string[], value);
      }
    });
  }
}
