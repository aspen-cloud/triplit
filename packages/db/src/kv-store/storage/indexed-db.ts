import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';
import { compareTuple, Tuple } from '../../codec.js';
import { MemoryTransaction } from '../transactions/memory-tx.js';
import { ScopedKVStore } from '../utils/scoped-store.js';
import { BTreeKVStore } from './memory-btree.js';

const version = 1;
const storeName = 'triplit';

export type IndexedDbKVOptions = {
  batchSize?: number;
  useCache?: boolean;
};

export class IndexedDbKVStore implements KVStore {
  private db: Promise<IDBDatabase>;
  private cache: BTreeKVStore | undefined;
  readonly options: IndexedDbKVOptions;

  constructor(
    db: string | Promise<IDBDatabase>,
    options: IndexedDbKVOptions = { useCache: true }
  ) {
    this.options = options;
    if (options.useCache) {
      this.cache = new BTreeKVStore();
    }
    this.db =
      typeof db === 'string'
        ? new Promise((resolve, reject) => {
            const request = indexedDB.open(db, version);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
              const database = (event.target as IDBOpenDBRequest).result;
              this.setupSchema(database);
            };

            request.onsuccess = async (event: Event) => {
              const database = (event.target as IDBOpenDBRequest).result;
              resolve(await this.populateCache(database));
            };

            request.onerror = (event: Event) => {
              console.error(
                `Error opening database: ${(event.target as IDBOpenDBRequest).error}`
              );
              reject((event.target as IDBOpenDBRequest).error);
            };
          })
        : db.then(this.populateCache);
  }

  private async populateCache(db: IDBDatabase) {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const keys: string[][] = await new Promise<string[][]>(
      (resolve, reject) => {
        const request = store.getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as string[][]);
      }
    );
    const values: any[] = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    if (keys.length !== values.length) {
      throw new Error('IndexedDB keys and values length mismatch');
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = values[i];
      this.cache && this.cache.data.set(key, value);
    }
    return db;
  }

  private setupSchema(db: IDBDatabase): void {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName);
    }
  }

  async get(key: Tuple, scope?: Tuple) {
    const db = await this.db;
    if (this.cache) {
      return this.cache.get(key, scope);
    }
    const fullKey = (scope ? [...scope, ...key] : key) as string[];
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly', {
        durability: 'relaxed',
      });
      const store = transaction.objectStore(storeName);
      const request = store.get(fullKey);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async set(key: Tuple, value: any, scope?: Tuple) {
    const db = await this.db;
    const fullKey = (scope ? [...scope, ...key] : key) as string[];
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite', {
        durability: 'relaxed',
      });
      const store = transaction.objectStore(storeName);
      const request = store.put(value, fullKey);

      request.onsuccess = async () => {
        this.cache && (await this.cache.set(key, value, scope));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(key: Tuple, scope?: Tuple) {
    const db = await this.db;
    const fullKey = (scope ? [...scope, ...key] : key) as string[];
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite', {
        durability: 'relaxed',
      });
      const store = transaction.objectStore(storeName);
      const request = store.delete(fullKey);

      request.onsuccess = async () => {
        this.cache && (await this.cache.delete(key, scope));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const db = await this.db;
    if (this.cache) {
      yield* this.cache.scan(options, scope);
      return;
    }
    const lower = scope ? [...scope, ...options.prefix] : options.prefix;
    const upper = [...lower, '\uffff'];
    const transaction = db.transaction(storeName, 'readonly', {
      durability: 'relaxed',
    });
    const store = transaction.objectStore(storeName);
    const batchSize = this.options.batchSize ?? 1000;
    let currentLower = lower;
    let firstPage = true;
    while (true) {
      if (compareTuple(currentLower, upper) >= 0) break;
      const keyRange = IDBKeyRange.bound(currentLower, upper, firstPage, true);
      const keys = await getBatchKeys<string[]>(store, keyRange, batchSize);
      if (!keys.length) break;
      const values = await getBatchValues(store, keyRange, batchSize);
      if (!values.length) break;
      for (let i = 0; i < keys.length; i++) {
        const prefixLength = (scope?.length ?? 0) + options.prefix.length;
        const keyWithoutPrefix =
          prefixLength > 0 ? keys[i].slice(prefixLength) : keys[i];
        if (keyWithoutPrefix.length === 0) break;
        yield [keyWithoutPrefix, values[i]];
      }
      const lastPage = values.length < batchSize;
      if (lastPage) break;
      const lastKey = keys.at(-1)!;
      currentLower = lastKey;
    }
  }

  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    await this.db;
    if (this.cache) {
      yield* this.cache.scanValues(options, scope);
      return;
    }
    const db = await this.db;
    const lower = scope ? [...scope, ...options.prefix] : options.prefix;
    const upper = [...lower, '\uffff'];
    const transaction = db.transaction(storeName, 'readonly', {
      durability: 'relaxed',
    });
    const store = transaction.objectStore(storeName);
    const batchSize = this.options.batchSize ?? 1000;
    let currentLower = lower;
    // As we paginate, the first page should include the lower bound according to our API
    let firstPage = true;
    while (true) {
      if (compareTuple(currentLower, upper) >= 0) break;
      const keyRange = IDBKeyRange.bound(currentLower, upper, firstPage, true);
      // Get range values
      const values = await getBatchValues(store, keyRange, batchSize);
      // If no values, no data to return
      if (!values.length) break;
      for (const value of values) {
        yield value;
      }
      // Last page will not be full
      const lastPage = values.length < batchSize;
      if (lastPage) break;
      const lastKey = (await getKeyInCursor(store, keyRange, batchSize)) as
        | string[]
        | undefined;
      // If it cannot find the last key, it means our batch size is gt remaining key range and we're on last page (ie redundant check with above)
      if (!lastKey) break;
      // Reset pagination scan state
      currentLower = lastKey;
      firstPage = false;
    }
  }

  async clear(scope?: Tuple) {
    const db = await this.db;
    const transaction = db.transaction(storeName, 'readwrite', {
      durability: 'relaxed',
    });
    const store = transaction.objectStore(storeName);
    if (!scope?.length) {
      const request = store.clear();
      return new Promise<void>((resolve, reject) => {
        request.onsuccess = async () => {
          this.cache && (await this.cache.clear(scope));
          resolve();
        };

        request.onerror = () => reject(request.error);
      });
    } else {
      const lower = scope;
      const upper = [...lower, '\uffff'];
      const range = IDBKeyRange.bound(lower, upper, false, true);
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(range);
        request.onsuccess = async () => {
          this.cache && (await this.cache.clear(scope));
          resolve();
        };

        request.onerror = () => reject(request.error);
      });
    }
  }
  scope(scope: Tuple): ScopedKVStore<this> {
    return new ScopedKVStore(this, scope);
  }

  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }

  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    const db = await this.db;
    if (this.cache) {
      return this.cache.count(options, scope);
    }
    const lower = scope ? [...scope, ...options.prefix] : options.prefix;
    const upper = [...lower, '\uffff'];
    const range = IDBKeyRange.bound(lower, upper, false, true);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly', {
        durability: 'relaxed',
      });
      const store = transaction.objectStore(storeName);
      const request = store.count(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    const db = await this.db;
    await new Promise<void>(async (resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite', {
        durability: 'relaxed',
      });
      const store = tx.objectStore(storeName);
      let lastOp = null;
      const deletesCopy: Tuple[] = [];
      const setsCopy: [Tuple, any][] = [];
      for await (const key of deletes) {
        lastOp = store.delete(key as string[]);
        deletesCopy.push(key);
      }
      for await (const [key, value] of sets) {
        lastOp = store.put(value, key as string[]);
        setsCopy.push([key, value]);
      }

      if (lastOp) {
        lastOp.onsuccess = async () => {
          this.cache && (await this.cache.applyEdits(setsCopy, deletesCopy));
          resolve();
        };
        // TODO: figure out how to make on error for any error
        lastOp.onerror = () => reject(lastOp.error);
      } else {
        this.cache && (await this.cache.applyEdits(setsCopy, deletesCopy));
        resolve();
      }
    });
  }

  async getBatchKeys<K = IDBValidKey>(
    keyRange: IDBKeyRange,
    batchSize: number
  ) {
    const db = await this.db;
    const transaction = db.transaction(storeName, 'readonly', {
      durability: 'relaxed',
    });
    const store = transaction.objectStore(storeName);
    return getBatchKeys(store, keyRange, batchSize);
  }
}

