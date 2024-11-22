import { FileTupleStorage } from '@triplit/db/storage/file';
import { LevelTupleStorage } from '@triplit/db/storage/level-db';
import { LMDBTupleStorage } from '@triplit/db/storage/lmdb';
import { MemoryArrayStorage } from '@triplit/db/storage/memory-array';
import { MemoryBTreeStorage } from '@triplit/db/storage/memory-btree';
import { SQLiteTupleStorage } from '@triplit/db/storage/sqlite';
import { BunSQLiteTupleStorage } from '@triplit/db/storage/bun-sqlite';
import { require } from './utils/esm.js';
import { TriplitError, type Storage } from '@triplit/db';

export const durableStoreKeys = [
  'file',
  'leveldb',
  'lmdb',
  'sqlite',
  'bun-sqlite',
] as const;
export const inMemoryStoreKeys = [
  'memory',
  'memory-array',
  'memory-btree',
] as const;
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
 * Default implementation of the storage interface using a file system store
 */
export function defaultFileStorage() {
  const filePath = getStoragePath();
  return new FileTupleStorage(filePath);
}

/**
 * Default implementation of the storage interface using LevelDB
 */
export function defaultLevelDBStorage() {
  const dbPath = getStoragePath();
  const { Level } = require('level');
  const level = new Level(dbPath);
  return new LevelTupleStorage(level);
}

/**
 * Default implementation of the storage interface using LMDB
 */
export function defaultLMDBStorage() {
  const dbPath = getStoragePath();
  const LMDB = require('lmdb');
  return new LMDBTupleStorage((options) =>
    LMDB.open(dbPath, {
      ...options,
    })
  );
}

/**
 * Default implementation of the storage interface using an in-memory store (default is BTree)
 */
export function defaultMemoryStorage() {
  return new MemoryBTreeStorage();
}

/**
 * Default implementation of the storage interface using an in memory BTree
 */
export function defaultArrayStorage() {
  return new MemoryArrayStorage();
}

/**
 * Default implementation of the storage interface using an in memory BTree
 */
export function defaultBTreeStorage() {
  return new MemoryBTreeStorage();
}

/**
 * Default implementation of the storage interface using SQLite
 */
export function defaultSQLiteStorage() {
  const dbPath = getStoragePath();
  const sqlite = require('better-sqlite3');
  const db = sqlite(dbPath);
  db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = memory;
      PRAGMA mmap_size = 30000000000;
    `);
  return new SQLiteTupleStorage(db);
}

export function defaultBunSqliteStorage() {
  const dbPath = getStoragePath();
  const bunSqlite = require('bun:sqlite');
  const db = new bunSqlite.Database(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = memory;
    PRAGMA mmap_size = 30000000000;
  `);
  return new BunSQLiteTupleStorage(db);
}

export function createTriplitStorageProvider(storage: StoreKeys): Storage {
  switch (storage) {
    case 'file':
      return defaultFileStorage();
    case 'leveldb':
      return defaultLevelDBStorage();
    case 'lmdb':
      return defaultLMDBStorage();
    case 'memory':
      return defaultMemoryStorage();
    case 'memory-array':
      return defaultBTreeStorage();
    case 'memory-btree':
      return defaultArrayStorage();
    case 'sqlite':
      return defaultSQLiteStorage();
    case 'bun-sqlite':
      return defaultBunSqliteStorage();
    default:
      throw new TriplitError(`Invalid storage option: ${storage}`);
  }
}
