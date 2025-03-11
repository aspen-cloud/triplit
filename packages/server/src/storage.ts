import { require } from './utils/esm.js';
import { KVStore, TriplitError } from '@triplit/entity-db';
import { SQLiteKVStore } from '@triplit/entity-db/storage/sqlite';
import { BTreeKVStore } from '@triplit/entity-db/storage/memory-btree';
import { LmdbKVStore } from '@triplit/entity-db/storage/lmdb';

export const durableStoreKeys = ['lmdb', 'sqlite'] as const;
export const inMemoryStoreKeys = ['memory', 'memory-btree'] as const;
export const storeKeys = [...durableStoreKeys, ...inMemoryStoreKeys] as const;

export type DurableStoreKeys = (typeof durableStoreKeys)[number];
export type InMemoryStoreKeys = (typeof inMemoryStoreKeys)[number];
export type StoreKeys = (typeof storeKeys)[number];

function getStoragePath() {
  if (!process.env.LOCAL_DATABASE_URL) {
    throw new TriplitError(
      'Environment variable LOCAL_DATABASE_URL is not set.'
    );
  }
  return process.env.LOCAL_DATABASE_URL;
}

/**
 * Default implementation of the storage interface using an in-memory store (default is BTree)
 */
export function defaultMemoryStorage() {
  return new BTreeKVStore();
}

/**
 * Default implementation of the storage interface using an in memory BTree
 */
export function defaultBTreeStorage() {
  return new BTreeKVStore();
}

export function defaultSqliteKVStore() {
  const dbPath = getStoragePath();
  const sqlite = require('better-sqlite3');
  const db = sqlite(dbPath);
  db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = memory;
      PRAGMA mmap_size = 30000000000;
    `);
  return new SQLiteKVStore(db);
}

export function defaultLmdbKVStore() {
  const dbPath = getStoragePath();
  const LMDB = require('lmdb');
  const lmdb = LMDB.open(dbPath, {});
  return new LmdbKVStore(lmdb);
}

// Legacy types: 'file', 'leveldb', 'memory-array'
export function createTriplitStorageProvider(storage: StoreKeys): KVStore {
  switch (storage) {
    case 'lmdb':
      return defaultLmdbKVStore();
    case 'memory':
      return defaultMemoryStorage();
    case 'memory-btree':
      return defaultBTreeStorage();
    case 'sqlite':
      return defaultSqliteKVStore();
    default:
      throw new TriplitError(`Invalid storage option: ${storage}`);
  }
}
