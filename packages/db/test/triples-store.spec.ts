import { InMemoryTupleStorage } from 'tuple-database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TripleRow,
  TripleStore,
  TripleStoreTransaction,
} from '../src/triple-store';
import { Schema as S } from '../src/schema';
import { MemoryBTree } from '../src/storage/memory-btree';
import { IndexedDbStorage, MemoryStorage } from '../src';

// const storage = new InMemoryTupleStorage();
const storage = new MemoryBTree();

beforeEach(() => {
  // storage.data = [];
  storage.wipe();
});

// Helper function to test both methods on both store and transaction
async function testStoreAndTx(
  store: TripleStore,
  callback: (
    operator: TripleStore | TripleStoreTransaction
  ) => Promise<void> | void
) {
  await callback(store);
  await store.transact(async (tx) => {
    await callback(tx);
  });
}

describe('triple updates', () => {
  const store = new TripleStore({ storage: storage, tenantId: 'TEST' });

  // TODO: THIS IS NOW A DATALOG CONCERN
  it.todo('triples can be deleted via tombstoning', async () => {
    const id = 'my-id';
    const attribute = ['value'];
    const value = 42;

    store.insertTriple({
      id,
      attribute,
      value,
      timestamp: [1, 'A'],
      expired: false,
    });
    const eavBeforeDelete = await store.findByEntity(id);
    const aveBeforeDelete = await store.findByAttribute(attribute);
    // const vaeBeforeDelete = await store.findByValue(42);
    expect(eavBeforeDelete).toHaveLength(1);
    expect(eavBeforeDelete[0].value).toBe(42);
    expect(aveBeforeDelete).toHaveLength(1);
    expect(aveBeforeDelete[0].value).toBe(42);
    // expect(vaeBeforeDelete).toHaveLength(1);
    // expect(vaeBeforeDelete[0].value).toBe(42);

    store.insertTriple({
      id,
      attribute,
      value,
      timestamp: [2, 'A'],
      expired: true,
    });
    const eavAfterDelete = store.findByEntity(id);
    const aveAfterDelete = store.findByAttribute(attribute);
    // const vaeAfterDelete = store.findByValue(42);

    expect(eavAfterDelete).toHaveLength(0);
    expect(aveAfterDelete).toHaveLength(0);
    // expect(vaeAfterDelete).toHaveLength(0);
  });

  // TODO: THIS IS NOW A DATALOG CONCERN
  it.todo('triples can be updated via tombstoning', async () => {
    const id = 'my-id';
    const attribute = ['count'];
    await store.insertTriple({
      id,
      attribute,
      value: 0,
      timestamp: [1, 'A'],
      expired: false,
    });
    for (let i = 1; i < 10; i++) {
      const timestamp = [1 + i, 'A'];
      await store.insertTriple({
        id,
        attribute,
        value: i - 1,
        timestamp,
        expired: true,
      });
      await store.insertTriple({
        id,
        attribute,
        value: i,
        timestamp,
        expired: false,
      });
    }
    const results = await store.findByEntity(id);
    expect(results).toHaveLength(1);
    const { value } = results[results.length - 1];
    expect(value).toBe(9);
  });
});

describe('triple inserts', () => {
  const store = new TripleStore({ storage, tenantId: 'TEST' });
  it('can insert a single triple', async () => {
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    const eavRes = await store.findByEntity('id');
    const aveRes = await store.findByAttribute(['attr']);
    // const vaeRes = await store.findByValue('value');
    expect(eavRes).toHaveLength(1);
    expect(eavRes[0].value).toBe('value');
    expect(aveRes).toHaveLength(1);
    expect(aveRes[0].value).toBe('value');
    // expect(vaeRes).toHaveLength(1);
    // expect(vaeRes[0].value).toBe('value');
  });

  it('can insert multiple triples', async () => {
    await store.insertTriples([
      {
        id: 'id-1',
        attribute: ['attr-1'],
        value: 'value-1',
        timestamp: [1, 'A'],
        expired: false,
      },
      {
        id: 'id-2',
        attribute: ['attr-2'],
        value: 'value-2',
        timestamp: [1, 'A'],
        expired: false,
      },
    ]);
    const eavRes1 = await store.findByEntity('id-1');
    const eavRes2 = await store.findByEntity('id-2');
    const aveRes1 = await store.findByAttribute(['attr-1']);
    const aveRes2 = await store.findByAttribute(['attr-2']);
    // const vaeRes1 = await store.findByValue('value-1');
    // const vaeRes2 = await store.findByValue('value-2');

    expect(eavRes1).toHaveLength(1);
    expect(eavRes1[0].value).toBe('value-1');
    expect(eavRes2).toHaveLength(1);
    expect(eavRes2[0].value).toBe('value-2');
    expect(aveRes1).toHaveLength(1);
    expect(aveRes1[0].value).toBe('value-1');
    expect(aveRes2).toHaveLength(1);
    expect(aveRes2[0].value).toBe('value-2');
    // expect(vaeRes1).toHaveLength(1);
    // expect(vaeRes1[0].value).toBe('value-1');
    // expect(vaeRes2).toHaveLength(1);
    // expect(vaeRes2[0].value).toBe('value-2');
  });
});

