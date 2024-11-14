import { Server as TriplitServer } from '@triplit/server-core';
import { TriplitClient, ClientSchema } from '@triplit/client';
import { describe, vi, it, expect } from 'vitest';
import DB, {
  Models,
  Schema as S,
  StoreSchema,
  genToArr,
  or,
} from '@triplit/db';
import { MemoryBTreeStorage as MemoryStorage } from '@triplit/db/storage/memory-btree';
import { hashQuery } from '@triplit/db';
import { pause } from '../utils/async.js';
import {
  NOT_SERVICE_KEY,
  SERVICE_KEY,
  createTestClient,
  spyMessages,
  throwOnError,
} from '../utils/client.js';

describe('TestTransport', () => {
  it('can sync an insert on one client to another client', async () => {
    const server = new TriplitServer(new DB({ source: new MemoryStorage() }));
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    const callback = vi.fn();
    bob.subscribe(bob.query('test').build(), callback);
    await alice.insert('test', { name: 'alice' });
    await pause(20);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0][0]).toHaveLength(0);
    expect(callback.mock.calls[1][0]).toHaveLength(1);
  });
});

async function clientSchemaAttributes<M extends Models>(
  client: TriplitClient<M>
) {
  return (await client.db.getSchema())?.collections.students.schema.properties;
}

describe('schema syncing', () => {
  it('can sync a schema if the client sending updates has a service token and enables the option ', async () => {
    const schema = {
      students: { schema: S.Schema({ id: S.Id(), name: S.String() }) },
    };
    const server = new TriplitServer(
      new DB({
        source: new MemoryStorage(),
        schema: { collections: schema, version: 1 },
      })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema,
      syncSchema: true,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema,
      syncSchema: true,
    });
    const bobCallback = vi.fn();
    alice.subscribe(
      alice
        .query(
          // @ts-expect-error - metadata not in schema
          '_metadata'
        )
        .id('_schema')
        .build(),
      () => {}
    );
    bob.subscribe(
      bob
        .query(
          // @ts-expect-error - metadata not in schema
          '_metadata'
        )
        .id('_schema')
        .build(),
      bobCallback
    );
    await pause();
    expect((await clientSchemaAttributes(alice))?.name).toBeDefined();
    expect((await clientSchemaAttributes(bob))?.name).toBeDefined();
    await alice.db.addAttribute({
      collection: 'students',
      path: ['age'],
      attribute: { type: 'number', options: {} },
    });

    expect((await clientSchemaAttributes(alice))?.name).toBeDefined();
    expect((await clientSchemaAttributes(alice))?.age).toBeDefined();

    await pause(); // idk why this needs to be this long
    expect(bobCallback).toHaveBeenCalled();
    const bobSchema = await clientSchemaAttributes(bob);
    expect(bobSchema?.age).toBeDefined();
  });
  it('should not sync the schema if the client sending updates has a service token but the option disabled', async () => {
    const schema = {
      collections: {
        students: { schema: S.Schema({ id: S.Id(), name: S.String() }) },
      },
    };
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
      syncSchema: false,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
      syncSchema: true,
    });
    const callback = vi.fn();

    bob.subscribe(
      bob
        .query(
          // @ts-expect-error - metadata not in schema
          '_metadata'
        )
        .id('_schema')
        .build(),
      callback
    );
    expect((await clientSchemaAttributes(alice))?.name).toBeDefined();
    expect((await clientSchemaAttributes(bob))?.name).toBeDefined();
    await alice.db.addAttribute({
      collection: 'students',
      path: ['age'],
      attribute: { type: 'number', options: {} },
    });

    expect((await clientSchemaAttributes(alice))?.name).toBeDefined();
    expect((await clientSchemaAttributes(alice))?.age).toBeDefined();
    await pause();

    expect((await clientSchemaAttributes(bob))?.age).toBeUndefined();
  });
  it('should not sync the schema if the client sneding updates does not have a service token', async () => {
    const schema = {
      collections: {
        students: { schema: S.Schema({ id: S.Id(), name: S.String() }) },
      },
    };
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, NOT_SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
      syncSchema: true,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
      syncSchema: true,
    });
    const callback = vi.fn();

    bob.subscribe(
      bob
        .query(
          // @ts-expect-error - metadata not in schema
          '_metadata'
        )
        .id('_schema')
        .build(),
      callback
    );
    expect((await clientSchemaAttributes(alice))?.name).toBeDefined();
    expect((await clientSchemaAttributes(bob))?.name).toBeDefined();
    await alice.db.addAttribute({
      collection: 'students',
      path: ['age'],
      attribute: { type: 'number', options: {} },
    });

    expect((await clientSchemaAttributes(alice))?.name).toBeDefined();
    expect((await clientSchemaAttributes(alice))?.age).toBeDefined();
    await pause();

    expect((await clientSchemaAttributes(bob))?.age).toBeUndefined();
  });
});

describe('Relational Query Syncing', () => {
  it('can connect to 2 clients', async () => {
    const schema = {
      collections: {
        departments: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            classes: S.Query({
              collectionName: 'classes',
              where: [['department_id', '=', '$id']],
            }),
          }),
        },
        classes: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            level: S.Number(),
            building: S.String(),
            department_id: S.String(),
            department: S.Query({
              collectionName: 'departments',
              where: [['id', '=', '$department_id']],
            }),
          }),
        },
      },
    };
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    const query = bob
      .query('departments')
      .where([['classes.building', '=', 'Voter']])
      .build();
    const callback = vi.fn();
    bob.subscribe(query, callback);

    // await alice.insert('test', { name: 'alice' });
    // alice inserts a department and then a class in Voter
    try {
      await alice.insert('departments', { name: 'Mathematics', id: 'math' });
      await alice.insert('classes', {
        name: 'Math 101',
        level: 101,
        building: 'Voter',
        department_id: 'math',
      });
    } catch (e: any) {
      console.error(e);
    }
    expect(await alice.fetch(query)).toHaveLength(1);

    await pause();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0][0]).toHaveLength(0);
    expect(callback.mock.calls[1][0]).toHaveLength(1);
  });
});

describe('Conflicts', () => {
  it('can merge conflicts', async () => {
    const server = new TriplitServer(new DB({ source: new MemoryStorage() }));
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    const charlie = createTestClient(server, SERVICE_KEY, {
      clientId: 'charlie',
    });
    const query = bob.query('rappers').build();

    const callback = vi.fn();

    alice.subscribe(query, callback);
    bob.subscribe(query, callback);
    charlie.subscribe(query, callback);

    const aliceInsert = alice.insert('rappers', {
      id: 'best-rapper',
      name: 'Kendrick Lamar',
    });
    const bobInsert = bob.insert('rappers', {
      id: 'best-rapper',
      name: 'Drake',
    });
    const charlieInsert = charlie.insert('rappers', {
      id: 'best-rapper',
      name: 'J. Cole',
    });
    await Promise.all([aliceInsert, bobInsert, charlieInsert]);

    await pause();

    let aliceRappers = await alice.fetch(query);
    let bobRappers = await bob.fetch(query);
    let charlieRappers = await charlie.fetch(query);
    expect(aliceRappers).toHaveLength(1);
    expect(bobRappers).toHaveLength(1);
    expect(charlieRappers).toHaveLength(1);

    let aliceBestRapper = aliceRappers.find((e: any) => e.id === 'best-rapper');
    let bobBestRapper = bobRappers.find((e: any) => e.id === 'best-rapper');
    let charlieBestRapper = charlieRappers.find(
      (e: any) => e.id === 'best-rapper'
    );

    expect(aliceBestRapper).toEqual(bobBestRapper);
    expect(aliceBestRapper).toEqual(charlieBestRapper);

    await alice.update('rappers', 'best-rapper', async (rapper) => {
      rapper.name = 'Eminem';
    });

    await pause();

    aliceRappers = await alice.fetch(query);
    bobRappers = await bob.fetch(query);
    charlieRappers = await charlie.fetch(query);

    expect(aliceRappers).toHaveLength(1);
    expect(bobRappers).toHaveLength(1);
    expect(charlieRappers).toHaveLength(1);

    aliceBestRapper = aliceRappers.find((e: any) => e.id === 'best-rapper');
    bobBestRapper = bobRappers.find((e: any) => e.id === 'best-rapper');
    charlieBestRapper = charlieRappers.find((e: any) => e.id === 'best-rapper');

    expect(aliceBestRapper?.name).toEqual('Eminem');
    expect(bobBestRapper?.name).toEqual('Eminem');
    expect(charlieBestRapper?.name).toEqual('Eminem');
  });
});

