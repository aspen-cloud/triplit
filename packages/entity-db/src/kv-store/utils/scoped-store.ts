import { Tuple } from '../../codec.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';

export class ScopedKVStore<T extends KVStore> implements KVStore {
  constructor(
    private store: T,
    private prefix: Tuple
  ) {}

  scope(scope: Tuple): KVStore {
    return new ScopedKVStore(this.store, [...this.prefix, ...scope]);
  }
  get(key: Tuple): Promise<any> {
    return this.store.get(key, this.prefix);
  }
  set(key: Tuple, value: any): Promise<void> {
    return this.store.set(key, value, this.prefix);
  }
  delete(key: Tuple): Promise<void> {
    return this.store.delete(key, this.prefix);
  }
  scan(options: ScanOptions): AsyncIterable<[Tuple, any]> {
    return this.store.scan(options, this.prefix);
  }
  scanValues(options: ScanOptions): AsyncIterable<any> {
    return this.store.scanValues(options, this.prefix);
  }
  clear(): Promise<void> {
    return this.store.clear(this.prefix);
  }
  count(options: CountOptions): Promise<number> {
    return this.store.count(options, this.prefix);
  }
  // TODO: I guess this should be scoped for correctness
  transact(): KVStoreTransaction {
    return new ScopedKVStoreTransaction(this.store.transact(), this.prefix);
  }
  applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    return this.store.applyEdits(sets, deletes);
  }
}

export class ScopedKVStoreTransaction<T extends KVStoreTransaction>
  implements KVStoreTransaction
{
  constructor(
    private tx: T,
    private prefix: Tuple
  ) {}

  scope(prefix: Tuple): KVStoreTransaction {
    return new ScopedKVStoreTransaction(this.tx, [...this.prefix, ...prefix]);
  }
  get(key: Tuple): Promise<any> {
    return this.tx.get(key, this.prefix);
  }
  set(key: Tuple, value: any): Promise<void> {
    return this.tx.set(key, value, this.prefix);
  }
  delete(key: Tuple): Promise<void> {
    return this.tx.delete(key, this.prefix);
  }
  scan(options: ScanOptions): AsyncIterable<[Tuple, any]> {
    return this.tx.scan(options, this.prefix);
  }
  scanValues(options: ScanOptions): AsyncIterable<any> {
    return this.tx.scanValues(options, this.prefix);
  }
  clear(): Promise<void> {
    return this.tx.clear(this.prefix);
  }
  count(options: CountOptions): Promise<number> {
    return this.tx.count(options, this.prefix);
  }

  // TODO: these are a little odd on the scoped store
  commit(): Promise<void> {
    return this.tx.commit();
  }
  cancel(): void {
    return this.tx.cancel();
  }
  get status() {
    return this.tx.status;
  }
}
