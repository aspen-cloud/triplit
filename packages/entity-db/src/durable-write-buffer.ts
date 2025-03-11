import {
  Change,
  CollectionChanges,
  CollectionName,
  DBChanges,
  EntityId,
  KVStoreOrTransaction,
  KVStoreTransaction,
  WriteBuffer,
} from './types.js';
import { deepObjectAssign } from './utils/deep-merge.js';

export class DurableWriteBuffer implements WriteBuffer {
  constructor(private readonly storagePrefix: string[] = []) {}
  async clear(tx: KVStoreTransaction): Promise<void> {
    // TODO figure out better more efficient way to clear at the KV level
    // E.g. by prefix
    const scopedTx = tx.scope(this.storagePrefix);
    const allTuples = scopedTx.scan({ prefix: [] });
    for await (const [key] of allTuples) {
      await scopedTx.delete(key);
    }
  }
  async write(tx: KVStoreTransaction, changes: DBChanges): Promise<void> {
    const scopedTx = tx.scope(this.storagePrefix);
    for (const collection in changes) {
      const collectionChanges = changes[collection];
      // important to apply deletes before sets
      for (const id of collectionChanges.deletes) {
        const existingSet = await scopedTx.get([collection, 'sets', id]);
        if (existingSet) {
          await scopedTx.delete([collection, 'sets', id]);
          // we're going to skip setting the delete
          // if we just "deleted" an insertion
          if ('id' in existingSet) continue;
        }
        await scopedTx.set([collection, 'deletes', id], true);
      }
      for (const [id, change] of collectionChanges.sets) {
        const key = [collection, 'sets', id];
        const existingSet = await scopedTx.get(key);
        let newValue = change;
        if (existingSet) {
          newValue = deepObjectAssign(existingSet, change);
        }
        await scopedTx.set(key, newValue);
      }
    }
  }
  async getChanges(storage: KVStoreOrTransaction): Promise<DBChanges> {
    const scopedStorage = storage.scope(this.storagePrefix);

    const changeData = scopedStorage.scan({ prefix: [] });
    let changes: DBChanges | undefined = {};
    for await (const [changeTuple, val] of changeData) {
      const setOrDelete = changeTuple[1] as 'sets' | 'deletes';
      if (setOrDelete === 'sets') {
        const [collection, _set, id] = changeTuple as string[];
        if (!changes[collection]) {
          changes[collection] = { sets: new Map(), deletes: new Set() };
        }
        let set = val;
        const existing = changes[collection].sets.get(id);
        if (existing) {
          set = deepObjectAssign({}, existing, val);
        }
        changes[collection].sets.set(id, set);
      }
      if (setOrDelete === 'deletes') {
        const [collection, _delete, id] = changeTuple as string[];
        if (!changes[collection]) {
          changes[collection] = { sets: new Map(), deletes: new Set() };
        }
        changes[collection].deletes.add(id);
      }
    }
    if (!changes) return {};
    // TODO: might need to handle deserialization into Map/Set
    return changes;
  }
  async getChangesForCollection(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName
  ): Promise<CollectionChanges | undefined> {
    const scopedStorage = storage.scope(this.storagePrefix);
    const changes: CollectionChanges = { sets: new Map(), deletes: new Set() };
    for await (const [key, value] of scopedStorage.scan({
      prefix: [collectionName, 'sets'],
    })) {
      const [id] = key as [string];
      changes.sets.set(id, value);
    }
    for await (const [key] of scopedStorage.scan({
      prefix: [collectionName, 'deletes'],
    })) {
      const [id] = key as [string];
      changes.deletes.add(id);
    }
    if (changes.sets.size === 0 && changes.deletes.size === 0) return undefined;
    return changes;
  }

  async getChangesForEntity(
    storage: KVStoreOrTransaction,
    collectionName: CollectionName,
    id: EntityId
  ): Promise<{ update: Change; delete: boolean } | undefined> {
    const scopedStorage = storage.scope(this.storagePrefix);
    const update = await scopedStorage.get([collectionName, 'sets', id]);
    const _delete = await scopedStorage.get([collectionName, 'deletes', id]);

    if (update === undefined && _delete === undefined) return undefined;
    return { update, delete: _delete !== undefined };
  }
  async isEmpty(storage: KVStoreOrTransaction): Promise<boolean> {
    const changes = await this.getChanges(storage);
    return Object.keys(changes).length === 0;
  }

  async clearChangesForEntity(
    tx: KVStoreTransaction,
    collection: CollectionName,
    id: EntityId
  ): Promise<void> {
    const scopedTx = tx.scope(this.storagePrefix);
    await scopedTx.delete([collection, 'sets', id]);
    await scopedTx.delete([collection, 'deletes', id]);
  }
}