describe('schema triple-store', () => {
  const TaskSchema = {
    attributes: S.Schema({
      description: S.string(),
      status: S.string(), //S.Enum(['todo', 'in_progress', 'complete']),
      assignees: S.Set(S.string()),
    }),
  };
  const StudentSchema = {
    attributes: S.Schema({
      name: S.string(),
      age: S.number(),
      classes: S.Set(S.string()),
    }),
  };

  beforeEach(() => {
    // storage.data = [];
    storage.wipe();
  });

  it('defining a store with a schema should store schema', async () => {
    const schemalessDB = new TripleStore({
      storage: new InMemoryTupleStorage(),
      tenantId: 'TEST',
    });
    const schemaDB = new TripleStore({
      storage: new InMemoryTupleStorage(),
      tenantId: 'TEST',
      schema: { collections: { Task: TaskSchema }, version: 0 },
    });

    expect(await schemalessDB.readSchema()).toBeFalsy();
    expect(await schemalessDB.readMetadataTuples('_schema')).toHaveLength(0);

    expect(await schemaDB.readSchema()).toBeTruthy();
    expect(
      (await schemaDB.readMetadataTuples('_schema')).length
    ).toBeGreaterThan(0);
  });

  it('defining a store with a schema should overwrite existing schema', async () => {
    // Using same storage, schema should be overwritten
    const storage = new InMemoryTupleStorage();
    const taskDB = new TripleStore({
      storage,
      tenantId: 'TEST',
      schema: { collections: { Task: TaskSchema }, version: 0 },
    });
    const beforeSchema = await taskDB.readSchema();
    expect(beforeSchema?.collections).toHaveProperty('Task');
    expect(beforeSchema?.collections).not.toHaveProperty('Student');

    const studentDB = new TripleStore({
      storage,
      tenantId: 'TEST',
      schema: { collections: { Student: StudentSchema }, version: 0 },
    });
    const afterSchema = await studentDB.readSchema();
    expect(afterSchema?.collections).not.toHaveProperty('Task');
    expect(afterSchema?.collections).toHaveProperty('Student');
  });
  it('should allow the deletion of metadatatriples', async () => {
    const schemaDb = new TripleStore({
      storage: new InMemoryTupleStorage(),
      tenantId: 'TEST',
      schema: { collections: { Task: TaskSchema }, version: 0 },
    });
    expect(await schemaDb.readSchema()).toBeTruthy();
    await schemaDb.deleteMetadataTuples([['_schema']]);
    expect(await schemaDb.readSchema()).toBeFalsy();
  });

  it('should allow inserting valid triples', () => {
    const db = new TripleStore({
      storage,
      tenantId: 'TEST',
      schema: { collections: { Task: TaskSchema }, version: 0 },
    });
    const id = 'task-1234';
    expect(async () => {
      await db.insertTriple({
        id,
        attribute: ['Task', 'description'],
        value: 'a task description',
        timestamp: [1, 'A'],
        expired: false,
      });
      await db.insertTriple({
        id,
        attribute: ['Task', 'status'],
        value: 'todo',
        timestamp: [1, 'A'],
        expired: false,
      });
    }).not.toThrow();
  });

  it('should prevent wrong types', async () => {
    const db = new TripleStore({
      storage,
      tenantId: 'TEST',
      schema: { collections: { Task: TaskSchema }, version: 0 },
    });
    const id = 'task-4321';
    await expect(
      db.insertTriple({
        id,
        attribute: ['Task', 'description'],
        value: 1234,
        timestamp: [1, 'A'],
        expired: false,
      })
    ).rejects.toThrow();

    // TODO: add back enum support
    // expect(() => {
    //   db.insertTriple([id, ['Task', 'status'], 1234, [1, 'A'], false]);
    // }).toThrow();
  });
});

