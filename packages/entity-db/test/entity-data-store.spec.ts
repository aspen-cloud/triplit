import { beforeEach, describe, expect, it } from 'vitest';
import { EntityDataStore } from '../src/entity-data-store';
import { ApplyChangesOptions, DBChanges, KVStore } from '../src/types';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree';

const defaultOptions: ApplyChangesOptions = {
  checkWritePermission: undefined,
};

describe('EntityDataStore', () => {
  let kvStore: KVStore;
  let entityDataStore: EntityDataStore;

  beforeEach(() => {
    kvStore = new BTreeKVStore();
    entityDataStore = new EntityDataStore();
  });

  describe('applyChanges', () => {
    it('should apply changes to the store', async () => {
      const changes: DBChanges = {
        users: {
          sets: new Map([
            ['1', { name: 'Alice' }],
            ['2', { name: 'Bob' }],
          ]),
          deletes: new Set(),
        },
      };

      const tx = kvStore.transact();
      await entityDataStore.applyChanges(tx, changes, defaultOptions);
      await tx.commit();
      expect(await kvStore.get(['users', '1'])).toEqual({ name: 'Alice' });
      expect(await kvStore.get(['users', '2'])).toEqual({ name: 'Bob' });
    });

    it('should delete entities when change is null', async () => {
      await kvStore.set(['users', '1'], { name: 'Alice' });
      const changes: DBChanges = {
        users: { sets: new Map(), deletes: new Set(['1']) },
      };

      const tx = kvStore.transact();
      await entityDataStore.applyChanges(tx, changes, defaultOptions);
      await tx.commit();
      expect(await kvStore.get(['users', '1'])).toBeUndefined();
    });

    it('should merge changes with existing entities', async () => {
      await kvStore.set(['users', '1'], { name: 'Alice', age: 30 });
      const changes: DBChanges = {
        users: { sets: new Map([['1', { age: 31 }]]), deletes: new Set() },
      };
      const tx = kvStore.transact();
      await entityDataStore.applyChanges(tx, changes, defaultOptions);
      await tx.commit();
      expect(await kvStore.get(['users', '1'])).toEqual({
        name: 'Alice',
        age: 31,
      });
    });
  });
});
