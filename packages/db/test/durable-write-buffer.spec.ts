import sqlite from 'better-sqlite3';
import { open } from 'lmdb';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite';
import { LmdbKVStore } from '../src/kv-store/storage/lmdb';
import { DurableWriteBuffer } from '../src/durable-write-buffer';
import { KVStoreOrTransaction } from '../src/types';
import { describe, beforeEach, test, expect } from 'vitest';
import { IndexedDbKVStore } from '../src/kv-store/storage/indexed-db';
import 'fake-indexeddb/auto';

describe('DurableWriteBuffer test suite', () => {
  const btree = new BTreeKVStore();
  const sqliteDb = sqlite(':memory:');
  const sqliteKv = new SQLiteKVStore(sqliteDb);
  const lmdb = open({});
  const lmdbKv = new LmdbKVStore(lmdb);
  const idb = new IndexedDbKVStore('test');
  describe.each([
    { label: 'BTree', store: btree },
    { label: 'SQLite', store: sqliteKv },
    { label: 'LMDB', store: lmdbKv },
    { label: 'IndexedDB', store: idb },
  ])('DurableWriteBuffer with $label store', ({ store }) => {
    let buffer: DurableWriteBuffer;
    let tx: KVStoreOrTransaction;

    beforeEach(async () => {
      buffer = new DurableWriteBuffer();
      await store.clear();
      tx = store;
    });

    test('writes and retrieves simple changes', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { value: 'foo' }]]),
          deletes: new Set(),
        },
      });
      const changes = await buffer.getChanges(tx);
      expect(changes.collectionA?.sets?.get('1')).toEqual({ value: 'foo' });
    });

    test('merges sets correctly', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { value: 'foo' }]]),
          deletes: new Set(),
        },
      });
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { value: 'bar' }]]),
          deletes: new Set(),
        },
      });
      const changes = await buffer.getChanges(tx);
      expect(changes.collectionA?.sets?.get('1')).toEqual({ value: 'bar' });
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { otherKey: 'baz' }]]),
          deletes: new Set(),
        },
      });
      const changes2 = await buffer.getChanges(tx);
      expect(changes2.collectionA?.sets?.get('1')).toEqual({
        value: 'bar',
        otherKey: 'baz',
      });
    });

    test('handles deletes correctly', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { value: 'foo' }]]),
          deletes: new Set(['2']),
        },
      });
      const changes = await buffer.getChanges(tx);
      expect(changes.collectionA?.deletes?.has('2')).toBe(true);
    });

    test('clears entity changes', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { value: 'keep' }]]),
          deletes: new Set(['2']),
        },
      });
      await buffer.clearChangesForEntity(tx, 'collectionA', '1');
      const changes = await buffer.getChanges(tx);
      expect(changes.collectionA?.sets?.has('1')).toBe(false);
    });

    test('clear() resets everything', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['1', { value: 'test' }]]),
          deletes: new Set(['2']),
        },
      });
      await buffer.clear(tx as any);
      const changes = await buffer.getChanges(tx);
      expect(changes).toEqual({});
    });

    test('getChangesForCollection returns correct changes', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([['a1', { value: 'alpha' }]]),
          deletes: new Set(['a2']),
        },
        collectionB: {
          sets: new Map([['b1', { value: 'bravo' }]]),
          deletes: new Set(),
        },
      });
      const collAChanges = await buffer.getChangesForCollection(
        tx,
        'collectionA'
      );
      expect(collAChanges.sets?.get('a1')).toEqual({ value: 'alpha' });
      expect(collAChanges.deletes?.has('a2')).toBe(true);
      const collBChanges = await buffer.getChangesForCollection(
        tx,
        'collectionB'
      );
      expect(collBChanges.sets?.get('b1')).toEqual({ value: 'bravo' });
    });

    test('getChangesForEntity returns correct changes', async () => {
      await buffer.write(tx, {
        collectionA: {
          sets: new Map([
            ['a1', { value: 'alpha' }],
            ['a2', { value: 'beta' }],
          ]),
          deletes: new Set(['a3']),
        },
      });
      const entityA1 = await buffer.getChangesForEntity(
        tx,
        'collectionA',
        'a1'
      );
      expect(entityA1).toEqual({ update: { value: 'alpha' }, delete: false });
      const entityA2 = await buffer.getChangesForEntity(
        tx,
        'collectionA',
        'a2'
      );
      expect(entityA2).toEqual({ update: { value: 'beta' }, delete: false });
      const entityA3 = await buffer.getChangesForEntity(
        tx,
        'collectionA',
        'a3'
      );
      expect(entityA3).toEqual({ update: undefined, delete: true });
    });
  });
});