describe('insert triggers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('metadata updates do not fire triggers', async () => {
    const db = new TripleStore({
      storage: new MemoryStorage(),
      tenantId: 'TEST',
    });
    const triggerMock = vi.fn();
    db.onInsert(triggerMock);
    await db.updateMetadataTuples([['ship', ['speed'], 'ludicrous']]);
    expect(triggerMock).toHaveBeenCalledTimes(0);
    // And triple data will fire triggers
    await db.insertTriple({
      id: 'ship',
      attribute: ['speed'],
      value: 'ludicrous',
      timestamp: [1, 'A'],
      expired: false,
    });
    expect(triggerMock).toHaveBeenCalledTimes(1);
  });
});

describe('supports transactions', () => {
  it('can commit a transaction', async () => {
    const store = new TripleStore({
      storage: new MemoryStorage(),
      tenantId: 'TEST',
    });
    // const tx = store.transact();
    await store.transact(async (tx) => {
      await tx.insertTriple({
        id: 'id',
        attribute: ['attr'],
        value: 'value',
        timestamp: [1, 'A'],
        expired: false,
      });
      expect(await store.findByEntity('id')).toHaveLength(0);
      // expect(tx.findByEntity('id')).toHaveLength(1);
    });
    expect(await store.findByEntity('id')).toHaveLength(1);
  });

  it('can rollback a transaction', async () => {
    const store = new TripleStore({
      storage: new MemoryStorage(),
      tenantId: 'TEST',
    });
    await store.transact(async (tx) => {
      await tx.insertTriple({
        id: 'id',
        attribute: ['attr'],
        value: 'value',
        timestamp: [1, 'A'],
        expired: false,
      });
      expect(await store.findByEntity('id')).toHaveLength(0);
      expect(await tx.findByEntity('id')).toHaveLength(1);
      await tx.cancel();
    });
    expect(await store.findByEntity('id')).toHaveLength(0);
  });
});

