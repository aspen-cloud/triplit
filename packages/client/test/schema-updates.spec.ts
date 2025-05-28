import { expect, it } from 'vitest';
import { Schema as S } from '@triplit/db';
import { BTreeKVStore } from '@triplit/db/storage/memory-btree';
import { TriplitClient } from '../src/client/triplit-client.ts';

it('if a database cannot be initialized, methods are not available', async () => {
  const client = new TriplitClient({
    autoConnect: false,
    experimental: {
      onDatabaseInit: async (db, event) => {
        // THIS MOCKS A TRUE DATABASE FAILURE THAT PREVENTS THE DB FROM INITIALIZING
        // IF THE DB COULD NOT INIT, THE SAME PROMISE CHECK WOULD FAIL
        throw new Error('Database initialization failed');
      },
    },
  });
  await expect(client.fetch({ collectionName: 'users' })).rejects.toThrow(
    'Database initialization failed'
  );
});

it('successful schema updates are reported', async () => {
  const schema1 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  };
  const schema2 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        age: S.Optional(S.Number()),
      }),
    },
  };
  const storage = new BTreeKVStore();
  const client1 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema1,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type !== 'SUCCESS')
          throw new Error('FAIL TEST - Database initialization failed');
      },
    },
  });
  await expect(
    client1.insert('users', {
      id: '1',
      name: 'Alice',
    })
  ).resolves.not.toThrow();
  const client2 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema2,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type === 'SUCCESS') return;
        throw new Error('FAIL TEST - Database initialization unhandled');
      },
    },
  });
  await expect(
    client2.insert('users', {
      id: '2',
      name: 'Bob',
      age: 25,
    })
  ).resolves.not.toThrow();
  const results = await client2.fetch({ collectionName: 'users' });
  expect(results).toEqual([
    {
      id: '1',
      name: 'Alice',
    },
    {
      id: '2',
      name: 'Bob',
      age: 25,
    },
  ]);
});

it('invalid schema updates are reported', async () => {
  const schema1 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  };
  const schema2 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        age: 15,
      }),
    },
  };
  const storage = new BTreeKVStore();
  const client1 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema1,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type !== 'SUCCESS')
          throw new Error('FAIL TEST - Database initialization failed');
      },
    },
  });
  await expect(
    client1.insert('users', {
      id: '1',
      name: 'Alice',
    })
  ).resolves.not.toThrow();
  let check = false;
  const client2 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema2,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type === 'SCHEMA_UPDATE_FAILED') {
          if (event.change.code === 'SCHEMA_INVALID') {
            check = true;
            return;
          }
        }
        throw new Error('FAIL TEST - Database initialization unhandled');
      },
    },
  });
  await client2.ready;
  expect(check).toBe(true);
});

it('blocked schema updates are reported', async () => {
  const schema1 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  };
  const schema2 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        age: S.Number(),
      }),
    },
  };
  const storage = new BTreeKVStore();
  const client1 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema1,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type !== 'SUCCESS')
          throw new Error('FAIL TEST - Database initialization failed');
      },
    },
  });
  await expect(
    client1.insert('users', {
      id: '1',
      name: 'Alice',
    })
  ).resolves.not.toThrow();
  let check = false;
  const client2 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema2,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type === 'SCHEMA_UPDATE_FAILED') {
          if (event.change.code === 'EXISTING_DATA_MISMATCH') {
            check = true;
            return;
          }
        }
        throw new Error('FAIL TEST - Database initialization unhandled');
      },
    },
  });
  await client2.ready;
  expect(check).toBe(true);
});

it('can resolve a schema initialization issue through clearing', async () => {
  const schema1 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  };
  const storage = new BTreeKVStore();
  const client1 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema1,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type !== 'SUCCESS')
          throw new Error('FAIL TEST - Database initialization failed');
      },
    },
  });
  await client1.insert('users', {
    id: '1',
    name: 'Alice',
  });
  const schema2 = {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        age: S.Number(),
      }),
    },
  };
  const client2 = new TriplitClient({
    autoConnect: false,
    storage: storage,
    schema: schema2,
    experimental: {
      onDatabaseInit: async (db, event) => {
        if (event.type === 'SUCCESS') return;
        if (event.type === 'SCHEMA_UPDATE_FAILED') {
          // clear and retry
          await db.clear();
          const nextChange = await db.overrideSchema(event.change.newSchema);
          if (nextChange.successful) return;
        }
        throw new Error('FAIL TEST - Database initialization unhandled');
      },
    },
  });
  await client2.insert('users', {
    id: '2',
    name: 'Bob',
    age: 25,
  });
  const results = await client2.fetch({ collectionName: 'users' });
  expect(results).toEqual([
    {
      id: '2',
      name: 'Bob',
      age: 25,
    },
  ]);
});
