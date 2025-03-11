import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DB } from '../src/db.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite.js';
import { LmdbKVStore } from '../src/kv-store/storage/lmdb.js';
import sqlite from 'better-sqlite3';
import { open } from 'lmdb';
const btree = new BTreeKVStore();
const sqliteDb = sqlite('./app.db');
sqliteDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = memory;
  PRAGMA mmap_size = 30000000000;
`);
const sqliteKv = new SQLiteKVStore(sqliteDb);
const lmdb = open('./lmdb', {});
const lmdbKv = new LmdbKVStore(lmdb);
const DB_SIZE = 100000;
describe.each([
  { label: 'btree', kv: btree },
  { label: 'sqlite', kv: sqliteKv },
  // { label: 'lmdb', kv: lmdbKv },
])('$label', async ({ label, kv }) => {
  const db = new DB({ kv });
  await db.transact(async (tx) => {
    for (let i = 0; i < DB_SIZE; i++) {
      await tx.insert('test', { id: `id-${i}`, name: `name-${i}` });
    }
  });
  it('should be faster to use an id equality filter than filter in vanilla js', async () => {
    const entityToGet = `id-${Math.floor(DB_SIZE / 2)}`;
    const start = Date.now();
    const res1 = await db.fetch({
      collectionName: 'test',
      where: [['id', '=', entityToGet]],
    });
    expect(res1.length).toBe(1);
    const withFilterTime = Date.now() - start;
    console.log(`with filter time ${label}`, withFilterTime);
    const start2 = Date.now();

    const res2 = (
      await db.fetch({
        collectionName: 'test',
      })
    ).filter((e) => e.id === entityToGet);
    expect(res2.length).toBe(1);
    const withoutFilterTime = Date.now() - start2;
    console.log(`without filter time ${label}`, withoutFilterTime);
    expect(withFilterTime).toBeLessThan(withoutFilterTime);
  });
  it('should be faster to use an id equality filter than filter in vanilla js with a lot of data', async () => {
    const entitiesToGet: Set<string> = new Set();
    for (let i = 0; i < Math.round(DB_SIZE / 100); i++) {
      entitiesToGet.add(`id-${Math.round(Math.random() * (DB_SIZE - 1))}`);
    }
    const start = Date.now();
    const res1 = await db.fetch({
      collectionName: 'test',
      where: [['id', 'in', Array.from(entitiesToGet)]],
    });
    expect(res1.length).toBe(entitiesToGet.size);
    const withFilterTime = Date.now() - start;
    console.log(`with filter time ${label}`, withFilterTime);
    const start2 = Date.now();
    const res2 = (
      await db.fetch({
        collectionName: 'test',
      })
    ).filter((e) => entitiesToGet.has(e.id));
    const withoutFilterTime = Date.now() - start2;
    expect(res2.length).toBe(entitiesToGet.size);
    console.log(`without filter time ${label}`, withoutFilterTime);
    expect(withFilterTime).toBeLessThan(withoutFilterTime);
  });
});