// TODO: IMO this could be broken up into smaller units (like "timestamp index" below)
describe('search/scan functionality', async () => {
  const storage = new MemoryStorage();
  const store = new TripleStore({
    storage,
    tenantId: 'TEST',
  });
  const defaultData: TripleRow[] = [
    {
      id: 'cats#1',
      attribute: ['height'],
      value: 4,
      timestamp: [1, 'A'],
      expired: false,
    },
    {
      id: 'cats#2',
      attribute: ['height'],
      value: 8,
      timestamp: [2, 'A'],
      expired: false,
    },
    {
      id: 'dogs#1',
      attribute: ['height'],
      value: 8,
      timestamp: [1, 'B'],
      expired: false,
    },
    {
      id: 'dogs#2',
      attribute: ['ears'],
      value: 'round',
      timestamp: [2, 'B'],
      expired: false,
    },
  ];
  beforeEach(async () => {
    storage.wipe();
  });
  it('can find by attribute', async () => {
    await store.insertTriples(defaultData);
    await store.transact(async (tx) => {
      expect(
        (await tx.findByAttribute(['height'])).map(
          ({ id, attribute }) => attribute[0]
        )
      ).toStrictEqual(['height', 'height', 'height']);
    });
    expect(
      (await store.findByAttribute(['ears'])).map(
        ({ attribute }) => attribute[0]
      )
    ).toStrictEqual(['ears']);
  });
  it('can find by collection', async () => {
    await store.insertTriples(defaultData);
    await store.transact(async (tx) => {
      expect(
        (await tx.findByCollection('cats')).map(({ id }) => id)
      ).toMatchObject(['cats#1', 'cats#2']);
    });
    expect(
      (await store.findByCollection('dogs')).map(({ id }) => id)
    ).toMatchObject(['dogs#1', 'dogs#2']);
    expect(await store.findByCollection('fish')).toHaveLength(0);
  });
  it('can find values in a range with cursor', async () => {
    const data: TripleRow[] = [
      {
        id: 'cats#1',
        attribute: ['cats', 'height'],
        value: 8,
        timestamp: [1, 'A'],
        expired: false,
      },
      {
        // cursor min
        id: 'cats#2',
        attribute: ['cats', 'height'],
        value: 6,
        timestamp: [2, 'A'],
        expired: false,
      },
      {
        id: 'cats#3',
        attribute: ['cats', 'height'],
        value: 7,
        timestamp: [3, 'A'],
        expired: false,
      },
      {
        // cursor max
        id: 'cats#4',
        attribute: ['cats', 'height'],
        value: 8,
        timestamp: [4, 'A'],
        expired: false,
      },
      {
        id: 'cats#5',
        attribute: ['cats', 'height'],
        value: 6,
        timestamp: [5, 'A'],
        expired: false,
      },
      {
        id: 'dogs#1',
        attribute: ['dogs', 'height'],
        value: 6,
        timestamp: [1, 'B'],
        expired: false,
      },
    ];
    await store.insertTriples(data);
    await testStoreAndTx(store, async (op) => {
      const gtRes = await op.findValuesInRange(['cats', 'height'], {
        greaterThan: [6, 'cats#2'],
      });
      expect(gtRes).toHaveLength(4);

      const ltRes = await op.findValuesInRange(['cats', 'height'], {
        lessThan: [8, 'cats#4'],
      });
      expect(ltRes).toHaveLength(4);

      const rangeRes = await op.findValuesInRange(['cats', 'height'], {
        greaterThan: [6, 'cats#2'],
        lessThan: [8, 'cats#4'],
      });
      expect(rangeRes).toHaveLength(3);

      const outOfRangeGT = await op.findValuesInRange(['cats', 'height'], {
        greaterThan: [8, 'cats#4'],
      });
      expect(outOfRangeGT).toHaveLength(0);
      const outOfRangeLT = await op.findValuesInRange(['cats', 'height'], {
        lessThan: [6, 'cats#2'],
      });
      expect(outOfRangeLT).toHaveLength(0);
    });
  });
  it('can find by Entity Attribute and EAV', async () => {
    await store.insertTriples(defaultData);
    await store.transact(async (tx) => {
      expect(
        (await tx.findByEAV(['cats#2', ['height']])).map(({ id }) => id)
      ).toMatchObject(['cats#2']);
    });
    expect(
      (await store.findByEntityAttribute('dogs#1', ['height'])).map(
        ({ id }) => id
      )
    ).toMatchObject(['dogs#1']);
    expect(
      (await store.findByEAV(['dogs#1', ['height']])).map(({ id }) => id)
    ).toMatchObject(['dogs#1']);
    expect(
      await store.findByEntityAttribute('dogs#2', ['height'])
    ).toHaveLength(0);
  });
});

describe('Deleting triples', () => {
  let store: TripleStore;
  beforeEach(async () => {
    store = new TripleStore({
      storage: new MemoryStorage(),
      tenantId: 'TEST',
    });
    await store.transact(async (tx) => {
      await tx.insertTriples([
        {
          id: 'cats#1',
          attribute: ['height'],
          value: 4,
          timestamp: [1, 'A'],
          expired: false,
        },
        {
          id: 'cats#2',
          attribute: ['height'],
          value: 8,
          timestamp: [2, 'A'],
          expired: false,
        },
        {
          id: 'dogs#1',
          attribute: ['height'],
          value: 8,
          timestamp: [1, 'B'],
          expired: false,
        },
        {
          id: 'dogs#2',
          attribute: ['ears'],
          value: 'round',
          timestamp: [2, 'B'],
          expired: false,
        },
      ]);
    });
  });
  it('can delete a triple', async () => {
    const cats1 = await store.findByEntity('cats#1');
    expect(cats1).toHaveLength(1);
    await store.deleteTriple(cats1[0]);
    const cats1AfterDelete = await store.findByEntity('cats#1');
    expect(cats1AfterDelete).toHaveLength(0);
    await store.transact(async (tx) => {
      const cats2 = await tx.findByEntity('cats#2');
      expect(cats2).toHaveLength(1);
      await tx.deleteTriple(cats2[0]);
      const cats2AfterDelete = await tx.findByEntity('cats#2');
      expect(cats2AfterDelete).toHaveLength(0);
    });
  });
  it('can delete multiple triples', async () => {
    const cats = await store.findByCollection('cats');
    expect(cats).toHaveLength(2);
    await store.deleteTriples(cats);
    const catsAfterDelete = await store.findByCollection('cats');
    expect(catsAfterDelete).toHaveLength(0);
  });
});

