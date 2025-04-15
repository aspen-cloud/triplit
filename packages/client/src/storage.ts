import { KVStore, TriplitError } from '@triplit/db';
import { IndexedDbKVStore } from './storage/indexed-db.js';
import { IndexedDbUnavailableError } from './errors.js';
import { BTreeKVStore } from './storage/memory-btree.js';
import {
  SerializableStorageOptions,
  SerializableIndexedDBOptions,
  SimpleStorageOrInstances,
  SerializableMemoryOptions,
} from './types.js';

function isStorageInputInstance(arg: any): arg is SerializableStorageOptions {
  return typeof arg === 'string' || 'type' in arg;
}

function isMemoryOptions(
  arg: SerializableStorageOptions
): arg is SerializableMemoryOptions {
  return (
    (typeof arg === 'string' && arg === 'memory') ||
    (typeof arg === 'object' && arg.type === 'memory')
  );
}

function isIndexedDBOptions(
  arg: SerializableStorageOptions
): arg is SerializableIndexedDBOptions {
  return (
    (typeof arg === 'string' && arg === 'indexeddb') ||
    (typeof arg === 'object' && arg.type === 'indexeddb')
  );
}

export function getClientStorage(
  storageOption: SimpleStorageOrInstances
): KVStore {
  if (!isStorageInputInstance(storageOption)) return storageOption;
  if (isMemoryOptions(storageOption)) {
    return new BTreeKVStore();
  }
  if (isIndexedDBOptions(storageOption)) {
    if (typeof indexedDB === 'undefined') {
      throw new IndexedDbUnavailableError();
    }
    if (typeof storageOption === 'object') {
      if (storageOption.options) {
        return new IndexedDbKVStore(
          storageOption.name ?? 'triplit',
          storageOption.options
        );
      }
      return new IndexedDbKVStore(storageOption.name ?? 'triplit');
    }
    return new IndexedDbKVStore('triplit');
  }
  throw new TriplitError('Failed to parse storage input');
}

export const DEFAULT_STORAGE_OPTION = 'memory';
