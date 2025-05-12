import '@vitest/web-worker';
import { describe, test, expect, beforeEach } from 'vitest';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite.js';
import { SqliteWorkerKvStore } from '../src/kv-store/storage/sqlite-worker.js';
import { LmdbKVStore } from '../src/kv-store/storage/lmdb.js';
import { IndexedDbKVStore } from '../src/kv-store/storage/indexed-db.js';
import { MemoryTransaction } from '../src/kv-store/transactions/memory-tx.js';
import sqlite from 'better-sqlite3';
import { open } from 'lmdb';
import 'fake-indexeddb/auto';
import { InMemoryTestKVStore } from './utils/test-kv-store.js';
import { kvTests } from './kv-tests.js';

type TestDescription = {
  label: string;
  store: any;
  skipCount?: boolean;
};

const btree = new BTreeKVStore();
const sqliteDb = sqlite(':memory:');
const sqliteKv = new SQLiteKVStore(sqliteDb);
const sqliteWorkerKv = new SqliteWorkerKvStore(':memory:');
const lmdb = open({});
const lmdbKv = new LmdbKVStore(lmdb);
const idb = new IndexedDbKVStore('test'); // Will be single page for n < default page size (1000)
const idbWithCache = new IndexedDbKVStore('test', { useCache: true });
const idbPaged = new IndexedDbKVStore('test-paged', {
  batchSize: 2,
});
const memoryTx = new MemoryTransaction(new BTreeKVStore());
describe.each<TestDescription>([
  { label: 'In-memory BTree', store: btree },
  { label: 'In-memory transaction', store: memoryTx },
  { label: 'SQLite', store: sqliteKv },
  { label: 'LMDB', store: lmdbKv },
  { label: 'IndexedDB', store: idb },
  { label: 'IndexedDB with cache', store: idbWithCache },
  { label: 'IndexedDB (paged)', store: idbPaged },
  { label: 'In-memory w/ delay', store: new InMemoryTestKVStore() },
  // TODO: fix remaining tests for sqlite worker kv
  // { label: 'SQLite Worker Thread', store: sqliteWorkerKv },
])('--- $label ---', (scenario) => {
  kvTests(scenario, { test, describe, beforeEach, expect });
});