describe('Connection Status', () => {
  const schema = {
    collections: {
      departments: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
          classes: S.Query({
            collectionName: 'classes',
            where: [['department_id', '=', '$id']],
          }),
        }),
      },
      classes: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          level: S.Number(),
          building: S.String(),
          department_id: S.String(),
          department: S.Query({
            collectionName: 'departments',
            where: [['id', '=', '$department_id']],
          }),
        }),
      },
    },
  };
  it('can get the remote status in a subscription', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = alice
      .query('departments')
      .where([['classes.building', '=', 'Voter']])
      .build();

    try {
      await alice.insert('departments', { name: 'Mathematics', id: 'math' });
      await alice.insert('classes', {
        name: 'Math 101',
        level: 101,
        building: 'Voter',
        department_id: 'math',
      });
    } catch (e: any) {
      console.error(e);
    }
    // expect(await alice.fetch(query)).toHaveLength(1);

    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    const bobQuery = bob
      .query('departments')
      .where([['classes.building', '=', 'Voter']])
      .build();
    const callback = vi.fn();
    bob.subscribe(bobQuery, callback);
    await pause(300);
    // once local, once remote, and then once remote again for the hack to ensure the remote status is updated
    expect(callback).toHaveBeenCalledTimes(3);
    const firstCallArgs = callback.mock.calls[0];
    expect(firstCallArgs[0]).toHaveLength(0);
    expect(firstCallArgs[1]).toHaveProperty('hasRemoteFulfilled', false);
    const secondCallArgs = callback.mock.calls[1];
    expect(secondCallArgs[0]).toHaveLength(1);
    expect(secondCallArgs[1]).toHaveProperty('hasRemoteFulfilled', true);
  });

  it('it updates even if the server returns an empty result', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const client = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = client
      .query('departments')
      .where([['classes.building', '=', 'Voter']])
      .build();

    expect(await client.fetch(query)).toHaveLength(0);

    const callback = vi.fn();
    client.subscribe(query, callback);
    await pause(500);
    expect(callback).toHaveBeenCalledTimes(2);
    const firstCallArgs = callback.mock.calls[0];
    expect(firstCallArgs[0]).toHaveLength(0);
    expect(firstCallArgs[1]).toHaveProperty('hasRemoteFulfilled', false);
    const secondCallArgs = callback.mock.calls[1];
    expect(secondCallArgs[0]).toHaveLength(0);
    expect(secondCallArgs[1]).toHaveProperty('hasRemoteFulfilled', true);
  });
});

const client = new TriplitClient();
const baseQuery = client.query('test');
describe('deletes', () => {
  it.each([
    [baseQuery.where('name', 'like', '%bob%'), ['bob2']],
    [baseQuery.order('name', 'DESC'), ['bob2', 'alice2']],
    // TODO: get limit working
    // [baseQuery.order('name', 'ASC').limit(1), ['alice2']],
  ])('can sync deletes for queries ', async (query, results) => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
    });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });

    // set up data to delete
    await alice.insert('test', { id: 'alice1', name: 'alice1' });
    await alice.insert('test', { id: 'alice2', name: 'alice2' });
    await bob.insert('test', { id: 'bob1', name: 'bob1' });
    await bob.insert('test', { id: 'bob2', name: 'bob2' });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();

    alice.subscribe(query.build(), aliceSub);
    bob.subscribe(query.build(), bobSub);
    await pause();

    // alice can delete her own
    await alice.delete('test', 'alice1');
    // alice can delete bob's
    await alice.delete('test', 'bob1');
    await pause();

    expect(aliceSub.mock.lastCall[0].map((e: any) => e.id)).toStrictEqual(
      results
    );
    expect(bobSub.mock.lastCall[0].map((e: any) => e.id)).toStrictEqual(
      results
    );
  });
  it('can sync deletes when the subscribing queries have filters', async () => {
    const schema = {
      version: 0,
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
        },
      },
    };
    const server = new TriplitServer(
      new DB({
        schema,
      })
    );
    const alice = createTestClient(server, NOT_SERVICE_KEY);
    const bob = createTestClient(server, NOT_SERVICE_KEY);
    // set up a subscription for bob
    const bobSub = vi.fn();
    const aliceSub = vi.fn();
    const query = bob.query('test').where('name', '=', 'george').build();
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);

    // set up data to delete
    await alice.insert('test', { id: 'alice1', name: 'george' });
    await pause();

    // they should both see the data
    expect(aliceSub.mock.lastCall[0]).toHaveLength(1);
    expect(bobSub.mock.lastCall[0]).toHaveLength(1);

    // if bob deletes, Alice should see the delete
    await bob.delete('test', 'alice1');
    await pause();
    expect(aliceSub.mock.lastCall[0]).toHaveLength(0);
    expect(bobSub.mock.lastCall[0]).toHaveLength(0);
  });
  // Addresses an issue where related deletes were not being synced
  it('Can sync related deletes', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            related_id: S.String(),
            related: S.RelationById('related', '$related_id'),
          }),
        },
        related: {
          schema: S.Schema({ id: S.Id() }),
        },
      },
    };
    const server = new TriplitServer(new DB({ schema }));
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    await alice.transact(async (tx) => {
      await tx.insert('related', { id: 'related1' });
      await tx.insert('test', { id: 'test1', related_id: 'related1' });
    });
    await pause();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test').include('related').build(), aliceSub);
    bob.subscribe(bob.query('test').include('related').build(), bobSub);
    await pause();
    await bob.delete('related', 'related1');
    await pause();
    const lastCallAlice = aliceSub.mock.calls.at(-1)[0];
    const lastCallBob = bobSub.mock.calls.at(-1)[0];
    expect(lastCallAlice.find((e: any) => e.id === 'test1').related).toBe(null);
    expect(lastCallBob.find((e: any) => e.id === 'test1').related).toBe(null);
  });
});

describe('array syncing', () => {
  // Important to test for rules...
  it('can sync schemaless arrays', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    // insert data
    await alice.insert('test', { id: 'alice1', data: [1, 2, 3] });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test').build(), aliceSub);
    bob.subscribe(bob.query('test').build(), bobSub);
    await pause();

    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toStrictEqual([1, 2, 3]);
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toStrictEqual([1, 2, 3]);

    // update data
    await alice.update('test', 'alice1', (entity) => {
      entity.data = [4, 5, 6];
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toStrictEqual([4, 5, 6]);
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toStrictEqual([4, 5, 6]);

    // delete data
    await alice.update('test', 'alice1', (entity) => {
      delete entity.data;
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toBeUndefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toBeUndefined();
  });
});

describe('record syncing', () => {
  it('can sync record deletes', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    // insert data
    await alice.insert('test', {
      id: 'alice1',
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        address: {
          street: '123 Main St',
          city: 'San Francisco',
        },
      },
    });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test').build(), aliceSub);
    bob.subscribe(bob.query('test').build(), bobSub);
    await pause();

    await alice.update('test', 'alice1', (entity) => {
      delete entity.data;
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
    });
  });

  it('can sync record re-assignments', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    // insert data
    await alice.insert('test', {
      id: 'alice1',
      data: {
        firstName: 'Alice',
        lastName: 'Smith',
        address: {
          street: '123 Main St',
          city: 'San Francisco',
        },
      },
      assignToValue: {
        more: 'data',
      },
      assignToNull: {
        more: 'data',
      },
    });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test').build(), aliceSub);
    bob.subscribe(bob.query('test').build(), bobSub);
    await pause();

    await alice.update('test', 'alice1', (entity) => {
      entity.data = { record: 'reassignment' };
      entity.assignToValue = 10;
      entity.assignToNull = null;
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
      data: { record: 'reassignment' },
      assignToValue: 10,
      assignToNull: null,
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
      data: { record: 'reassignment' },
      assignToValue: 10,
      assignToNull: null,
    });
  });
});

describe('Server API', () => {
  it('can sync an insert on one client to another client', async () => {
    const server = new TriplitServer(new DB({ source: new MemoryStorage() }));
    const sesh = server.createSession({
      'x-triplit-token-type': 'secret',
    });
    const bob = createTestClient(server, NOT_SERVICE_KEY, { clientId: 'bob' });
    const callback = vi.fn();
    bob.subscribe(bob.query('test').build(), callback);
    await pause();
    const entity = { id: 'test-user', name: 'alice' };
    await sesh.insert('test', entity);
    await pause();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0][0]).toHaveLength(0);
    expect(callback.mock.calls[1][0]).toHaveLength(1);
    expect(
      callback.mock.calls[1][0].find((e: any) => e.id === 'test-user')
    ).toMatchObject(entity);
  });
});

