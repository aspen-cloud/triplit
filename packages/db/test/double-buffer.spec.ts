import sqlite from 'better-sqlite3';
import { open } from 'lmdb';
import { describe, beforeEach, test, expect } from 'vitest';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite';
import { LmdbKVStore } from '../src/kv-store/storage/lmdb';
import { IndexedDbKVStore } from '../src/kv-store/storage/indexed-db';
import { KVStoreOrTransaction } from '../src/types';
import { KVDoubleBuffer } from '../src/double-buffer';
import { DurableWriteBuffer } from '../src/durable-write-buffer.ts';
import 'fake-indexeddb/auto';

// filepath: /Users/pbohlman/aspen/triplit-internal/public/packages/db/test/double-buffer.spec.ts

const btree = new BTreeKVStore();
const sqliteDb = sqlite(':memory:');
sqliteDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
const sqliteKv = new SQLiteKVStore(sqliteDb);
const lmdb = open({});
const lmdbKv = new LmdbKVStore(lmdb);
const idb = new IndexedDbKVStore('test-double-buffer');

describe.each([
  { label: 'BTree', store: btree },
  { label: 'SQLite', store: sqliteKv },
  { label: 'LMDB', store: lmdbKv },
  { label: 'IndexedDB', store: idb },
])('DoubleBuffer with $label store', ({ store }) => {
  let bufferA: DurableWriteBuffer;
  let bufferB: DurableWriteBuffer;
  let doubleBuffer: KVDoubleBuffer;
  let tx: KVStoreOrTransaction;

  beforeEach(async () => {
    bufferA = new DurableWriteBuffer(['bufferA']);
    bufferB = new DurableWriteBuffer(['bufferB']);
    doubleBuffer = new KVDoubleBuffer(bufferA, bufferB);
    await store.clear();
    tx = store;
  });

  test('writes to active buffer and retrieves merged changes', async () => {
    await doubleBuffer.write(tx, {
      collectionA: {
        sets: new Map([['1', { test: 'foo' }]]),
        deletes: new Set(),
      },
    });
    let lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.collectionA).toBe(undefined);

    let changes = await doubleBuffer.getChanges(tx);
    expect(changes.collectionA?.sets?.get('1')).toEqual({ test: 'foo' });

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      collectionA: {
        sets: new Map([['1', { override: 'bar' }]]),
        deletes: new Set(['2']),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.collectionA?.sets?.has('1')).toBe(true);
    expect(lockedChanges.collectionA?.deletes?.has('2')).toBe(false);

    changes = await doubleBuffer.getChanges(tx);
    expect(changes.collectionA?.sets?.get('1')).toEqual({
      override: 'bar',
      test: 'foo',
    });
    expect(changes.collectionA?.deletes?.has('2')).toBe(true);
  });

  test('getChangesForCollection merges from both buffers with active taking precedence', async () => {
    await doubleBuffer.write(tx, {
      coll1: {
        sets: new Map([['key1', { foo: 'bar', baz: 'qux' }]]),
        deletes: new Set(),
      },
    });
    let lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll1).toBe(undefined);

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      coll1: {
        sets: new Map([['key1', { otherKey: 'override' }]]),
        deletes: new Set(['oldKey']),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll1?.sets?.has('key1')).toBe(true);
    expect(lockedChanges.coll1?.deletes?.has('oldKey')).toBe(false);

    const collChanges = await doubleBuffer.getChangesForCollection(tx, 'coll1');
    expect(collChanges?.sets?.get('key1')).toEqual({
      foo: 'bar',
      otherKey: 'override',
      baz: 'qux',
    });
    expect(collChanges?.deletes?.has('oldKey')).toBe(true);
  });

  test('getChangesForEntity merges correctly, active buffer wins', async () => {
    await doubleBuffer.write(tx, {
      coll2: {
        sets: new Map([['e1', { val: 'A' }]]),
        deletes: new Set(),
      },
    });
    let lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll2).toBe(undefined);

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      coll2: {
        sets: new Map([['e1', { val: 'B', extra: 'C' }]]),
        deletes: new Set(),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    let unlockedChanges = await doubleBuffer.getUnlockedBuffer().getChanges(tx);
    expect(lockedChanges.coll2?.sets?.has('e1')).toBe(true);
    expect(unlockedChanges.coll2?.sets?.has('e1')).toBe(true);
    const e1 = await doubleBuffer.getChangesForEntity(tx, 'coll2', 'e1');
    expect(e1).toEqual({ update: { val: 'B', extra: 'C' }, delete: false });
  });

  test('clear resets both buffers', async () => {
    await doubleBuffer.write(tx, {
      coll3: {
        sets: new Map([['1', { data: 'test' }]]),
        deletes: new Set(['2']),
      },
    });
    let lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll3).toBe(undefined);

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      coll3: {
        sets: new Map([['3', { data: 'another' }]]),
        deletes: new Set(['4']),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll3?.sets?.has('3')).toBe(false);
    expect(lockedChanges.coll3?.deletes?.has('4')).toBe(false);
    let unlockedChanges = await doubleBuffer.getUnlockedBuffer().getChanges(tx);
    expect(unlockedChanges.coll3?.sets?.has('3')).toBe(true);
    expect(unlockedChanges.coll3?.deletes?.has('4')).toBe(true);

    await doubleBuffer.clear(tx as any);
    const changes = await doubleBuffer.getChanges(tx);
    expect(changes).toEqual({});
  });

  test('clearChangesForEntity clears from both buffers', async () => {
    await doubleBuffer.write(tx, {
      coll4: {
        sets: new Map([['1', { keep: 'x' }]]),
        deletes: new Set(['2']),
      },
    });
    let lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll4).toBe(undefined);

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      coll4: {
        sets: new Map([['1', { override: 'y' }]]),
        deletes: new Set(['3']),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll4?.sets?.has('1')).toBe(true);
    expect(lockedChanges.coll4?.deletes?.has('3')).toBe(false);

    await doubleBuffer.clearChangesForEntity(tx as any, 'coll4', '1');
    const coll4Changes = await doubleBuffer.getChangesForCollection(
      tx,
      'coll4'
    );
    expect(coll4Changes?.sets?.has('1')).toBe(false);
  });

  test('isEmpty checks both buffers', async () => {
    let empty = await doubleBuffer.isEmpty(tx);
    expect(empty).toBe(true);

    await doubleBuffer.write(tx, {
      coll5: {
        sets: new Map([['a', { something: 'here' }]]),
        deletes: new Set(),
      },
    });
    const lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll5).toBe(undefined);

    empty = await doubleBuffer.isEmpty(tx);
    expect(empty).toBe(false);
  });

  test('lockAndSwitchBuffers changes the active buffer', async () => {
    expect(doubleBuffer.getUnlockedBuffer()).toBeTruthy();
    expect(doubleBuffer.getLockedBuffer()).toBeTruthy();
    const firstActive = doubleBuffer.getUnlockedBuffer();
    doubleBuffer.lockAndSwitchBuffers();
    const secondActive = doubleBuffer.getUnlockedBuffer();
    expect(firstActive).not.toBe(secondActive);
  });

  test('getLockedBuffer returns the inactive one', async () => {
    const lockedBefore = doubleBuffer.getLockedBuffer();
    doubleBuffer.lockAndSwitchBuffers();
    const lockedAfter = doubleBuffer.getLockedBuffer();
    expect(lockedBefore).not.toBe(lockedAfter);
  });

  test('write with multiple switches preserves final active changes', async () => {
    await doubleBuffer.write(tx, {
      coll6: {
        sets: new Map([['entity', { fromA: true }]]),
        deletes: new Set(),
      },
    });
    let lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll6).toBe(undefined);

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      coll6: {
        sets: new Map([['entity', { fromB: true }]]),
        deletes: new Set(),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll6?.sets?.has('entity')).toBe(true);

    doubleBuffer.lockAndSwitchBuffers();
    await doubleBuffer.write(tx, {
      coll6: {
        sets: new Map([['entity', { final: true }]]),
        deletes: new Set(),
      },
    });
    lockedChanges = await doubleBuffer.getLockedBuffer().getChanges(tx);
    expect(lockedChanges.coll6?.sets?.has('entity')).toBe(true);

    const changes = await doubleBuffer.getChanges(tx);
    expect(changes.coll6?.sets?.get('entity')).toEqual({
      final: true,
      fromA: true,
      fromB: true,
    });
  });
});
