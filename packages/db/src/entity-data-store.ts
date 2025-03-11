import {
  CollectionName,
  DBChanges,
  DBEntity,
  KVStoreTransaction,
  KVStoreOrTransaction,
  EntityStore,
  ApplyChangesOptions,
} from './types.js';
import { deepObjectAssign } from './utils/deep-merge.js';

export class EntityDataStore implements EntityStore {
  constructor(public storagePrefix: string[] = []) {}

  getEntity(
    storage: KVStoreOrTransaction,
    collection: string,
    id: string
  ): Promise<DBEntity | undefined> {
    const prefixedStorage = storage.scope(this.storagePrefix);
    return prefixedStorage.get([collection, id]);
  }

  async getCollectionStats(
    storage: KVStoreOrTransaction,
    knownCollections: CollectionName[] | undefined
  ): Promise<Map<string, number>> {
    const prefixedStorage = storage.scope(this.storagePrefix);
    const stats = new Map<string, number>();
    if (knownCollections) {
      for (const collection of knownCollections) {
        const count = await prefixedStorage.count({ prefix: [collection] });
        stats.set(collection, count);
      }
    } else {
      for await (const [[collection]] of prefixedStorage.scan({
        prefix: [],
      })) {
        stats.set(
          collection as string,
          (stats.get(collection as string) || 0) + 1
        );
      }
    }

    return stats;
  }

  async applyChanges(
    tx: KVStoreTransaction,
    changes: DBChanges,
    options: ApplyChangesOptions
  ): Promise<DBChanges> {
    const prefixedTx = tx.scope(this.storagePrefix);
    const appliedChanges: DBChanges = {};
    for (const [collection, collectionChanges] of Object.entries(changes)) {
      for (const id of collectionChanges.deletes) {
        if (options.checkWritePermission) {
          // If we're checking permissions, fetch the deleted entity and check
          const current = await this.getEntity(tx, collection, id);
          await options.checkWritePermission(tx, collection, current, 'delete');
        }
        await prefixedTx.delete([collection, id]);
        // TODO check if entity actually exists
        if (!appliedChanges[collection]) {
          appliedChanges[collection] = { deletes: new Set(), sets: new Map() };
        }
        appliedChanges[collection].deletes.add(id);
      }
      for (const [id, change] of collectionChanges.sets.entries()) {
        const changeIsInsert = !!change.id;
        if (changeIsInsert) {
          // Check insert permissions for new entity
          if (options.checkWritePermission) {
            await options.checkWritePermission(
              tx,
              collection,
              change,
              'insert'
            );
          }
        }

        const current = await this.getEntity(tx, collection, id);

        if (options.entityChangeValidator) {
          options.entityChangeValidator(collection, change, {
            // todo: does this same logic need to apply to write permissions
            ignoreRequiredProperties: !changeIsInsert && !!current,
          });
        }

        if (current && changeIsInsert) {
          // throw new Error(
          //   `Inserting entity that already exists: ${collection}/${id}`
          // );
        }

        if (current && !changeIsInsert) {
          // Check that the current value can be updated
          if (options.checkWritePermission) {
            await options.checkWritePermission(
              tx,
              collection,
              current,
              'update'
            );
          }
        }

        const [merged, sets] = applyChange(current, change);

        // Check that the updated value is valid
        if (!changeIsInsert && options.checkWritePermission) {
          await options.checkWritePermission(
            tx,
            collection,
            merged,
            'postUpdate'
          );
        }

        // All permissions checked, can write
        await prefixedTx.set([collection, id], merged);
        if (!appliedChanges[collection]) {
          appliedChanges[collection] = { deletes: new Set(), sets: new Map() };
        }
        if (Object.keys(sets).length > 0) {
          appliedChanges[collection].sets.set(
            id,
            // @ts-expect-error - Fixup types for Insert vs Change
            sets
          );
        }
      }
    }
    return appliedChanges;
  }

  getEntitiesInCollection(
    storage: KVStoreOrTransaction,
    collection: CollectionName
  ): AsyncIterable<DBEntity> {
    const prefixedStorage = storage.scope(this.storagePrefix);
    return prefixedStorage.scanValues({ prefix: [collection] });
  }
}

/**
 * This will apply the sets to the current value of the entity
 * without mutating the original and will return a filtered down set object
 * based on what was actually overwritten
 * @param curr current value of the entity
 * @param sets sets to apply
 *
 * @returns [new value, sets that were applied]
 */
function applyChange<T extends Record<string, any> | undefined>(
  curr: T,
  sets: Partial<T>
): [T, Partial<T>] {
  if (!curr) return [sets as T, sets];
  const updated = structuredClone(curr);
  const appliedSets: any = {};
  for (const [key, value] of Object.entries(sets)) {
    const existingValue = updated[key];
    if (
      typeof existingValue === 'object' &&
      existingValue != null &&
      typeof value === 'object' &&
      value != null
    ) {
      const [newValue, newSets] = applyChange(existingValue, value);
      if (Object.keys(newSets).length > 0) {
        appliedSets[key] = deepObjectAssign(appliedSets[key] ?? {}, newSets);
        updated[key] = newValue;
      }
    } else if (updated[key] !== value) {
      appliedSets[key] = value;
      updated[key] = value;
    }
  }
  return [updated, appliedSets];
}