describe('Sync situations', () => {
  describe('set and delete an attribute in the same transaction', () => {
    it('can perform delete -> set in the same transaction over the network', async () => {
      const serverDB = new DB();
      await serverDB.insert('test', { id: 'test1', name: 'test1' });
      const server = new TriplitServer(serverDB);
      const alice = createTestClient(server, SERVICE_KEY, {
        clientId: 'alice',
      });
      const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });

      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('test').build(), aliceSub);
      bob.subscribe(bob.query('test').build(), bobSub);
      await pause();

      await alice.transact(async (tx) => {
        await tx.update('test', 'test1', (entity) => {
          delete entity.name;
        });
        await tx.update('test', 'test1', (entity) => {
          entity.name = { foo: 'bar' };
        });
      });
      await pause();

      expect(
        aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').name
      ).toStrictEqual({
        foo: 'bar',
      });
      expect(
        bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').name
      ).toStrictEqual({
        foo: 'bar',
      });
    });

    it('can perform set -> delete in the same transaction over the network', async () => {
      const serverDB = new DB();
      await serverDB.insert('test', { id: 'test1' });
      const server = new TriplitServer(serverDB);
      const alice = createTestClient(server, SERVICE_KEY, {
        clientId: 'alice',
      });
      const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });

      // set up subscriptions
      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('test').build(), aliceSub);
      bob.subscribe(bob.query('test').build(), bobSub);
      await pause();

      await alice.transact(async (tx) => {
        await tx.update('test', 'test1', (entity) => {
          entity.name = { foo: 'bar' };
        });
        await tx.update('test', 'test1', (entity) => {
          delete entity.name;
        });
      });
      await pause();
      expect(
        aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').name
      ).toBeUndefined();
      expect(
        bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').name
      ).toBeUndefined();
    });
  });

  // TODO: look into the validity of this test...seeing mixed results depending on pause time
  it('subscriptions dont overfire', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const aliceSub = vi.fn();
    alice.subscribe(alice.query('test').build(), aliceSub);
    await pause();
    expect(aliceSub.mock.calls.length).toBe(1); // initial
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    expect(aliceSub.mock.calls.length).toBe(2); // ...prev, optimistic insert, synced

    await alice.update('test', 'test1', (entity) => {
      entity.name = 'updated';
    });
    await pause();
    expect(aliceSub.mock.calls.length).toBe(4); // ...prev, optimistic update, synced

    await alice.delete('test', 'test1');
    await pause();
    expect(aliceSub.mock.calls.length).toBe(5); // ...prev, optimistic delete, (no change to result so no refire)
  });

  it('data is synced properly when query results have been evicted while client is offline', async () => {
    const serverDB = new DB();
    const server = new TriplitServer(serverDB);
    await serverDB.insert('cities', {
      name: 'San Francisco',
      id: 'sf',
      state: 'CA',
    });
    await serverDB.insert('cities', {
      name: 'Los Angeles',
      id: 'la',
      state: 'CA',
    });
    await serverDB.insert('cities', {
      name: 'New York',
      id: 'ny',
      state: 'NY',
    });
    await serverDB.insert('cities', {
      name: 'Nashville',
      id: 'nash',
      state: 'TN',
    });
    await serverDB.insert('cities', {
      name: 'Austin',
      id: 'austin',
      state: 'TX',
    });
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    const query = alice
      .query('cities')
      .select(['id'])
      .where('state', '=', 'CA')
      .build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();

    // sync data for alice and bob
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);
    await pause(300);

    // Disconnect bob
    bob.syncEngine.disconnect();
    await pause(300);

    // Alice, online, makes an update removing 'sf' from the query
    await alice.update('cities', 'sf', (entity) => {
      entity.state = 'FL';
    });
    await pause(300);

    // Bob connects and syncs query
    bob.syncEngine.connect();
    await pause(300);

    // bob properly removes sf after reconnecting
    const bobLatest = bobSub.mock.calls.at(-1)[0];
    expect(bobLatest.length).toBe(1);
    expect(bobLatest.find((e: any) => e.id === 'la')).toBeDefined();
    expect(bobLatest.find((e: any) => e.id === 'sf')).toBeUndefined();
  });

  it('syncs optional records and sets', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            optional: S.Optional(S.String()),
            set: S.Optional(S.Set(S.String())),
            record: S.Optional(S.Record({ foo: S.String() })),
          }),
        },
      },
    };
    const db = new DB({ schema });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await alice.insert('test', {
      id: 'test2',
      name: 'test2',
      optional: 'optional',
      set: new Set(['test']),
      record: { foo: 'bar' },
    });
    await pause(300);
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test').build(), aliceSub);
    bob.subscribe(bob.query('test').build(), bobSub);
    await pause(300);
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toEqual({
      id: 'test1',
      name: 'test1',
    });
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test2')
    ).toEqual({
      id: 'test2',
      name: 'test2',
      optional: 'optional',
      set: new Set(['test']),
      record: { foo: 'bar' },
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toEqual({
      id: 'test1',
      name: 'test1',
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test2')
    ).toEqual({
      id: 'test2',
      name: 'test2',
      optional: 'optional',
      set: new Set(['test']),
      record: { foo: 'bar' },
    });
    await alice.transact(async (tx) => {
      await tx.update('test', 'test1', (entity) => {
        entity.optional = 'updated';
        entity.set = new Set(['updated']);
        entity.record = { foo: 'updated' };
      });
      await tx.update('test', 'test2', (entity) => {
        delete entity.optional;
        delete entity.set;
        delete entity.record;
      });
    });
    await pause(300);
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toEqual({
      id: 'test1',
      name: 'test1',
      optional: 'updated',
      record: { foo: 'updated' },
      set: new Set(['updated']),
    });
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test2')
    ).toEqual({
      id: 'test2',
      name: 'test2',
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toEqual({
      id: 'test1',
      name: 'test1',
      optional: 'updated',
      set: new Set(['updated']),
      record: { foo: 'updated' },
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test2')
    ).toEqual({
      id: 'test2',
      name: 'test2',
    });
  });

  it('can order by related data', async () => {
    const schema = {
      collections: {
        main: {
          schema: S.Schema({
            id: S.Id(),
            relationId: S.String(),
            related: S.RelationById('relations', '$relationId'),
          }),
        },
        relations: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
        },
      },
    };
    const server = new TriplitServer(new DB({ schema }));
    await server.db.insert('relations', { id: '1', name: 'c' });
    await server.db.insert('relations', { id: '2', name: 'b' });
    await server.db.insert('relations', { id: '3', name: 'd' });
    await server.db.insert('relations', { id: '4', name: 'a' });
    await server.db.insert('main', { id: '1', relationId: '1' });
    await server.db.insert('main', { id: '2', relationId: '2' });
    await server.db.insert('main', { id: '3', relationId: '3' });
    await server.db.insert('main', { id: '4', relationId: '4' });

    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });

    const query = alice
      .query('main')
      .order([
        ['related.name', 'ASC'],
        ['id', 'ASC'],
      ])
      .build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);

    await pause(300);

    {
      const aliceResults = Array.from(
        aliceSub.mock.calls.at(-1)[0].map((e: any) => e.id)
      );
      expect(aliceResults).toEqual(['4', '2', '1', '3']);
      const bobResults = Array.from(
        aliceSub.mock.calls.at(-1)[0].map((e: any) => e.id)
      );
      expect(bobResults).toEqual(['4', '2', '1', '3']);
    }

    await alice.update('relations', '1', (entity) => {
      entity.name = 'z';
    });

    await pause(300);

    {
      const aliceResults = Array.from(
        aliceSub.mock.calls.at(-1)[0].map((e: any) => e.id)
      );
      expect(aliceResults).toEqual(['4', '2', '3', '1']);
      const bobResults = Array.from(
        aliceSub.mock.calls.at(-1)[0].map((e: any) => e.id)
      );
      expect(bobResults).toEqual(['4', '2', '3', '1']);
    }
  });

  describe('background syncing', () => {
    it('can subscribe to a bulk query in the background and use local subscriptions for data', async () => {
      const server = new TriplitServer(new DB());
      await server.db.transact(async (tx) => {
        await tx.insert('students', { id: '1', name: 'Alice', dorm: 'A' });
        await tx.insert('students', { id: '2', name: 'Bob', dorm: 'B' });
        await tx.insert('students', { id: '3', name: 'Charlie', dorm: 'A' });
        await tx.insert('students', { id: '4', name: 'David', dorm: 'B' });
        await tx.insert('students', { id: '5', name: 'Eve', dorm: 'A' });
      });

      const alice = createTestClient(server, SERVICE_KEY, {
        clientId: 'alice',
      });

      const remoteQuery = alice.query('students').build();
      const localQueryA = alice
        .query('students')
        .where('dorm', '=', 'A')
        .build();
      const localQueryB = alice
        .query('students')
        .where('dorm', '=', 'B')
        .build();

      const subA = vi.fn();
      const subB = vi.fn();

      alice.subscribe(localQueryA, subA, throwOnError, { localOnly: true });
      alice.subscribe(localQueryB, subB, throwOnError, { localOnly: true });

      await pause();

      expect(subA.mock.calls.at(-1)[0]).toHaveLength(0);
      expect(subA).toHaveBeenCalledTimes(1);
      expect(subB.mock.calls.at(-1)[0]).toHaveLength(0);
      expect(subB).toHaveBeenCalledTimes(1);

      // triggers sync
      alice.subscribeBackground(remoteQuery, { onError: throwOnError });

      await pause();

      expect(subA.mock.calls.at(-1)[0]).toHaveLength(3);
      expect(subA).toHaveBeenCalledTimes(2);
      expect(subB.mock.calls.at(-1)[0]).toHaveLength(2);
      expect(subB).toHaveBeenCalledTimes(2);

      await alice.insert('students', { id: '6', name: 'Frank', dorm: 'A' });

      await pause();

      expect(subA.mock.calls.at(-1)[0]).toHaveLength(4);
      expect(subA).toHaveBeenCalledTimes(3);
      expect(subB.mock.calls.at(-1)[0]).toHaveLength(2);
      expect(subB).toHaveBeenCalledTimes(2);
    });
  });

  it('fires onFulfileld callback when a query is fulfilled', async () => {
    const server = new TriplitServer(new DB());
    await server.db.insert('test', { id: 'test1', name: 'test1' });
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const query = alice.query('test').build();

    {
      const fetchResult = await alice.fetch(query);
      expect(fetchResult).toHaveLength(0);
    }

    const callback = vi.fn();
    alice.subscribeBackground(query, {
      onError: throwOnError,
      onFulfilled: callback,
    });
    await pause();
    expect(callback).toHaveBeenCalledTimes(1);
    {
      const fetchResult = await alice.fetch(query);
      expect(fetchResult).toHaveLength(1);
    }
  });
});

