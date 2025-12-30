import { require } from './utils/esm.js';
import { KVStore, TriplitError } from '@triplit/db';
import { SQLiteKVStore } from '@triplit/db/storage/sqlite';
import { BTreeKVStore } from '@triplit/db/storage/memory-btree';
import { LmdbKVStore } from '@triplit/db/storage/lmdb';
import { SqliteWorkerKvStore } from '@triplit/db/storage/sqlite-worker';
import { SupabasePostgresKVStore } from '@triplit/db/storage/supabase-postgres';

export const durableStoreKeys = [
  'lmdb',
  'sqlite',
  'sqlite-worker',
  'supabase-postgres',
] as const;
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

export async function defaultSqliteKVStore() {
  const dbPath = getStoragePath();
  if (typeof Bun !== 'undefined') {
    const bun = await import('bun:sqlite');
    const db = new bun.Database(dbPath, { create: true });
    const { BunSQLiteKVStore } = await import('@triplit/db/storage/bun-sqlite');
    return new BunSQLiteKVStore(db);
  }
  const sqlite = require('better-sqlite3');
  const db = sqlite(dbPath);
  return new SQLiteKVStore(db);
}

export function defaultSqliteWorkerKVStore() {
  const dbPath = getStoragePath();
  return new SqliteWorkerKvStore(dbPath);
}

export function defaultLmdbKVStore() {
  const dbPath = getStoragePath();
  const LMDB = require('lmdb');
  const lmdb = LMDB.open(dbPath, {});
  return new LmdbKVStore(lmdb);
}

export async function defaultSupabasePostgresKVStore() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const tableName = process.env.SUPABASE_TABLE_NAME;

  if (!supabaseUrl || !supabaseKey) {
    throw new TriplitError(
      'Environment variables SUPABASE_URL and SUPABASE_KEY are required for Supabase storage.'
    );
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  return new SupabasePostgresKVStore(supabase, {
    tableName,
    autoCreateTable: false, // Should be created via migration
  });
}

// Legacy types: 'file', 'leveldb', 'memory-array'
export async function createTriplitStorageProvider(
  storage: StoreKeys
): Promise<KVStore> {
  switch (storage) {
    case 'lmdb':
      return defaultLmdbKVStore();
    case 'memory':
      return defaultMemoryStorage();
    case 'memory-btree':
      return defaultBTreeStorage();
    case 'sqlite':
      return await defaultSqliteKVStore();
    case 'sqlite-worker':
      return defaultSqliteWorkerKVStore();
    case 'supabase-postgres':
      return await defaultSupabasePostgresKVStore();
    default:
      throw new TriplitError(`Invalid storage option: ${storage}`);
  }
}