/**
 * Given a range, get the key at the offset (if offset goes over the end, returns undefined)
 */
function getKeyInCursor(
  store: IDBObjectStore,
  keyRange: IDBKeyRange,
  offset: number = 0
): Promise<IDBValidKey | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.openKeyCursor(keyRange, 'next');
    let advanced = false;
    request.onsuccess = (event) => {
      const req = event.target as IDBRequest<IDBCursorWithValue | null>;
      const cursor = req?.result;
      // If there's no cursor here, we didn't have enough entries
      if (!cursor) {
        resolve(undefined);
        return;
      }
      // If we should advance, do so
      if (!advanced && offset > 1) {
        advanced = true;
        cursor.advance(offset);
        return;
      }
      // either return the cursor key or resolve undefined
      resolve(cursor.key);
    };

    request.onerror = (event) => {
      const req = event.target as IDBRequest<IDBCursorWithValue | null>;
      reject(req.error);
    };
  });
}

function getBatchKeys<K = IDBValidKey>(
  store: IDBObjectStore,
  keyRange: IDBKeyRange,
  batchSize: number
) {
  return new Promise<K[]>((resolve, reject) => {
    const request = store.getAllKeys(keyRange, batchSize);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as K[]);
  });
}

function getBatchValues<T = any>(
  store: IDBObjectStore,
  keyRange: IDBKeyRange,
  batchSize: number
) {
  return new Promise<T[]>((resolve, reject) => {
    const request = store.getAll(keyRange, batchSize);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