describe('sync status', () => {
  it('subscriptions are scoped via syncStatus', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      autoConnect: false,
    });
    const aliceSubPending = vi.fn();
    const aliceSubConfirmed = vi.fn();
    const aliceSubAll = vi.fn();
    alice.subscribe(
      alice.query('test').syncStatus('pending').build(),
      aliceSubPending
    );
    alice.subscribe(
      alice.query('test').syncStatus('confirmed').build(),
      aliceSubConfirmed
    );
    alice.subscribe(alice.query('test').syncStatus('all').build(), aliceSubAll);
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    alice.connect();
    await pause(1000);
    expect(aliceSubPending.mock.calls.length).toBe(3); // initial, optimistic insert, outbox clear
    expect(aliceSubConfirmed.mock.calls.length).toBe(3); // initial, cache update
    expect(aliceSubAll.mock.calls.length).toBe(3); // initial, optimistic insert, outbox clear + cache update

    // Sync status is kind of a weird abstraction, doenst work well with updates
    // await new Promise((resolve) => setTimeout(resolve, 0));
    // await alice.update('test', 'test1', (entity) => {
    //   entity.name = 'updated';
    // });
    // await new Promise((resolve) => setTimeout(resolve, 1000));
    // expect(aliceSubPending.mock.calls.length).toBe(5); // ...prev, optimistic insert, outbox clear
    // expect(aliceSubConfirmed.mock.calls.length).toBe(3); // ...prev, cache update
    // expect(aliceSubAll.mock.calls.length).toBe(5); // ...prev, optimistic insert, outbox clear + cache update
  });
  it('subscriptions return a subset of entity attributes based on syncStatus', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const aliceSubPending = vi.fn();
    const aliceSubConfirmed = vi.fn();
    const aliceSubAll = vi.fn();
    alice.subscribe(
      alice.query('test').syncStatus('pending').build(),
      aliceSubPending
    );
    alice.subscribe(
      alice.query('test').syncStatus('confirmed').build(),
      aliceSubConfirmed
    );
    alice.subscribe(alice.query('test').syncStatus('all').build(), aliceSubAll);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const originalEntity = {
      id: 'best-rapper',
      firstName: 'Snoop',
      lastName: 'Dogg',
    };
    await alice.insert('test', originalEntity);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(
      aliceSubPending.mock.calls
        .at(1)[0]
        .find((e: any) => e.id === 'best-rapper')
    ).toStrictEqual(originalEntity);
    expect(
      aliceSubConfirmed.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'best-rapper')
    ).toStrictEqual(originalEntity);
    expect(
      aliceSubAll.mock.calls.at(-1)[0].find((e: any) => e.id === 'best-rapper')
    ).toStrictEqual(originalEntity);
    await alice.update('test', 'best-rapper', (entity) => {
      entity.lastName = 'Lion';
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // console.log(aliceSubPending.mock.calls);
    // ^ updated entity is not gonna show up in the outbox because we just changed an attribute
  });
});

describe('offline capabilities', () => {
  it('can sync deletes after being offline', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test').build(), aliceSub);
    bob.subscribe(bob.query('test').build(), bobSub);
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeDefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeDefined();

    // go offline
    bob.syncEngine.disconnect();
    await pause();

    // delete while offline
    await alice.delete('test', 'test1');
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeUndefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeDefined();

    // go back online
    bob.syncEngine.connect();
    await pause();

    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeUndefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeUndefined();
  });
});

describe('subquery syncing', () => {
  const schema = {
    collections: {
      departments: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
          classes: S.RelationMany('classes', {
            where: [['department_id', '=', '$id']],
          }),
        }),
      },
      classes: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          level: S.Number(),
          building: S.String(),
          department_id: S.String(),
          department: S.RelationById('departments', '$department_id'),
        }),
      },
    },
  };
  it('can sync the entities in a subquery after inserts', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, NOT_SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, NOT_SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    await alice.insert('departments', { name: 'Mathematics', id: 'math' });
    await alice.insert('classes', {
      id: 'math1',
      name: 'Math 101',
      level: 101,
      building: 'Voter',
      department_id: 'math',
    });
    await alice.insert('classes', {
      name: 'Math 102',
      id: 'math2',
      level: 102,
      building: 'Voter',
      department_id: 'math',
    });
    const classesQuery = alice.query('departments').include('classes').build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(classesQuery, aliceSub);
    bob.subscribe(classesQuery, bobSub);
    await pause(200);
    expect(
      aliceSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeDefined();
    expect(
      bobSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeDefined();
    await bob.insert('classes', {
      name: 'Math 103',
      id: 'math3',
      level: 103,
      building: 'Voter',
      department_id: 'math',
    });
    await pause(200);
    expect(
      aliceSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math3')
    ).toBeDefined();
    expect(
      bobSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math3')
    ).toBeDefined();
  });
  it('can sync the entities in a subquery after deletes', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    await alice.insert('departments', { name: 'Mathematics', id: 'math' });
    await alice.insert('classes', {
      id: 'math1',
      name: 'Math 101',
      level: 101,
      building: 'Voter',
      department_id: 'math',
    });
    await alice.insert('classes', {
      name: 'Math 102',
      id: 'math2',
      level: 102,
      building: 'Voter',
      department_id: 'math',
    });
    const classesQuery = alice.query('departments').include('classes').build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(classesQuery, aliceSub);
    bob.subscribe(classesQuery, bobSub);
    await pause(200);
    expect(
      aliceSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeDefined();
    expect(
      bobSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeDefined();
    await alice.delete('classes', 'math1');
    await pause(200);
    expect(
      aliceSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeUndefined();
    expect(
      bobSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeUndefined();
  });
  it('can sync updates to an entity in a subquery', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    await alice.insert('departments', { name: 'Mathematics', id: 'math' });
    await alice.insert('classes', {
      id: 'math1',
      name: 'Math 101',
      level: 101,
      building: 'Voter',
      department_id: 'math',
    });
    await alice.insert('classes', {
      name: 'Math 102',
      id: 'math2',
      level: 102,
      building: 'Voter',
      department_id: 'math',
    });
    const classesQuery = alice.query('departments').include('classes').build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(classesQuery, aliceSub);
    bob.subscribe(classesQuery, bobSub);
    await pause(200);
    expect(
      aliceSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeDefined();
    expect(
      bobSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1')
    ).toBeDefined();
    await alice.update('classes', 'math1', (entity) => {
      entity.name = 'Math 103';
    });
    await pause(200);
    expect(
      aliceSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1').name
    ).toBe('Math 103');
    expect(
      bobSub.mock.calls
        .at(-1)[0]
        .find((e: any) => e.id === 'math')
        .classes.find((e: any) => e.id === 'math1').name
    ).toBe('Math 103');
  });
  it('can sync entities in a subquery that returns a singleton', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    await alice.insert('departments', { name: 'Mathematics', id: 'math' });
    await alice.insert('classes', {
      id: 'math1',
      name: 'Math 101',
      level: 101,
      building: 'Voter',
      department_id: 'math',
    });
    await alice.insert('classes', {
      name: 'Math 102',
      id: 'math2',
      level: 102,
      building: 'Voter',
      department_id: 'math',
    });
    const classesQuery = alice.query('classes').include('department').build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(classesQuery, aliceSub);
    bob.subscribe(classesQuery, bobSub);
    await pause(200);
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1')
        .department
    ).toBeDefined();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1')
        .department.name
    ).toBe('Mathematics');
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1').department
    ).toBeDefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1').department
        .name
    ).toBe('Mathematics');
    bob.update('departments', 'math', (entity) => {
      entity.name = 'Math';
    });
    await pause(200);
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1')
        .department.name
    ).toBe('Math');
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1').department
        .name
    ).toBe('Math');
    alice.delete('departments', 'math');
    await pause(200);
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1')
        .department
    ).toBe(null);
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'math1').department
    ).toBe(null);
  });

  it.todo('Can reconnect to a query with a filter', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({ id: S.Id(), data: S.Set(S.String()) }),
        },
      },
    };
    const server = new TriplitServer(new DB({ schema }));
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });

    await alice.insert('test', { id: 'test1', data: new Set(['a', 'b', 'c']) });

    const query = alice.query('test').where('data', '=', 'c').build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeDefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeDefined();
    bob.syncEngine.disconnect();
    await pause();
    await alice.update('test', 'test1', (entity) => {
      entity.data.delete('c');
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeUndefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeDefined();
    bob.syncEngine.connect();
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeUndefined();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1')
    ).toBeUndefined();
  });

  it('Can evict multiple items from windowed subscription', async () => {
    const schema = {
      users: {
        schema: S.Schema({ id: S.Id(), number: S.Number() }),
      },
    } satisfies ClientSchema;
    const serverDb = new DB({ schema: { collections: schema, version: 0 } });
    const server = new TriplitServer(serverDb);
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema,
    });
    // Initialize db data
    await serverDb.transact(async (tx) => {
      await tx.insert('users', { id: '1', number: 3 });
      await tx.insert('users', { id: '2', number: 2 });
      await tx.insert('users', { id: '3', number: 1 });
    });
    const query = alice
      .query('users')
      .order([['number', 'DESC']])
      .limit(2);
    const sub = vi.fn();
    alice.subscribe(query.build(), sub);
    await pause();

    // Data has loaded
    {
      const lastCall = sub.mock.calls.at(-1)[0];
      expect(lastCall).toHaveLength(2);
      expect([...lastCall.values()].map((e: any) => e.id)).toEqual(['1', '2']);
    }

    // Insert new data on the server that evicts the current data (multiple matches in limit window)
    await serverDb.transact(async (tx) => {
      // insertion order should be higher number first to trigger windowing issue
      await tx.insert('users', { id: '4', number: 6 });
      await tx.insert('users', { id: '5', number: 5 });
      await tx.insert('users', { id: '6', number: 4 });
    });
    await pause();

    // new data has loaded into the subscription window
    {
      const lastCall = sub.mock.calls.at(-1)[0];
      expect(lastCall).toHaveLength(2);
      expect([...lastCall.values()].map((e: any) => e.id)).toEqual(['4', '5']);
    }
  });
});

