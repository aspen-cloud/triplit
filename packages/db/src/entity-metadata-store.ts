import { HybridLogicalClock } from './hybrid-clock.js';
import {
  DBChanges,
  Timestamp,
  KVStoreOrTransaction,
  KVStoreTransaction,
} from './types.js';

export class EntityMetadataStore {
  constructor(public storagePrefix: string[] = []) {}

  async getHighestTimestamp(storage: KVStoreOrTransaction): Promise<Timestamp> {
    const prefixedStorage = storage.scope(this.storagePrefix);
    return (
      (await prefixedStorage.get(['highestTimestamp'])) ??
      HybridLogicalClock.MIN
    );
  }

  /**
   * Applies a set of changes to the metadata store and returns a filtered diff of the changes that were actually applied.
   * Only changes with a timestamp higher than the current highest timestamp in the store will be applied.
   * Additionally, this will update the metadata in the store.
   * @param changes - The changes to be applied.
   * @param timestamp - The timestamp of the changes.
   * @returns The filtered changes that were actually applied.
   */
  async applyChanges(
    tx: KVStoreTransaction,
    changes: DBChanges,
    timestamp: Timestamp
  ): Promise<DBChanges> {
    const scopedTx = tx.scope(this.storagePrefix);
    const highestTimestamp = await this.getHighestTimestamp(tx);

    const flattenedChanges: {
      collectionName: string;
      id: string;
      delete: boolean;
      set: any;
    }[] = [];
    for (const [collection, collectionChanges] of Object.entries(changes)) {
      const changedIds = [
        ...collectionChanges.sets.keys(),
        ...collectionChanges.deletes,
      ];
      for (const id of changedIds) {
        const change = {
          collectionName: collection,
          id,
          delete: collectionChanges.deletes.has(id),
          set: collectionChanges.sets.get(id),
        };
        flattenedChanges.push(change);
      }
    }

    if (HybridLogicalClock.compare(timestamp, highestTimestamp) > 0) {
      // apply timestamp changes
      for (const change of flattenedChanges) {
        await scopedTx.set([change.collectionName, change.id], timestamp);
      }
      // update highest timestamp
      await scopedTx.set(['highestTimestamp'], timestamp);

      return changes;
    }

    const prunedChanges: DBChanges = {};
    for (const change of flattenedChanges) {
      const {
        collectionName: collection,
        id,
        delete: isDelete,
        set: val,
      } = change;
      const key = [collection, id];
      const current = await scopedTx.get(key);
      if (!current || HybridLogicalClock.compare(timestamp, current) > 0) {
        await scopedTx.set(key, timestamp);

        if (!prunedChanges[collection]) {
          prunedChanges[collection] = { sets: new Map(), deletes: new Set() };
        }

        if (isDelete) {
          prunedChanges[collection].deletes.add(id);
        }
        if (val) {
          prunedChanges[collection].sets.set(id, val);
        }
      }
    }

    return prunedChanges;
  }

  async getTimestampForEntity(
    tx: KVStoreOrTransaction,
    collectionName: string,
    entityId: string
  ): Promise<Timestamp | null> {
    const prefixedStorage = tx.scope(this.storagePrefix);
    return prefixedStorage.get([collectionName, entityId]) ?? null;
  }
}
