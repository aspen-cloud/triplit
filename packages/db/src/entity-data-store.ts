import { TriplitError } from './errors.js';
import { isEmpty } from './memory-write-buffer.js';
import {
  CollectionName,
  DBChanges,
  DBEntity,
  KVStoreTransaction,
  KVStoreOrTransaction,
  EntityStore,
  ApplyChangesOptions,
  Change,
  Delta,
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
    const deltas: Delta[] = [];
    const getInsertChangeset = async (
      collection: string,
      id: string,
      change: Change
    ): Promise<Delta> => {
      const current = await this.getEntity(tx, collection, id);
      const isUpsert = !!current;
      if (options.entityChangeValidator) {
        options.entityChangeValidator(collection, change, {
          ignoreRequiredProperties: isUpsert,
        });
      }
      return {
        collection,
        id,
        ...applyChange(current, change),
        operation: isUpsert ? 'upsert' : 'insert',
      };
    };

    const getUpdateChangeset = async (
      collection: string,
      id: string,
      change: Change
    ): Promise<Delta | undefined> => {
      const current = await this.getEntity(tx, collection, id);
      if (!current) return;
      if (options.entityChangeValidator) {
        options.entityChangeValidator(collection, change, {
          ignoreRequiredProperties: true,
        });
      }
      const changeset = applyChange(current, change);
      return { collection, id, ...changeset, operation: 'update' };
    };

    const getDeleteChangeset = async (
      collection: string,
      id: string
    ): Promise<Delta> => {
      // Small optimization to not load entity unless we need it
      if (options.checkWritePermission) {
        // If we're checking permissions, fetch the deleted entity and check
        const current = await this.getEntity(tx, collection, id);
        return {
          collection,
          id,
          prev: current,
          next: undefined,
          change: undefined,
          operation: 'delete',
        };
      }
      return {
        collection,
        id,
        prev: undefined,
        next: undefined,
        change: undefined,
        operation: 'delete',
      };
    };

    for (const [collection, collectionChanges] of Object.entries(changes)) {
      for (const id of collectionChanges.deletes) {
        const changeset = await getDeleteChangeset(collection, id);
        await prefixedTx.delete([collection, id]);
        deltas.push(changeset);
      }
      for (const [id, change] of collectionChanges.sets.entries()) {
        const changeIsInsert = !!change.id;
        const changeset = changeIsInsert
          ? await getInsertChangeset(collection, id, change)
          : await getUpdateChangeset(collection, id, change);
        if (!changeset) continue;
        const { prev, next, change: sets } = changeset;
        // Apply changes to the transaction
        await prefixedTx.set([collection, id], next);
        deltas.push(changeset);
      }
    }

    // Check permissions based on deltas
    for (const delta of deltas) {
      if (options.checkWritePermission) {
        if (delta.operation === 'insert') {
          await options.checkWritePermission(tx, delta, 'insert');
        } else if (
          delta.operation === 'update' ||
          delta.operation === 'upsert'
        ) {
          await options.checkWritePermission(tx, delta, 'update');
          await options.checkWritePermission(tx, delta, 'postUpdate');
        } else if (delta.operation === 'delete') {
          await options.checkWritePermission(tx, delta, 'delete');
        } else {
          throw new TriplitError(
            `An invalid delta was created and could not finish permission checks.`
          );
        }
      }
      if (!appliedChanges[delta.collection]) {
        appliedChanges[delta.collection] = {
          deletes: new Set(),
          sets: new Map(),
        };
      }
      if (delta.operation === 'delete') {
        appliedChanges[delta.collection].deletes.add(delta.id);
      } else {
        if (isEmpty(delta.change)) continue;
        appliedChanges[delta.collection].sets.set(delta.id, delta.change);
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
export function applyChange<T extends Record<string, any> | undefined>(
  curr: T,
  sets: Partial<NonNullable<T>>,
  options: {
    // clone: false used in ivm, kinda as a hack
    // Note clone: false will keep prev and next ref the same
    clone?: boolean;
  } = { clone: true }
): { prev: T; next: NonNullable<T>; change: Partial<NonNullable<T>> } {
  if (!curr) return { prev: curr, next: sets as NonNullable<T>, change: sets };
  const updated = options.clone ? structuredClone(curr) : curr;
  const appliedSets: any = {};
  for (const [key, value] of Object.entries(sets)) {
    const existingValue = updated[key];
    if (
      typeof existingValue === 'object' &&
      existingValue != null &&
      typeof value === 'object' &&
      value != null &&
      !Array.isArray(value)
    ) {
      const { next: newValue, change: newSets } = applyChange(
        existingValue,
        value,
        options
      );
      if (!isEmpty(newSets)) {
        appliedSets[key] = deepObjectAssign(appliedSets[key] ?? {}, newSets);
        updated[key] = newValue;
      }
    } else if (updated[key] !== value) {
      appliedSets[key] = value;
      updated[key] = value;
    }
  }
  return { prev: curr, next: updated, change: appliedSets };
}