describe('pagination syncing', () => {
  const schema = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.String(),
          text: S.String(),
          created_at: S.Date({ default: { func: 'now' } }),
        }),
      },
    },
  };
  it('can subscribe to cursors', async () => {
    const server = new TriplitServer(
      new DB({ source: new MemoryStorage(), schema })
    );
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, SERVICE_KEY, {
      clientId: 'bob',
      schema: schema.collections,
    });
    const datesInASCOrder = [
      '2021-01-01T00:00:00.000Z',
      '2021-01-02T00:00:00.000Z',
      '2021-01-03T00:00:00.000Z',
      '2021-01-04T00:00:00.000Z',
      '2021-01-05T00:00:00.000Z',
      '2021-01-06T00:00:00.000Z',
      '2021-01-07T00:00:00.000Z',
      '2021-01-08T00:00:00.000Z',
      '2021-01-09T00:00:00.000Z',
      '2021-01-10T00:00:00.000Z',
    ].map((date, i) => [`${i}`, new Date(date)] as const);
    for (const [id, created_at] of datesInASCOrder) {
      await alice.insert('todos', {
        text: 'todo',
        created_at,
        id,
      });
    }
    const bobSub = vi.fn();
    bob.subscribe(
      bob
        .query('todos')
        .order(['created_at', 'DESC'])
        .limit(5)
        .after([datesInASCOrder[5][1], datesInASCOrder[5][0]])
        .build(),
      bobSub
    );
    await pause();
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect([...bobSub.mock.calls.at(-1)[0].map((e: any) => e.id)]).toEqual(
      datesInASCOrder
        .slice()
        .reverse()
        .slice(5, 10)
        .map(([id]) => id)
    );
    // insert new todo
    const NEW_ID = 'inserted';
    const DATE = '2021-01-05T00:00:00.001Z';
    await alice.insert('todos', {
      text: 'todo',
      created_at: new Date(DATE),
      id: NEW_ID,
    });
    await pause(150);
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect([...bobSub.mock.calls.at(-1)[0].map((e: any) => e.id)]).toEqual([
      NEW_ID,
      ...datesInASCOrder
        .slice()
        .reverse()
        .slice(5, 9)
        .map(([id]) => id),
    ]);
    // delete a todo
    await alice.delete('todos', NEW_ID);
    await pause(200);
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect([...bobSub.mock.calls.at(-1)[0].map((e: any) => e.id)]).toEqual(
      datesInASCOrder
        .slice()
        .reverse()
        .slice(5, 10)
        .map(([id]) => id)
    );
  });
});

describe('stateful query syncing', () => {
  it('server doesnt send triples that have already been sent for a query', async () => {
    const serverDB = new DB({ source: new MemoryStorage() });
    const server = new TriplitServer(serverDB);
    await serverDB.insert('cities', {
      name: 'San Francisco',
      id: 'sf',
      state: 'CA',
    });
    await serverDB.insert('cities', {
      name: 'Los Angeles',
      id: 'la',
      state: 'CA',
    });
    await serverDB.insert('cities', {
      name: 'New York',
      id: 'ny',
      state: 'NY',
    });
    await serverDB.insert('cities', {
      name: 'Nashville',
      id: 'nash',
      state: 'TN',
    });
    await serverDB.insert('cities', {
      name: 'Austin',
      id: 'austin',
      state: 'TX',
    });
    const client = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
    });
    {
      const syncMessageCallback = vi.fn();
      client.syncEngine.onSyncMessageReceived(syncMessageCallback);
      const unsub = client.subscribe(
        client.query('cities').where('state', '=', 'CA').build(),
        () => {}
      );
      await pause(10);
      expect(syncMessageCallback).toHaveBeenCalled();
      const triplesMessages = syncMessageCallback.mock.calls.filter(
        ([{ type }]) => type === 'TRIPLES'
      );
      expect(triplesMessages).toHaveLength(1);
      expect(triplesMessages[0][0].payload.triples.length).toBeGreaterThan(0);
      unsub();
    }
    // Resubscribe to the same query and check no triples returned
    {
      const syncMessageCallback = vi.fn();
      client.syncEngine.onSyncMessageReceived(syncMessageCallback);
      await pause();
      const unsub = client.subscribe(
        client.query('cities').where('state', '=', 'CA').build(),
        () => {}
      );
      await pause();
      expect(syncMessageCallback).toHaveBeenCalled();
      const triplesMessages = syncMessageCallback.mock.calls.filter(
        ([{ type }]) => type === 'TRIPLES'
      );
      expect(triplesMessages).toHaveLength(1);
      expect(triplesMessages[0][0].payload.triples.length).toBe(0);
      unsub();
    }
  });
});

it('Updates dont oversend triples', async () => {
  const server = new TriplitServer(new DB());
  const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
  const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });
  await alice.insert('test', { id: 'test1', name: 'test1' });
  await pause();
  // // setup subscriptions
  alice.subscribe(alice.query('test').build(), () => {});
  bob.subscribe(bob.query('test').build(), () => {});
  await pause();
  const syncMessageCallback = vi.fn();
  bob.syncEngine.onSyncMessageReceived(syncMessageCallback);
  // running updates without pause causes read/write errors
  await alice.update('test', 'test1', (entity) => {
    entity.name = 'updated1';
  });
  await pause();
  await alice.update('test', 'test1', (entity) => {
    entity.name = 'updated2';
  });
  await pause();
  await alice.update('test', 'test1', (entity) => {
    entity.name = 'updated3';
  });
  await pause();
  const triplesMessages = syncMessageCallback.mock.calls.filter(
    (msg) => msg[0].type === 'TRIPLES'
  );
  const lastTriplesMessage = triplesMessages.at(-1)[0];

  expect(lastTriplesMessage?.payload.triples).toHaveLength(1);
});

