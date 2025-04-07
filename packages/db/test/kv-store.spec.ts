import '@vitest/web-worker';
import {
  describe,
  test,
  vi,
  expect,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
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

const btree = new BTreeKVStore();
const sqliteDb = sqlite(':memory:');
const sqliteKv = new SQLiteKVStore(sqliteDb);
const sqliteWorkerKv = new SqliteWorkerKvStore(':memory:');
const lmdb = open({});
const lmdbKv = new LmdbKVStore(lmdb);
const idb = new IndexedDbKVStore('test');
const memoryTx = new MemoryTransaction(new BTreeKVStore());
describe.each([
  { label: 'In-memory BTree', store: btree },
  { label: 'In-memory transaction', store: memoryTx },
  { label: 'SQLite', store: sqliteKv },
  { label: 'LMDB', store: lmdbKv },
  { label: 'IndexedDB', store: idb },
  { label: 'In-memory w/ delay', store: new InMemoryTestKVStore() },
  { label: 'SQLite Worker Thread', store: sqliteWorkerKv },
])('--- $label ---', (scenario) => {
  const { label, store } = scenario;
  describe('get and set', () => {
    beforeEach(async () => {
      await store.clear();
    });
    test('string value', async () => {
      await store.set(['a'], 'value');
      expect(await store.get(['a'])).toBe('value');
    });
    test('number value', async () => {
      await store.set(['a'], 1);
      expect(await store.get(['a'])).toBe(1);
    });
    test('object value', async () => {
      await store.set(['a'], { b: 1 });
      expect(await store.get(['a'])).toEqual({ b: 1 });
    });
    test('array value', async () => {
      await store.set(['a'], [1]);
      expect(await store.get(['a'])).toEqual([1]);
    });
    test('null value', async () => {
      await store.set(['a'], null);
      expect(await store.get(['a'])).toBe(null);
    });
    test('boolean value', async () => {
      await store.set(['a'], true);
      expect(await store.get(['a'])).toBe(true);
      await store.set(['a'], false);
      expect(await store.get(['a'])).toBe(false);
    });
    test('respects scope', async () => {
      await store.set(['a'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      expect(await store.get(['a'])).toBe(1);
      expect(await store.get(['b', 'a'])).toBe(2);
      expect(await scopedStore.get(['a'])).toBe(2);
    });
    // @deprecated provided prefixes are for internal use for scoping
    test.skip('respects provided prefixes', async () => {
      await store.set(['a'], 1);
      await store.set(['b'], 2, ['c']);
      expect(await store.get(['a'])).toBe(1);
      expect(await store.get(['b'])).toBe(undefined);
      expect(await store.get(['b'], ['c'])).toBe(2);
    });
    // @deprecated provided prefixes are for internal use for scoping
    test.skip('respects provided prefixes with scope', async () => {
      await store.set(['a'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a', 'c'], 2);
      expect(await store.get(['a'])).toBe(1);
      expect(await store.get(['b'])).toBe(undefined);
      expect(await store.get(['b', 'c'])).toBe(undefined);
      expect(await scopedStore.get(['a'])).toBe(undefined);
      expect(await scopedStore.get(['a', 'c'])).toBe(2);
    });
  });
  describe('delete', () => {
    beforeEach(async () => {
      await store.clear();
    });
    test('delete', async () => {
      await store.set(['a'], 1);
      await store.delete(['a']);
      expect(await store.get(['a'])).toBe(undefined);
    });
    test('delete with prefix', async () => {
      await store.set(['a'], 1, ['b']);
      await store.delete(['a'], ['b']);
      expect(await store.get(['a'], ['b'])).toBe(undefined);
    });
    test('delete with scope', async () => {
      await store.set(['a'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      await scopedStore.delete(['a']);
      expect(await scopedStore.get(['a'])).toBe(undefined);
      expect(await store.get(['a'])).toBe(1);
    });
    test('delete with scope and prefix', async () => {
      await store.set(['a'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2, ['c']);
      await scopedStore.delete(['a'], ['c']);
      expect(await scopedStore.get(['a'], ['c'])).toBe(undefined);
      expect(await store.get(['a'], ['c'])).toBe(undefined);
      expect(await store.get(['a'])).toBe(1);
    });
  });
  describe('clear', () => {
    beforeEach(async () => {
      await store.set(['a'], 1);
    });
    test('clear', async () => {
      await store.clear();
      expect(await store.get(['a'])).toBe(undefined);
    });
    test('clear with scope', async () => {
      await store.set(['a'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      await store.clear();
      expect(await scopedStore.get(['a'])).toBe(undefined);
      expect(await store.get(['a'])).toBe(undefined);
      await store.set(['a'], 1);
      await scopedStore.set(['b'], 2);
      await scopedStore.clear();
      expect(await store.get(['a'])).toBe(1);
      expect(await scopedStore.get(['b'])).toBe(undefined);
    });
  });

  describe('scan', () => {
    beforeEach(async () => {
      await store.clear();
    });
    test('simple scan', async () => {
      await store.set(['a'], 1);
      await store.set(['b'], 2);
      const results = [];
      for await (const [key, value] of store.scan({ prefix: [] })) {
        results.push([key, value]);
      }
      expect(results).toEqual([
        [['a'], 1],
        [['b'], 2],
      ]);
    });
    test('respects key order', async () => {
      await store.set(['b'], 1);
      await store.set(['c'], 1);
      await store.set(['a'], 1);
      const results = [];
      for await (const [key, value] of store.scan({ prefix: [] })) {
        results.push([key, value]);
      }
      expect(results).toEqual([
        [['a'], 1],
        [['b'], 1],
        [['c'], 1],
      ]);
    });
    test('respects scoping', async () => {
      await store.set(['a'], 1);
      await store.set(['c'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      const scopedResults = [];
      for await (const [key, value] of scopedStore.scan({ prefix: [] })) {
        scopedResults.push([key, value]);
      }
      expect(scopedResults).toEqual([[['a'], 2]]);
      const otherResults = [];
      for await (const [key, value] of store.scan({ prefix: [] })) {
        otherResults.push([key, value]);
      }
      expect(otherResults).toEqual([
        [['a'], 1],
        [['b', 'a'], 2],
        [['c'], 1],
      ]);
    });
    test('respects prefix', async () => {
      await store.set(['a'], 1);
      await store.set(['b', 'a'], 2);
      await store.set(['c'], 3);
      const results = [];
      for await (const [key, value] of store.scan({ prefix: ['b'] })) {
        results.push([key, value]);
      }
      expect(results).toEqual([[['a'], 2]]);
    });
    test('respects prefix with scope', async () => {
      await store.set(['a'], 1);
      await store.set(['c'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      await scopedStore.set(['b', 'a'], 3);
      const results = [];
      for await (const [key, value] of scopedStore.scan({ prefix: ['b'] })) {
        results.push([key, value]);
      }
      expect(results).toEqual([[['a'], 3]]);
      const allResults = [];
      for await (const [key, value] of store.scan({ prefix: [] })) {
        allResults.push([key, value]);
      }
      expect(allResults).toEqual([
        [['a'], 1],
        [['b', 'a'], 2],
        [['b', 'b', 'a'], 3],
        [['c'], 1],
      ]);
    });
  });

  describe('scanValues', () => {
    beforeEach(async () => {
      await store.clear();
    });
    test('simple scanValues', async () => {
      await store.set(['a'], 1);
      await store.set(['b'], 2);
      const results = [];
      for await (const value of store.scanValues({ prefix: [] })) {
        results.push(value);
      }
      expect(results).toEqual([1, 2]);
    });
    test('respects key order', async () => {
      await store.set(['b'], 1);
      await store.set(['c'], 1);
      await store.set(['a'], 1);
      const results = [];
      for await (const value of store.scanValues({ prefix: [] })) {
        results.push(value);
      }
      expect(results).toEqual([1, 1, 1]);
    });
    test('respects scoping', async () => {
      await store.set(['a'], 1);
      await store.set(['c'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      const scopedResults = [];
      for await (const value of scopedStore.scanValues({ prefix: [] })) {
        scopedResults.push(value);
      }
      expect(scopedResults).toEqual([2]);
      const otherResults = [];
      for await (const value of store.scanValues({ prefix: [] })) {
        otherResults.push(value);
      }
      expect(otherResults).toEqual([1, 2, 1]);
    });
    test('respects prefix', async () => {
      await store.set(['a'], 1);
      await store.set(['b', 'a'], 2);
      await store.set(['c'], 3);
      const results = [];
      for await (const value of store.scanValues({ prefix: ['b'] })) {
        results.push(value);
      }
      expect(results).toEqual([2]);
    });
    test('respects prefix with scope', async () => {
      await store.set(['a'], 1);
      await store.set(['c'], 1);
      const scopedStore = store.scope(['b']);
      await scopedStore.set(['a'], 2);
      await scopedStore.set(['b', 'a'], 3);
      const results = [];
      for await (const value of scopedStore.scanValues({ prefix: ['b'] })) {
        results.push(value);
      }
      expect(results).toEqual([3]);
      const allResults = [];
      for await (const value of store.scanValues({ prefix: [] })) {
        allResults.push(value);
      }
      expect(allResults).toEqual([1, 2, 3, 1]);
    });
  });

  if (!scenario.skipCount) {
    describe('count', () => {
      beforeEach(async () => {
        await store.clear();
      });
      if (store instanceof MemoryTransaction) {
        // TODO: this is applicable but the tests are currently broken
        // and the implementation is no better than just doing a
        // a scan
        test('not applicable to MemoryTransaction', () => {});
        return;
      }
      test('simple count without prefix', async () => {
        await store.set(['a'], 1);
        await store.set(['b'], 2);
        expect(await store.count({ prefix: [] })).toBe(2);
      });
      test('respects prefix', async () => {
        await store.set(['a'], 1);
        await store.set(['b'], 2);
        expect(await store.count({ prefix: ['b'] })).toBe(1);
      });
      test('respects scope', async () => {
        await store.set(['a'], 1);
        const scopedStore = store.scope(['b']);
        await scopedStore.set(['a'], 2);
        expect(await scopedStore.count({ prefix: [] })).toBe(1);
        expect(await scopedStore.count({ prefix: ['a'] })).toBe(1);
        expect(await scopedStore.count({ prefix: ['b'] })).toBe(0);
        expect(await store.count({ prefix: [] })).toBe(2);
      });
      test('respects prefix with scope', async () => {
        await store.set(['a'], 1);
        const scopedStore = store.scope(['b']);
        await scopedStore.set(['a'], 2);
        expect(await scopedStore.count({ prefix: [] })).toBe(1);
        expect(await scopedStore.count({ prefix: ['a'] })).toBe(1);
        expect(await store.count({ prefix: [] })).toBe(2);
        expect(await store.count({ prefix: ['b'] })).toBe(1);
        expect(await store.count({ prefix: ['a'] })).toBe(1);
      });
    });
  }
  describe('transact', () => {
    beforeEach(async () => {
      await store.clear();
    });
    if (store instanceof MemoryTransaction) {
      test('not applicable to MemoryTransaction', () => {});
      return;
    }
    test('can set in a transaction', async () => {
      const tx = store.transact();
      await tx.set(['a'], 1);
      await tx.set(['b'], 2);
      await tx.commit();
      expect(await store.get(['a'])).toBe(1);
      expect(await store.get(['b'])).toBe(2);
    });
    test('can delete in a transaction', async () => {
      await store.set(['a'], 1);
      await store.set(['b'], 2);
      const tx = store.transact();
      await tx.delete(['a']);
      await tx.commit();
      expect(await store.get(['a'])).toBe(undefined);
      expect(await store.get(['b'])).toBe(2);
    });
    test('can set and delete on the same key and vice versa', async () => {
      await store.set(['a'], 1);
      const tx = store.transact();
      await tx.set(['a'], 2);
      await tx.delete(['a']);
      await tx.commit();
      expect(await store.get(['a'])).toBe(undefined);
    });
    test("can read what's been set in a transaction", async () => {
      await store.set(['a'], 1);
      const tx = store.transact();
      expect(await tx.get(['a'])).toBe(1);
    });
    test("what's been set in a transaction is not visible until committed", async () => {
      const tx = store.transact();
      await tx.set(['a'], 1);
      expect(await store.get(['a'])).toBe(undefined);
      await tx.commit();
      expect(await store.get(['a'])).toBe(1);
    });
    test("what's been deleted in a transaction is not visible until committed", async () => {
      await store.set(['a'], 1);
      const tx = store.transact();
      await tx.delete(['a']);
      expect(await store.get(['a'])).toBe(1);
      await tx.commit();
      expect(await store.get(['a'])).toBe(undefined);
    });
    test("doesn't commit if not committed", async () => {
      await store.set(['b'], 2);
      const tx = store.transact();
      await tx.set(['a'], 1);
      await tx.delete(['b']);
      expect(await store.get(['a'])).toBe(undefined);
      expect(await store.get(['b'])).toBe(2);
    });
    test("doesn't commit if cancelled", async () => {
      await store.set(['b'], 2);
      const tx = store.transact();
      await tx.set(['a'], 1);
      await tx.delete(['b']);
      tx.cancel();
      expect(await store.get(['a'])).toBe(undefined);
      expect(await store.get(['b'])).toBe(2);
    });
    test('can scan inside a transaction and see relevant changes', async () => {
      await store.set(['a'], 1);
      await store.set(['b'], 2);
      const tx = store.transact();
      await tx.set(['c'], 3);
      await tx.set(['d'], 4);
      await tx.delete(['d']);
      await tx.delete(['a']);
      const results = [];
      for await (const [key, value] of tx.scan({ prefix: [] })) {
        results.push([key, value]);
      }
      expect(results).toEqual([
        [['b'], 2],
        [['c'], 3],
      ]);
      const staleResults = [];
      for await (const [key, value] of store.scan({ prefix: [] })) {
        staleResults.push([key, value]);
      }
      expect(staleResults).toEqual([
        [['a'], 1],
        [['b'], 2],
      ]);
      await tx.commit();
      const freshResults = [];
      for await (const [key, value] of store.scan({ prefix: [] })) {
        freshResults.push([key, value]);
      }
      expect(freshResults).toEqual([
        [['b'], 2],
        [['c'], 3],
      ]);
    });
    describe('transaction scoping', () => {
      beforeEach(async () => {
        await store.clear();
      });
      test('can set in a transaction with scope', async () => {
        await store.set(['a'], 1);
        let tx = store.transact();
        const scopedTx = tx.scope(['a']);
        await scopedTx.set(['b'], 1);
        expect(await scopedTx.get(['b'])).toBe(1);
        expect(await scopedTx.get(['a'])).toBe(undefined);
        expect(await tx.get(['a'])).toBe(1);
        expect(await tx.get(['b'])).toBe(undefined);
        expect(await tx.get(['a', 'b'])).toBe(1);
        await tx.commit();
        expect(await store.get(['a', 'b'])).toBe(1);
      });
      test('can delete in a transaction with scope', async () => {
        await store.set(['a'], 1);
        let tx = store.transact();
        const scopedTx = tx.scope(['a']);
        await scopedTx.delete(['a']);

        expect(await scopedTx.get(['a'])).toBe(undefined);
        expect(await tx.get(['a'])).toBe(1);
        await tx.commit();
        expect(await store.get(['a'])).toBe(1);
      });
      test('can set and delete on the same key and vice versa with scope', async () => {
        await store.set(['a'], 1);
        let tx = store.transact();
        const scopedTx = tx.scope(['a']);
        await scopedTx.set(['a'], 2);
        await scopedTx.delete(['a']);
        expect(await scopedTx.get(['a'])).toBe(undefined);
        expect(await tx.get(['a'])).toBe(1);
        await tx.commit();
        expect(await store.get(['a'])).toBe(1);
      });
      test.only('can scan with prefix in a transaction with scope', async () => {
        await store.set(['a', 'b'], 1);
        await store.set(['a', 'c'], 2);
        let tx = store.transact();
        const scopedTx = tx.scope(['a']);
        await scopedTx.set(['c', 'd'], 3);
        await scopedTx.set(['c', 'e'], 4);
        const results = [];
        for await (const [key, value] of scopedTx.scan({ prefix: ['c'] })) {
          results.push([key, value]);
        }
        expect(results).toEqual([
          [['d'], 3],
          [['e'], 4],
        ]);
        const staleResults = [];
        for await (const [key, value] of store.scan({ prefix: ['a'] })) {
          staleResults.push([key, value]);
        }
        expect(staleResults).toEqual([
          [['b'], 1],
          [['c'], 2],
        ]);
        await tx.commit();
      });
      test('can scan with prefix in a scoped transaction', async () => {
        await store.set(['a', 'b', 'c'], 1);
        await store.set(['a', 'b', 'd'], 2);
        let tx = store.transact();
        const scopedTx = tx.scope(['a', 'b']);
        await scopedTx.set(['c', 'd'], 3);
        await scopedTx.set(['c', 'e'], 4);
        await scopedTx.delete(['c']);
        await scopedTx.set(['c'], 5);
        const results = [];
        for await (const [key, value] of scopedTx.scan({ prefix: ['c'] })) {
          results.push([key, value]);
        }
        expect(results).toEqual([
          [['d'], 3],
          [['e'], 4],
        ]);
        const staleResults = [];
        for await (const [key, value] of store.scan({ prefix: ['a', 'b'] })) {
          staleResults.push([key, value]);
        }
        expect(staleResults).toEqual([
          [['c'], 1],
          [['d'], 2],
        ]);
        await tx.commit();
        const freshResults = [];
        for await (const [key, value] of store.scan({ prefix: ['a', 'b'] })) {
          freshResults.push([key, value]);
        }
        expect(freshResults).toEqual([
          [['c'], 5],
          [['c', 'd'], 3],
          [['c', 'e'], 4],
          [['d'], 2],
        ]);
      });
    });
  });
});
