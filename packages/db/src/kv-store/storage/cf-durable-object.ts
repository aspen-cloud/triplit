import { DurableObjectStorage, SqlStorage } from '@cloudflare/workers-types';
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
import { STATEMENTS } from '../utils/sqlite.js';

export class CloudflareDurableObjectKVStore implements KVStore {
  sql: SqlStorage;

  // NOTE: string constructor is rarely used and MAY be dangerous because it actually brings in sqlite dep
  constructor(database: DurableObjectStorage) {
    this.sql = database.sql;
    this.sql.exec(STATEMENTS.createTable);
  }
  scope(scope: Tuple): KVStore {
    return new ScopedKVStore(this, scope);
  }
  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }
  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    for await (const key of deletes) {
      await this.delete(key);
    }
    for await (const [key, value] of sets) {
      await this.set(key, value);
    }
    return Promise.resolve();
  }
  get(key: Tuple, scope?: Tuple): Promise<any> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    const result = this.sql.exec(STATEMENTS.get, encodedKey).next();
    if (result.done) {
      return Promise.resolve(undefined);
    }
    // @ts-expect-error
    return Promise.resolve(JSON.parse(result.value.value));
  }
  set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    this.sql.exec(STATEMENTS.set, encodedKey, JSON.stringify(value));
    return Promise.resolve();
  }
  delete(key: Tuple, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    this.sql.exec(STATEMENTS.delete, encodedKey);
    return Promise.resolve();
  }
  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = this.sql.exec(STATEMENTS.scan, low, high);
    for (const row of results) {
      const { key, value } = row as { key: string; value: string };
      const decodedKey = decodeTuple(key);
      const prefixLength = (scope?.length ?? 0) + options.prefix.length;
      const keyWithoutPrefix =
        prefixLength > 0 ? decodedKey.slice(prefixLength) : decodedKey;
      if (keyWithoutPrefix.length === 0) continue;
      yield [keyWithoutPrefix, JSON.parse(value)];
    }
  }
  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = this.sql.exec(STATEMENTS.scanValues, low, high);
    for (const row of results) {
      const { value } = row as { value: string };
      yield JSON.parse(value);
    }
  }
  async clear(scope?: Tuple): Promise<void> {
    if (!scope?.length) {
      this.sql.exec(STATEMENTS.truncate);
      return;
    }
    const low = encodeTuple(scope);
    const high = low + '\uffff';
    this.sql.exec(STATEMENTS.deleteRange, low, high);
  }
  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    const fullPrefix = scope ? [...scope, ...options.prefix] : options.prefix;
    if (!fullPrefix.length) {
      return this.sql.exec(STATEMENTS.count).one()[COUNT_KEY] as number;
    }
    const low = encodeTuple(fullPrefix);
    const high = low + '\uffff';
    const result = this.sql.exec(STATEMENTS.countRange, low, high);
    return result.one()[COUNT_KEY] as number;
  }
}
const COUNT_KEY = 'COUNT(*)';