describe('outbox', () => {
  it('on sync data will move from the outbox to the cache', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const bob = createTestClient(server, SERVICE_KEY, { clientId: 'bob' });

    const query = alice.query('test').build();
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);

    await pause();
    await alice.insert('test', { id: 'test1', name: 'test1' });

    const aliceOutbox = alice.db.tripleStore.setStorageScope(['outbox']);
    const aliceCache = alice.db.tripleStore.setStorageScope(['cache']);
    const bobOutbox = bob.db.tripleStore.setStorageScope(['outbox']);
    const bobCache = bob.db.tripleStore.setStorageScope(['cache']);

    // Alice before sync
    {
      const outboxTriples = await genToArr(aliceOutbox.findByEntity());
      const cacheTriples = await genToArr(aliceCache.findByEntity());
      expect(outboxTriples).toHaveLength(3);
      expect(cacheTriples).toHaveLength(0);
    }
    // Bob before sync
    {
      const outboxTriples = await genToArr(bobOutbox.findByEntity());
      const cacheTriples = await genToArr(bobCache.findByEntity());
      expect(outboxTriples).toHaveLength(0);
      expect(cacheTriples).toHaveLength(0);
    }
    await pause();
    // Alice after sync
    {
      const outboxTriples = await genToArr(aliceOutbox.findByEntity());
      const cacheTriples = await genToArr(aliceCache.findByEntity());
      expect(outboxTriples).toHaveLength(0);
      expect(cacheTriples).toHaveLength(3);
    }
    // Bob after sync
    {
      const outboxTriples = await genToArr(bobOutbox.findByEntity());
      const cacheTriples = await genToArr(bobCache.findByEntity());
      expect(outboxTriples).toHaveLength(0);
      expect(cacheTriples).toHaveLength(3);
    }
  });

  // This is the ugliest set of tests ive ever written
  // It would be nice for us to have a way to pause the sync messages
  // I think we could create a transport that will queue messages and you need to "release" them manually
  describe('outbox ACK tracking', () => {
    // This test is flaky, probably want to implement the type of tranport that I mentioned above
    it.todo(
      'will not send re-send triples that have already been sent even if theyre in the outbox',
      async () => {
        // Setup some initial data in the outbox
        const server = new TriplitServer(new DB());
        const alice = createTestClient(server, SERVICE_KEY, {
          clientId: 'alice',
          autoConnect: false,
        });
        const query = alice.query('test').build();
        const { txId: txId1 } = await alice.insert('test', {
          id: 'test1',
          name: 'test1',
        });
        await pause();

        // When alice sends the first TRIPLES message, it should mark the triples as sent
        // When that happens (before the server comes back with an ACK), insert a new entity to the outbox
        // Check the second TRIPLES message doesnt contain data already sent
        // Check that the both transactions are is still in the outbox
        const outerUnsub = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'TRIPLES') {
              outerUnsub();
              const { txId: txId2 } = await alice.insert('test', {
                id: 'test2',
                name: 'test2',
              });
              const innerUnsub = alice.syncEngine.onSyncMessageSent(
                async (message) => {
                  if (message.type === 'TRIPLES') {
                    innerUnsub();
                    const triples = message.payload.triples;
                    expect(
                      triples.every(
                        (t) => JSON.stringify(t.timestamp) === txId2
                      )
                    ).toBe(true);
                    // Hard to nail down exactly when the outbox will be between TRIPLES and ACK messages
                    const outboxTriples = await genToArr(
                      alice.db.tripleStore
                        .setStorageScope(['outbox'])
                        .findByEntity()
                    );
                    expect(
                      outboxTriples.filter(
                        (t) => JSON.stringify(t.timestamp) === txId1
                      ).length
                    ).toBeGreaterThan(0);
                    expect(
                      outboxTriples.filter(
                        (t) => JSON.stringify(t.timestamp) === txId2
                      ).length
                    ).toBeGreaterThan(0);
                  }
                }
              );
            }
          }
        );
        alice.syncEngine.connect();
        alice.subscribe(query, () => {});
        await pause(300);
      }
    );

    // test a mix of successful and unsuccessful
    it('will resend triples if they fail on insert', async () => {
      const schema = {
        collections: {
          test: {
            schema: S.Schema({ id: S.Id(), name: S.String() }),
          },
        },
      };
      // Setup some initial data in the outbox
      const db = new DB({ schema });

      // Schemas dont match but the server doenst disconnect?
      const server = new TriplitServer(db);
      const alice = createTestClient(server, SERVICE_KEY, {
        clientId: 'alice',
        autoConnect: false,
      });
      const query = alice.query('test').build();
      // success
      const { txId: txId1 } = await alice.insert('test', {
        id: 'test1',
        name: 'test1',
      });
      // fail (schema mismatch)
      const { txId: txId2 } = await alice.insert('test', {
        id: 'test2',
        name: 2,
      });
      // success
      const { txId: txId3 } = await alice.insert('test', {
        id: 'test3',
        name: 'test3',
      });
      await pause();

      // When alice sends the first TRIPLES message, all txs should send
      {
        let passed = false;
        const unsubscribe = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'TRIPLES') {
              unsubscribe();
              const triples = message.payload.triples;
              const tx1Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId1
              );
              const tx2Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId2
              );
              const tx3Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId3
              );
              expect(tx1Triples).toHaveLength(3);
              expect(tx2Triples).toHaveLength(3);
              expect(tx3Triples).toHaveLength(3);
              passed = true;
            }
          }
        );
        alice.syncEngine.connect();
        await pause(1000);
        expect(passed).toBe(true);
      }

      // @ts-expect-error (not exposed)
      // Eventaully, flush outbox again and check that only the failed tx is sent
      alice.syncEngine.signalOutboxTriples();
      {
        let passed = false;
        const unsubscribe = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'TRIPLES') {
              unsubscribe();
              const triples = message.payload.triples;
              const tx1Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId1
              );
              const tx2Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId2
              );
              const tx3Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId3
              );
              expect(tx1Triples).toHaveLength(0);
              expect(tx2Triples).toHaveLength(3);
              expect(tx3Triples).toHaveLength(0);
              passed = true;
            }
          }
        );
        await pause(300);
        expect(passed).toBe(true);
      }
    });

    it('on socket disconnect, un-ACKed triples will be re-sent', async () => {
      // Setup data with a successful tx
      const server = new TriplitServer(new DB());
      const alice = createTestClient(server, SERVICE_KEY, {
        clientId: 'alice',
        autoConnect: false,
      });
      const query = alice.query('test').build();
      const { txId: txId1 } = await alice.insert('test', {
        id: 'test1',
        name: 'test1',
      });
      await pause();

      // When alice sends the first TRIPLES message, it should mark the triples as sent, immediately disconnect
      {
        const unsubscribe = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'TRIPLES') {
              unsubscribe();
              const triples = message.payload.triples;
              const tx1Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId1
              );
              expect(tx1Triples).toHaveLength(3);
              alice.syncEngine.disconnect();
            }
          }
        );
      }
      alice.syncEngine.connect();
      alice.subscribe(query, () => {});
      // await disconnect
      await pause(300);

      // reconnect and flush outbox, triples should try to send again
      alice.syncEngine.connect();
      // @ts-expect-error (not exposed)
      alice.syncEngine.signalOutboxTriples();
      {
        const unsubscribe = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'TRIPLES') {
              unsubscribe();
              const triples = message.payload.triples;
              const tx1Triples = triples.filter(
                (t) => JSON.stringify(t.timestamp) === txId1
              );
              expect(tx1Triples).toHaveLength(3);
            }
          }
        );
      }
      await pause(300);
    });
  });
});