describe('mutating triple values from the store', () => {
  it('can set the value of a triple', async () => {
    const store = new TripleStore({
      storage: new MemoryStorage(),
      tenantId: 'TEST',
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    expect((await store.findByEntity('id'))[0].value).toBe('value');
    await store.setValue('id', ['attr'], 'new-value');
    expect((await store.findByEntity('id'))[0].value).toBe('new-value');
  });
});

describe('setStorageScope', () => {
  it('using setStorageScope scopes writes', async () => {
    const storage = {
      a: new InMemoryTupleStorage(),
      b: new InMemoryTupleStorage(),
    };
    const store = new TripleStore({
      storage: storage,
      tenantId: 'TEST',
    });
    await store.setStorageScope(['a']).insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    expect(storage.a.data.length).toBeGreaterThan(0);
    expect(storage.b.data.length).toBe(0);
  });

  it('using setStorageScope scopes reads', async () => {
    const storage = {
      a: new InMemoryTupleStorage(),
      b: new InMemoryTupleStorage(),
    };
    const store = new TripleStore({
      storage: storage,
      tenantId: 'TEST',
    });
    await store.setStorageScope(['a']).insertTriple({
      id: 'id1',
      attribute: ['attr1'],
      value: 'value1',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.setStorageScope(['b']).insertTriple({
      id: 'id2',
      attribute: ['attr2'],
      value: 'value2',
      timestamp: [1, 'B'],
      expired: false,
    });
    expect(
      (await store.setStorageScope(['a']).findByEntity('id1')).length
    ).toBe(1);
    expect(
      (await store.setStorageScope(['a']).findByEntity('id2')).length
    ).toBe(0);
    expect(
      (await store.setStorageScope(['b']).findByEntity('id1')).length
    ).toBe(0);
    expect(
      (await store.setStorageScope(['b']).findByEntity('id2')).length
    ).toBe(1);
  });
});

describe('transaction scoping', () => {
  it('transactions can specify default read and write scopes', async () => {
    const storage = {
      a: new InMemoryTupleStorage(),
      b: new InMemoryTupleStorage(),
      c: new InMemoryTupleStorage(),
    };
    const store = new TripleStore({ storage, tenantId: 'TEST' });

    await store.setStorageScope(['a']).insertTriple({
      id: 'id1',
      attribute: ['attr1'],
      value: 'value1',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.setStorageScope(['b']).insertTriple({
      id: 'id1',
      attribute: ['attr2'],
      value: 'value2',
      timestamp: [1, 'B'],
      expired: false,
    });
    await store.setStorageScope(['c']).insertTriple({
      id: 'id1',
      attribute: ['attr3'],
      value: 'value3',
      timestamp: [1, 'C'],
      expired: false,
    });

    await store.transact(
      async (tx) => {
        // Read from a and b
        expect((await tx.findByEntity('id1')).length).toBe(2);

        // Read from a and b after write
        await tx.insertTriple({
          id: 'id1',
          attribute: ['attr4'],
          value: 'value4',
          timestamp: [2, 'A'],
          expired: false,
        });
        expect((await tx.findByEntity('id1')).length).toBe(3);
      },
      { read: ['a', 'b'], write: ['a'] }
    );

    // Written only to A
    expect(
      (await store.setStorageScope(['a']).findByEntity('id1')).length
    ).toBe(2);
    expect(
      (await store.setStorageScope(['b']).findByEntity('id1')).length
    ).toBe(1);
    expect(
      (await store.setStorageScope(['c']).findByEntity('id1')).length
    ).toBe(1);
  });

  it('actions within a transaction can specify read and write scopes', async () => {
    const storage = {
      a: new InMemoryTupleStorage(),
      b: new InMemoryTupleStorage(),
    };
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.transact(async (tx) => {
      const scopeA = tx.withScope({ read: ['a'], write: ['a'] });
      const scopeB = tx.withScope({ read: ['b'], write: ['b'] });

      await scopeA.insertTriple({
        id: 'id1',
        attribute: ['attr1'],
        value: 'value1',
        timestamp: [1, 'A'],
        expired: false,
      });
      await scopeA.insertTriple({
        id: 'id1',
        attribute: ['attr2'],
        value: 'value2',
        timestamp: [1, 'A'],
        expired: false,
      });
      expect((await scopeA.findByEntity('id1')).length).toBe(2);
      expect((await scopeB.findByEntity('id1')).length).toBe(0);
      await scopeB.insertTriple({
        id: 'id1',
        attribute: ['attr3'],
        value: 'value3',
        timestamp: [1, 'B'],
        expired: false,
      });
      expect((await scopeA.findByEntity('id1')).length).toBe(2);
      expect((await scopeB.findByEntity('id1')).length).toBe(1);
      expect((await tx.findByEntity('id1')).length).toBe(3);
    });
  });
});

describe('timestamp index', () => {
  it('greater than queries', async () => {
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [3, 'B'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [4, 'A'],
      expired: false,
    });

    expect(
      await store.findByClientTimestamp('A', 'gt', undefined)
    ).toHaveLength(3);
    expect(await store.findByClientTimestamp('A', 'gt', [1, 'A'])).toHaveLength(
      2
    );
    expect(await store.findByClientTimestamp('A', 'gt', [2, 'A'])).toHaveLength(
      1
    );
    expect(await store.findByClientTimestamp('A', 'gt', [4, 'A'])).toHaveLength(
      0
    );
  });
  it('greater than or equal queries', async () => {
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [3, 'B'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [4, 'A'],
      expired: false,
    });

    expect(
      await store.findByClientTimestamp('A', 'gte', undefined)
    ).toHaveLength(3);
    expect(
      await store.findByClientTimestamp('A', 'gte', [1, 'A'])
    ).toHaveLength(3);
    expect(
      await store.findByClientTimestamp('A', 'gte', [2, 'A'])
    ).toHaveLength(2);
    expect(
      await store.findByClientTimestamp('A', 'gte', [4, 'A'])
    ).toHaveLength(1);
    expect(
      await store.findByClientTimestamp('A', 'gte', [5, 'A'])
    ).toHaveLength(0);
  });
  it('less than queries', async () => {
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [3, 'B'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [4, 'A'],
      expired: false,
    });

    expect(
      await store.findByClientTimestamp('A', 'lt', undefined)
    ).toHaveLength(0);
    expect(await store.findByClientTimestamp('A', 'lt', [1, 'A'])).toHaveLength(
      0
    );
    expect(await store.findByClientTimestamp('A', 'lt', [2, 'A'])).toHaveLength(
      1
    );
    expect(await store.findByClientTimestamp('A', 'lt', [4, 'A'])).toHaveLength(
      2
    );
    expect(await store.findByClientTimestamp('A', 'lt', [5, 'A'])).toHaveLength(
      3
    );
  });
  it('less than or equal queries', async () => {
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [3, 'B'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [4, 'A'],
      expired: false,
    });

    expect(
      await store.findByClientTimestamp('A', 'lte', undefined)
    ).toHaveLength(0);
    expect(
      await store.findByClientTimestamp('A', 'lte', [1, 'A'])
    ).toHaveLength(1);
    expect(
      await store.findByClientTimestamp('A', 'lte', [2, 'A'])
    ).toHaveLength(2);
    expect(
      await store.findByClientTimestamp('A', 'lte', [4, 'A'])
    ).toHaveLength(3);
  });
  it('max query', async () => {
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [3, 'B'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [4, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [5, 'B'],
      expired: false,
    });

    expect(await store.findMaxTimestamp('A')).toEqual([4, 'A']);
    expect(await store.findMaxTimestamp('B')).toEqual([5, 'B']);
    expect(await store.findMaxTimestamp('C')).toEqual(undefined);
  });
  it('equal to queries', async () => {
    const store = new TripleStore({ storage, tenantId: 'TEST' });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [1, 'B'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr2'],
      value: 'value',
      timestamp: [2, 'A'],
      expired: false,
    });
    await store.insertTriple({
      id: 'id',
      attribute: ['attr'],
      value: 'value',
      timestamp: [3, 'A'],
      expired: false,
    });

    expect(
      await store.findByClientTimestamp('A', 'eq', undefined)
    ).toHaveLength(0);
    expect(await store.findByClientTimestamp('A', 'eq', [1, 'A'])).toHaveLength(
      1
    );
    expect(await store.findByClientTimestamp('A', 'eq', [2, 'A'])).toHaveLength(
      2
    );
  });
});
