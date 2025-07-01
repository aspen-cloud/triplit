// TODO: possibly deprecated? Currently unused
import {
  type WriteBuffer,
  type DBChanges,
  CollectionChanges,
  CollectionName,
  EntityId,
  Change,
  KVStoreOrTransaction,
} from './types.js';
import { deepObjectAssign } from './utils/deep-merge.js';

// TODO: use kv tx
// @ts-expect-error - deprecated, remove if used and fill out interface
export class SimpleMemoryWriteBuffer implements WriteBuffer {
  private _changes: DBChanges = {};
  constructor() {}
  clear(tx: KVStoreOrTransaction): Promise<void> {
    this._changes = {};
    return Promise.resolve();
  }
  write(tx: KVStoreOrTransaction, changes: DBChanges): Promise<void> {
    mergeDBChanges(this._changes, changes);
    return Promise.resolve();
  }
  getChanges(storage: KVStoreOrTransaction): Promise<DBChanges> {
    return Promise.resolve(this._changes);
  }
  getChangesForCollection(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName
  ): Promise<CollectionChanges | undefined> {
    return Promise.resolve(this._changes[collectionName]);
  }
  getChangesForEntity(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName,
    id: EntityId
  ): Promise<{ update: Change; delete: boolean } | undefined> {
    const collectionChanges = this._changes[collectionName];
    if (!collectionChanges) return Promise.resolve(undefined);
    const update = collectionChanges.sets.get(id);
    if (!update) return Promise.resolve(undefined);
    return Promise.resolve({
      update,
      delete: collectionChanges.deletes.has(id),
    });
  }
  isEmpty(storage: KVStoreOrTransaction): Promise<boolean> {
    return Promise.resolve(isEmpty(this._changes));
  }
}

export function mergeDBChanges(
  target: DBChanges,
  ...sources: DBChanges[]
): DBChanges {
  for (const source of sources) {
    for (const collection of Object.keys(source)) {
      const collectionChanges = source[collection];
      if (!collectionChanges) continue;
      if (!target[collection]) {
        target[collection] = {
          sets: new Map(),
          deletes: new Set(),
        };
      }
      for (const id of collectionChanges.deletes) {
        target[collection].sets.delete(id);
        target[collection].deletes.add(id);
      }
      for (const [key, value] of collectionChanges.sets.entries()) {
        const targetValue = target[collection].sets.get(key);
        if (!targetValue) {
          target[collection].sets.set(key, value);
        } else {
          deepObjectAssign(targetValue, value);
        }
      }
    }
  }
  return target;
}

export function isEmpty(obj: any) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

// TODO: give this a better name, or fix the logic
// Currently this will return `true` for an object like { a: new Set([1,2,3]) } ... is that correct? Because that doesnt seem empty
export function deepIsEmpty(obj: any) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      if (
        typeof obj[prop] === 'object' &&
        obj[prop] !== null &&
        !Array.isArray(obj[prop])
      ) {
        if (!deepIsEmpty(obj[prop])) {
          return false;
        }
      } else {
        return false;
      }
    }
  }
  return true;
}

export function areChangesEmpty(changes: DBChanges | undefined | null) {
  return (
    !changes ||
    Object.values(changes).every(
      (collectionChanges) =>
        collectionChanges.sets.size === 0 &&
        collectionChanges.deletes.size === 0
    )
  );
}