describe('rules', () => {
  const ALICE_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6ImV4dGVybmFsIiwieC10cmlwbGl0LXByb2plY3QtaWQiOiJ0b2RvcyIsIngtdHJpcGxpdC11c2VyLWlkIjoiYWxpY2UiLCJpYXQiOjE2OTc0NzkwMjd9.9ZWn7TPqBtwWvh1V3ciDsmVuissoU4TLx3u0m2Hlj74`;
  const BOB_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6ImV4dGVybmFsIiwieC10cmlwbGl0LXByb2plY3QtaWQiOiJ0b2RvcyIsIngtdHJpcGxpdC11c2VyLWlkIjoiYm9iIiwiaWF0IjoxNjk3NDc5MDI3fQ.wKpkU9ZAGOtz5A6ELaYdPyMOfUiP_yuMi3QWfJZqjdQ`;
  it('can subscribe to queries with rules', async () => {
    const schema = {
      users: {
        schema: S.Schema({ id: S.Id(), name: S.String() }),
      },
      posts: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          author_id: S.String(),
          collaborators: S.Set(S.String()),
        }),
        rules: {
          read: {
            'own-posts': {
              filter: [
                or([
                  ['author_id', '=', '$SESSION_USER_ID'],
                  ['collaborators', 'has', '$SESSION_USER_ID'],
                ]),
              ],
            },
          },
        },
      },
    } satisfies ClientSchema;
    const serverDb = new DB({ schema: { collections: schema, version: 0 } });
    const server = new TriplitServer(serverDb);

    // Insert users
    await serverDb.insert('users', { id: 'alice', name: 'Alice' });
    await serverDb.insert('users', { id: 'bob', name: 'Bob' });

    const alice = createTestClient(server, ALICE_TOKEN, {
      clientId: 'alice',
      schema: schema,
    });
    const bob = createTestClient(server, BOB_TOKEN, {
      clientId: 'bob',
      schema: schema,
    });
    const bobCallback = vi.fn();
    bob.subscribe(bob.query('posts').build(), bobCallback);
    // insert a post just for Alice
    await alice.insert('posts', {
      text: 'My diary',
      author_id: 'alice',
      collaborators: new Set(),
    });
    // insert a post with Bob as a collaborator
    const { output } = await alice.insert('posts', {
      text: 'Hello, Bob!',
      author_id: 'alice',
      collaborators: new Set(['bob']),
    });
    const secondPostId = output?.id;
    await pause(200);
    expect(bobCallback).toHaveBeenCalledTimes(2);
    const lastCallVal = bobCallback.mock.calls.at(-1)[0];
    expect(lastCallVal).toHaveLength(1);
    expect(lastCallVal.find((e: any) => e.id === secondPostId)).toBeTruthy();
  });

  it('can write when matching rules', async () => {
    const schema = {
      users: {
        schema: S.Schema({ id: S.Id(), name: S.String() }),
      },
      posts: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          author_id: S.String(),
          collaborators: S.Set(S.String()),
        }),
        rules: {
          read: {
            'own-posts': {
              filter: [
                or([
                  ['author_id', '=', '$SESSION_USER_ID'],
                  ['collaborators', 'has', '$SESSION_USER_ID'],
                ]),
              ],
            },
          },
          write: {
            author_only: {
              filter: [['author_id', '=', '$SESSION_USER_ID']],
            },
          },
        },
      },
    } satisfies ClientSchema;
    const serverDb = new DB({ schema: { collections: schema, version: 0 } });
    const server = new TriplitServer(serverDb);

    // Insert users
    await serverDb.insert('users', { id: 'alice', name: 'Alice' });
    await serverDb.insert('users', { id: 'bob', name: 'Bob' });

    const alice = createTestClient(server, ALICE_TOKEN, {
      clientId: 'alice',
      schema: schema,
    });
    const bob = createTestClient(server, BOB_TOKEN, {
      clientId: 'bob',
      schema: schema,
    });
    const bobCallback = vi.fn();
    bob.subscribe(bob.query('posts').build(), bobCallback);
    // insert a post just for Alice
    await alice.insert('posts', {
      id: 'good-post',
      text: 'My diary',
      author_id: 'alice',
      collaborators: new Set(['bob']),
    });
    await pause(400); // TODO: fixup bulk tx handling and remove
    await alice.insert('posts', {
      id: 'bad-post',
      text: 'My diary',
      author_id: 'bob',
      collaborators: new Set('bob'),
    });
    await pause(600);
    expect(bobCallback).toHaveBeenCalled();
    const lastCallVal = bobCallback.mock.calls.at(-1)[0];
    expect(lastCallVal).toHaveLength(1);
    expect(lastCallVal.find((e: any) => e.id === 'good-post')).toBeTruthy();
  });
});

describe('permissions', () => {
  const SCHEMA = {
    roles: {
      user: {
        match: {
          sub: '$userId',
        },
      },
    },
    collections: {
      groupChats: {
        schema: S.Schema({
          id: S.String(),
          memberIds: S.Set(S.String()),
          name: S.String(),
          adminId: S.String(),
        }),
        permissions: {
          user: {
            read: {
              filter: [['memberIds', 'has', '$role.userId']],
            },
            update: {
              filter: [['adminId', '=', '$role.userId']],
            },
            insert: {
              filter: [['memberIds', 'has', '$role.userId']],
            },
          },
        },
      },
      messages: {
        schema: S.Schema({
          id: S.String(),
          authorId: S.String(),
          text: S.String(),
          groupId: S.String(),
          group: S.RelationById('groupChats', '$groupId'),
        }),
        permissions: {
          user: {
            read: {
              filter: [['group.memberIds', 'has', '$role.userId']],
            },
            update: {
              filter: [false],
            },
            insert: {
              filter: [
                ['group.memberIds', 'has', '$role.userId'],
                ['authorId', '=', '$role.userId'],
              ],
            },
          },
        },
      },
    },
    version: 0,
  } satisfies StoreSchema<Models>;

  // signing key = "integration-tests"
  const ALICE_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoidG9kb3MiLCJpYXQiOjE2OTc0NzkwMjd9.5sgJA0olA18LreY8_XTGx4_CAnoDLy9tvJsgUqTI2JU';
  const BOB_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJib2IiLCJ4LXRyaXBsaXQtcHJvamVjdC1pZCI6InRvZG9zIiwiaWF0IjoxNjk3NDc5MDI3fQ.S9lOFgpUnUnZuX19bzxkEnyoPDQ4oscpWmwA_NkEW5g';

  describe('insert', async () => {
    it('restricts groupChat insertions', async () => {
      const server = new TriplitServer(new DB({ schema: SCHEMA }));
      const alice = createTestClient(server, ALICE_TOKEN, {
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, BOB_TOKEN, {
        clientId: 'bob',
        schema: SCHEMA.collections,
      });

      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('groupChats').build(), aliceSub);
      bob.subscribe(bob.query('groupChats').build(), bobSub);

      await pause();

      // Alice can insert a group chat where she is a member
      {
        const { txId: aliceTx } = await alice.insert('groupChats', {
          id: 'chat1',
          memberIds: new Set(['alice']),
          name: 'chat1',
          adminId: 'alice',
        });
        alice.onTxFailureRemote(aliceTx!, throwOnError);
        await pause();
        expect(aliceSub).toHaveBeenCalled();
        expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
        expect(bobSub).toHaveBeenCalled();
        expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(0);
      }

      // Bob cannot insert a group chat where he is not a member
      {
        const { txId } = await bob.insert('groupChats', {
          id: 'chat2',
          memberIds: new Set(['alice']),
          name: 'chat2',
          adminId: 'alice',
        });
        const bobErrorSub = vi.fn();
        bob.onTxFailureRemote(txId!, bobErrorSub);
        await pause();
        expect(bobErrorSub).toHaveBeenCalled();
      }
    });

    it('restricts message insertions', async () => {
      const server = new TriplitServer(new DB({ schema: SCHEMA }));
      await server.db.insert(
        'groupChats',
        {
          id: 'chat1',
          memberIds: new Set(['alice']),
          name: 'chat1',
          adminId: 'alice',
        },
        { skipRules: true }
      );
      await server.db.insert(
        'groupChats',
        {
          id: 'chat2',
          memberIds: new Set(['alice', 'bob']),
          name: 'chat2',
          adminId: 'bob',
        },
        { skipRules: true }
      );
      const alice = createTestClient(server, ALICE_TOKEN, {
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, BOB_TOKEN, {
        clientId: 'bob',
        schema: SCHEMA.collections,
      });

      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('messages').build(), aliceSub);
      bob.subscribe(bob.query('messages').build(), bobSub);

      await pause();

      // Alice can insert a message in a group chat where she is a member
      {
        const { txId } = await alice.insert('messages', {
          id: 'msg1',
          groupId: 'chat1',
          authorId: 'alice',
          text: 'hello',
        });
        alice.onTxFailureRemote(txId!, throwOnError);
        await pause();

        // All group members get the messages in group
        expect(aliceSub).toHaveBeenCalled();
        expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
        expect(bobSub).toHaveBeenCalled();
        expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(0);
      }

      const bobErrorSub = vi.fn();
      // Bob cannot insert a message as alice
      {
        const { txId } = await bob.insert('messages', {
          id: 'msg2',
          groupId: 'chat2',
          authorId: 'alice',
          text: 'hello',
        });
        bob.onTxFailureRemote(txId!, bobErrorSub);
        await pause();
        expect(bobErrorSub).toHaveBeenCalled();
        bobErrorSub.mockClear();
      }

      // Bob cannot insert a message into a group he is not a member of
      {
        const { txId } = await bob.insert('messages', {
          id: 'msg4',
          groupId: 'chat1',
          authorId: 'bob',
          text: 'hello',
        });
        bob.onTxFailureRemote(txId!, bobErrorSub);
        await pause();
        expect(bobErrorSub).toHaveBeenCalled();
      }
    });
  });

  describe('update', async () => {
    it('restricts groupChat updates', async () => {
      const server = new TriplitServer(new DB({ schema: SCHEMA }));
      const alice = createTestClient(server, ALICE_TOKEN, {
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, BOB_TOKEN, {
        clientId: 'bob',
        schema: SCHEMA.collections,
      });
      // Create a group chat
      await server.db.insert(
        'groupChats',
        {
          id: 'chat1',
          memberIds: new Set(['alice', 'bob']),
          name: 'chat1',
          adminId: 'alice',
        },
        { skipRules: true }
      );

      await pause();
      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('groupChats').build(), aliceSub);
      bob.subscribe(bob.query('groupChats').build(), bobSub);

      await pause();
      expect(aliceSub).toHaveBeenCalled();
      expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
      expect(bobSub).toHaveBeenCalled();
      expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(1);

      // Bob cannot update group chat because he is not the admin
      const { txId } = await bob.update('groupChats', 'chat1', (entity) => {
        entity.name = 'updated';
      });
      const bobErrorSub = vi.fn();
      bob.onTxFailureRemote(txId!, bobErrorSub);
      await pause();
      expect(bobErrorSub).toHaveBeenCalled();
    });

    it('restricts message updates', async () => {
      const server = new TriplitServer(new DB({ schema: SCHEMA }));
      const alice = createTestClient(server, ALICE_TOKEN, {
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, BOB_TOKEN, {
        clientId: 'bob',
        schema: SCHEMA.collections,
      });

      // Create a group chat
      await server.db.insert(
        'groupChats',
        {
          id: 'chat1',
          memberIds: new Set(['alice', 'bob']),
          name: 'chat1',
          adminId: 'alice',
        },
        { skipRules: true }
      );

      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('messages').build(), aliceSub);
      bob.subscribe(bob.query('messages').build(), bobSub);

      await pause();
      await alice.insert('messages', {
        id: 'msg1',
        groupId: 'chat1',
        authorId: 'alice',
        text: 'hello',
      });
      await pause();
      expect(aliceSub).toHaveBeenCalled();
      expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
      expect(bobSub).toHaveBeenCalled();
      expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(1);

      // Alice cannot update message because message updates are illegal
      {
        const { txId } = await alice.update('messages', 'msg1', (entity) => {
          entity.text = 'updated';
        });
        const errCallback = vi.fn();
        alice.onTxFailureRemote(txId!, errCallback);
        await pause();
        expect(errCallback).toHaveBeenCalled();
      }
      // Bob cannot update message because message updates are illegal
      {
        const { txId } = await bob.update('messages', 'msg1', (entity) => {
          entity.text = 'updated';
        });
        const errCallback = vi.fn();
        bob.onTxFailureRemote(txId!, errCallback);
        await pause();
        expect(errCallback).toHaveBeenCalled();
      }
    });
  });
});

