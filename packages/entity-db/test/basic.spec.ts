import { DB } from '../src/db.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { Triple } from '../src/types.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';

describe('Basic stuff', async () => {
  let db: DB;

  beforeEach(() => {
    db = new DB();
  });

  describe('Basic API', async () => {
    it('can insert', async () => {
      await db.insert('users', { id: '1', name: 'Alice', age: 30 });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
      ]);
    });
    it('can delete', async () => {
      await db.insert('users', { id: '1', name: 'Alice', age: 30 });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
      ]);
      await db.delete('users', '1');
      expect(await db.fetch({ collectionName: 'users' })).toEqual([]);
    });
    it('can update', async () => {
      await db.insert('users', { id: '1', name: 'Alice', age: 30 });
      await db.update('users', '1', { name: 'Alice Smith' });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice Smith',
          age: 30,
        },
      ]);
    });
    it("can see changes it's made inside a transaction", async () => {
      await db.insert('users', { id: '2', name: 'Bob', age: 40 });
      await db.transact(async (tx) => {
        await tx.insert('users', { id: '1', name: 'Alice', age: 30 });
        expect(await tx.fetch({ collectionName: 'users' })).toEqual([
          { id: '2', name: 'Bob', age: 40 },
          {
            id: '1',
            name: 'Alice',
            age: 30,
          },
        ]);
        expect(await db.fetch({ collectionName: 'users' })).toEqual([
          { id: '2', name: 'Bob', age: 40 },
        ]);
        await tx.update('users', '2', { name: 'not Bob' });
        expect(
          await tx.fetch({ collectionName: 'users', where: [['id', '=', '2']] })
        ).toEqual([{ id: '2', name: 'not Bob', age: 40 }]);
        await tx.delete('users', '2');
        expect(await tx.fetch({ collectionName: 'users' })).toEqual([
          {
            id: '1',
            name: 'Alice',
            age: 30,
          },
        ]);
      });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
      ]);
    });
    it('can semantically delete and insert inside the same transaction', async () => {
      await db.insert('users', {
        id: '1',
        name: 'Alice',
        age: 30,
        extraAttribute: true,
      });
      await db.transact(async (tx) => {
        await tx.delete('users', '1');
        await tx.insert('users', { id: '1', name: 'Alice', age: 31 });
        expect(await tx.fetch({ collectionName: 'users' })).toEqual([
          {
            id: '1',
            name: 'Alice',
            age: 31,
          },
        ]);
      });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 31,
        },
      ]);
    });
    // TODO TBD what we want to do here
    it.skip('should throw an error if you attempt to insert an entity that already exists', async () => {
      await db.insert('users', { id: '1', name: 'Alice', age: 30 });
      await expect(
        db.insert('users', { id: '1', name: 'Malice', age: 30 })
      ).rejects.toThrowError();
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
      ]);
      await db.transact(async (tx) => {
        await tx.insert('users', { id: '2', name: 'Bob', age: 30 });
        await expect(
          tx.insert('users', { id: '2', name: 'Rob', age: 30 })
        ).rejects.toThrowError();
      });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
        {
          id: '2',
          name: 'Bob',
          age: 30,
        },
      ]);
    });
    it('should query entities based on conditions', async () => {
      await db.insert('users', { id: '1', name: 'Alice', age: 30 });
      await db.insert('users', { id: '2', name: 'Bob', age: 25 });

      const results = await db.fetch({
        collectionName: 'users',
        where: [['age', '>', 26]],
      });
      expect(results).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
      ]);
      const results2 = await db.fetch({
        collectionName: 'users',
        where: [['age', '<', 26]],
      });
      expect(results2).toEqual([
        {
          id: '2',
          name: 'Bob',
          age: 25,
        },
      ]);
      const results3 = await db.fetch({
        collectionName: 'users',
        where: [['age', '<', 20]],
      });
      expect(results3).toEqual([]);
    });
  });

  describe.todo('Triple inserts', async () => {
    it('should apply conflicting edits correctly using insertTriples', async () => {
      const timestamp1 = db.clock.next();
      const timestamp2 = db.clock.next();

      const triples1: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice',
          timestamp: timestamp1,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 30,
          timestamp: timestamp1,
          collection: 'users',
        },
      ];

      const triples2: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice Smith',
          timestamp: timestamp2,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 31,
          timestamp: timestamp2,
          collection: 'users',
        },
      ];

      await db.insertTriples(triples1);
      await db.insertTriples(triples2);

      const entities = db.entityStore;
      expect(await entities.getEntity(db.kv, 'users', '1')).toEqual({
        name: 'Alice Smith',
        age: 31,
      });
    });

    it('should handle concurrent edits from multiple writers', async () => {
      const timestamp1 = db.clock.next();
      const timestamp2 = db.clock.next();
      const timestamp3 = db.clock.next();

      const triples1: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice',
          timestamp: timestamp1,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 30,
          timestamp: timestamp1,
          collection: 'users',
        },
      ];

      const triples2: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice Smith',
          timestamp: timestamp2,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 31,
          timestamp: timestamp2,
          collection: 'users',
        },
      ];

      const triples3: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice Johnson',
          timestamp: timestamp3,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 32,
          timestamp: timestamp3,
          collection: 'users',
        },
      ];

      await db.insertTriples(triples1);
      await db.insertTriples(triples3);
      await db.insertTriples(triples2);

      const entities = db.entityStore;
      expect(await entities.getEntity(db.kv, 'users', '1')).toEqual({
        name: 'Alice Johnson',
        age: 32,
      });
    });

    it('should handle triples applied in different orders', async () => {
      const timestamp1 = db.clock.next();
      const timestamp2 = db.clock.next();

      const triples1: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice',
          timestamp: timestamp1,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 30,
          timestamp: timestamp1,
          collection: 'users',
        },
      ];

      const triples2: Triple[] = [
        {
          id: '1',
          attribute: ['name'],
          value: 'Alice Smith',
          timestamp: timestamp2,
          collection: 'users',
        },
        {
          id: '1',
          attribute: ['age'],
          value: 31,
          timestamp: timestamp2,
          collection: 'users',
        },
      ];

      await db.insertTriples(triples2);
      await db.insertTriples(triples1);

      const entities = db.entityStore;
      expect(await entities.getEntity(db.kv, 'users', '1')).toEqual({
        name: 'Alice Smith',
        age: 31,
      });
    });
  });

  describe('Diff application', async () => {
    it('should apply diffs correctly', async () => {
      {
        const tx = db.kv.transact();
        await db.entityStore.applyChangesWithTimestamp(
          tx,
          {
            users: {
              sets: new Map([['1', { id: '1', name: 'Alice', age: 30 }]]),
              deletes: new Set(),
            },
          },
          db.clock.next(),
          { checkWritePermission: undefined }
        );
        await tx.commit();
      }
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
        },
      ]);
      {
        const tx = db.kv.transact();
        await db.entityStore.applyChangesWithTimestamp(
          tx,
          {
            users: {
              sets: new Map([['1', { name: 'Alice Smith' }]]),
              deletes: new Set(),
            },
          },
          db.clock.next(),
          { checkWritePermission: undefined }
        );
        await tx.commit();
      }

      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice Smith',
          age: 30,
        },
      ]);
      {
        const tx = db.kv.transact();
        await db.entityStore.applyChangesWithTimestamp(
          tx,
          {
            users: {
              sets: new Map().set('1', { age: 28 }),
              deletes: new Set(),
            },
          },
          [0, 0, 'alice'],
          { checkWritePermission: undefined }
        );
        await tx.commit();
      }
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice Smith',
          age: 30,
        },
      ]);
    });
    it('can handle deeply nested diffs', async () => {
      await db.insert('users', {
        id: '1',
        name: 'Alice',
        age: 30,
        address: { city: 'NYC', state: 'NY' },
      });
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
          address: { city: 'NYC', state: 'NY' },
        },
      ]);
      {
        const tx = db.kv.transact();
        await db.entityStore.applyChangesWithTimestamp(
          tx,
          {
            users: {
              sets: new Map().set('1', {
                address: { city: 'LA' },
              }),
              deletes: new Set(),
            },
          },
          db.clock.next(),
          { checkWritePermission: undefined }
        );
        await tx.commit();
      }
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
          address: { city: 'LA', state: 'NY' },
        },
      ]);
      {
        const tx = db.kv.transact();
        await db.entityStore.applyChangesWithTimestamp(
          tx,
          {
            users: {
              sets: new Map().set('1', {
                address: { city: 'SF' },
              }),
              deletes: new Set(),
            },
          },
          [0, 0, 'alice'],
          { checkWritePermission: undefined }
        );
        await tx.commit();
      }
      expect(await db.fetch({ collectionName: 'users' })).toEqual([
        {
          id: '1',
          name: 'Alice',
          age: 30,
          address: { city: 'LA', state: 'NY' },
        },
      ]);
    });
  });
  it('can query relations', async () => {
    await db.insert('users', { id: '1', name: 'Alice', age: 30 });
    await db.insert('users', { id: '2', name: 'Bob', age: 25 });
    await db.insert('todos', {
      id: '1',
      text: 'Buy milk',
      completed: false,
      author_id: '1',
    });
    await db.insert('todos', {
      id: '2',
      text: 'Buy eggs',
      completed: true,
      author_id: '1',
    });
    await db.insert('todos', {
      id: '3',
      text: 'Buy bread',
      completed: false,
      author_id: '1',
    });

    const results = await db.fetch({
      collectionName: 'users',
      where: [
        {
          exists: {
            collectionName: 'todos',
            where: [['author_id', '=', '$1.id']],
          },
        },
      ],
    });
    expect(results).toEqual([
      {
        id: '1',
        name: 'Alice',
        age: 30,
      },
    ]);
  });
});