describe('deduping subscriptions', () => {
  it('sends only one CONNECT_QUERY message for multiple subscriptions to the same query', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const query = alice.query('test').build();
    const sub1Callback = vi.fn();
    const sub2Callback = vi.fn();
    const syncMessageCallback = vi.fn();
    alice.syncEngine.onSyncMessageSent(syncMessageCallback);
    const unsub1 = alice.subscribe(query, sub1Callback);

    await pause();
    expect(syncMessageCallback).toHaveBeenCalledTimes(1);
    const unsub2 = alice.subscribe(query, sub2Callback);
    await pause();

    expect(syncMessageCallback).toHaveBeenCalledTimes(1);
    unsub1();
    await pause();
    expect(syncMessageCallback).toHaveBeenCalledTimes(1);
    expect(syncMessageCallback.mock.lastCall[0].type).toBe('CONNECT_QUERY');
    unsub2();
    await pause();
    expect(syncMessageCallback).toHaveBeenCalledTimes(2);
    expect(syncMessageCallback.mock.lastCall[0].type).toBe('DISCONNECT_QUERY');
  });
  it("will send updates to all subscribers that haven't been unsubscribed", async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const query = alice.query('test').build();
    const sub1 = vi.fn();
    const sub2 = vi.fn();
    const unsub1 = alice.subscribe(query, sub1);
    const unsub2 = alice.subscribe(query, sub2);
    await pause();
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    expect(sub1).toHaveBeenCalled();
    expect(sub2).toHaveBeenCalled();
    sub1.mockClear();
    sub2.mockClear();
    unsub1();
    alice.update('test', 'test1', (entity) => {
      entity.name = 'test2';
    });
    await pause();
    expect(sub1).not.toHaveBeenCalled();
    expect(sub2).toHaveBeenCalled();
    sub2.mockClear();

    unsub2();
    alice.delete('test', 'test1');
    await pause();
    expect(sub1).not.toHaveBeenCalled();
    expect(sub2).not.toHaveBeenCalled();
  });
  it('subsequent subscriptions initiated after the first resolves should be immediately fulfilled', async () => {
    const server = new TriplitServer(new DB());
    const alice = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    const query = alice.query('test').build();
    const sub1 = vi.fn();
    const sub2 = vi.fn();
    const unsub1 = alice.subscribe(query, sub1);
    await pause();
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    const unsub2 = alice.subscribe(query, sub2);
    await pause();
    expect(sub2).toHaveBeenCalledOnce();
    expect(sub2.mock.lastCall[1].hasRemoteFulfilled).toBe(true);
  });
});

it('running reset will disconnect and reset the client sync state and clear all data', async () => {
  const db = new DB();
  const server = new TriplitServer(db);
  await db.insert('collection_a', { id: 'a1' });
  await db.insert('collection_b', { id: 'b1' });
  const alice = createTestClient(server, SERVICE_KEY, {
    clientId: 'alice',
  });
  const query1 = alice.query('collection_a').build();
  const query2 = alice.query('collection_b').build();
  const qh1 = hashQuery(query1);
  const qh2 = hashQuery(query2);
  alice.subscribe(query1, () => {});
  alice.subscribe(query2, () => {});
  await pause(300);

  {
    // check state
    expect(alice.syncEngine.connectionStatus).toBe('OPEN');
    // awaiting ack state is difficult to test
    expect(
      // @ts-expect-error (not exposed)
      alice.syncEngine.queries.size
    ).toBe(2);
    await expect(
      alice.syncEngine
        // @ts-expect-error (not exposed)
        .getQueryState(qh1)
    ).resolves.toBeDefined();
    await expect(
      alice.syncEngine
        // @ts-expect-error (not exposed)
        .getQueryState(qh2)
    ).resolves.toBeDefined();

    const results = await alice.fetch(query1);
    expect(results.length).toBe(1);
  }

  // reset
  alice.disconnect();
  await alice.reset();
  await pause(300);
  {
    // check state
    // disconnected
    expect(alice.syncEngine.connectionStatus).toBe('CLOSED');

    expect(
      // @ts-expect-error (not exposed)
      alice.syncEngine.awaitingAck.size
    ).toBe(0);
    expect(
      // @ts-expect-error (not exposed)
      alice.syncEngine.queries.size
    ).toBe(0);
    await expect(
      alice.syncEngine
        // @ts-expect-error (not exposed)
        .getQueryState(qh1)
    ).resolves.toBeUndefined();
    await expect(
      alice.syncEngine
        // @ts-expect-error (not exposed)
        .getQueryState(qh2)
    ).resolves.toBeUndefined();
    const results = await alice.fetch(query1);
    expect(results.length).toBe(0);
  }
});

describe('backfilling queries with limits', async () => {
  // Server starts with data larger than the limit,
  // the client subscribes to some data with a limit,
  // then deletes some data, which should trigger
  // a backfill so that the client has the correct number of items
  it('can handle simple non-relational query', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      },
    };
    const serverDB = new DB({ schema });
    // insert 20 items
    for (let i = 0; i < 40; i++) {
      serverDB.insert('test', { id: `test${i}`, name: `test${i}` });
    }
    const LIMIT = 10;

    const server = new TriplitServer(serverDB);
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = alice
      .query('test')
      .where('name', 'like', 'test%')
      .limit(LIMIT)
      .build();
    const messages = spyMessages(alice);

    const aliceSub = vi.fn();
    alice.subscribe(query, aliceSub);
    await pause(200);
    expect(aliceSub).toHaveBeenCalled();
    const initialResults = aliceSub.mock.calls.at(-1)[0];
    expect(initialResults).toHaveLength(LIMIT);
    const itemsToDelete = initialResults.map((e: any) => e.id).slice(0, 5);
    await alice.transact(async (tx) => {
      for (const id of itemsToDelete) {
        await tx.delete('test', id);
      }
    });
    await pause(200);
    const latestResults = aliceSub.mock.calls.at(-1)[0];
    expect(latestResults).toHaveLength(LIMIT);
    const resultIds = latestResults.map((e: any) => e.id);

    const deletedIds = ['test0', 'test1', 'test2', 'test3', 'test4'];
    expect(resultIds).not.toContain(deletedIds);
  });
  it('can handle a simple non-relational query with an order', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      },
    };
    const serverDB = new DB({ schema });
    // insert 20 items
    for (let i = 0; i < 40; i++) {
      serverDB.insert('test', { id: `test${i}`, name: `test${i}` });
    }
    const LIMIT = 10;

    const server = new TriplitServer(serverDB);
    const alice = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = alice
      .query('test')
      .order('name', 'ASC')
      .where('name', 'like', 'test%')
      .limit(LIMIT)
      .build();
    const messages = spyMessages(alice);

    const aliceSub = vi.fn();
    alice.subscribe(query, aliceSub);
    await pause(200);
    expect(aliceSub).toHaveBeenCalled();
    const initialResults = aliceSub.mock.calls.at(-1)[0];
    expect(initialResults).toHaveLength(LIMIT);
    const itemsToDelete = initialResults.map((e: any) => e.id).slice(0, 5);
    await alice.transact(async (tx) => {
      for (const id of itemsToDelete) {
        await tx.delete('test', id);
      }
    });
    await pause(200);
    const latestResults = aliceSub.mock.calls.at(-1)[0];
    expect(latestResults).toHaveLength(LIMIT);
    const resultIds = latestResults.map((e: any) => e.id);

    const deletedIds = ['test0', 'test1', 'test2', 'test3', 'test4'];
    expect(resultIds).not.toContain(deletedIds);
  });
});
