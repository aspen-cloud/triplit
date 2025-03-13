import { Server as TriplitServer } from '@triplit/server-core';
import {
  TriplitClient,
  ClientSchema,
  SessionAlreadyActiveError,
  TokenExpiredError,
  SessionRolesMismatchError,
  NoActiveSessionError,
} from '@triplit/client';
import { describe, vi, it, expect } from 'vitest';
import {
  MemoryBTreeStorage,
  MemoryBTreeStorage as MemoryStorage,
} from '@triplit/db/storage/memory-btree';
import { genToArr } from '@triplit/db';
import { pause } from '../utils/async.js';
import {
  NOT_SERVICE_KEY,
  SERVICE_KEY,
  createTestClient,
  spyMessages,
  throwOnError,
} from '../utils/client.js';
import * as Jose from 'jose';
import {
  DB,
  ServerEntityStore,
  Models,
  Roles,
  Schema as S,
  or,
  hashQuery,
} from '@triplit/db';

describe('TestTransport', () => {
  it('can sync an insert on one client to another client', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });
    const callback = vi.fn();
    bob.subscribe(bob.query('test'), callback);
    await pause();
    await alice.insert('test', { id: '1', name: 'alice' });
    await pause();
    expect(callback).toHaveBeenCalledTimes(2);
    // local result (empty)
    expect(callback.mock.calls[0][0]).toHaveLength(0);
    // first server result (empty)
    // second server result (with alice's insert)
    expect(callback.mock.calls[1][0]).toHaveLength(1);
  });
});

async function clientSchemaAttributes<M extends Models<M> = Models>(
  client: TriplitClient<M>
) {
  return (await client.getSchema())?.collections.students.schema.properties;
}
// TODO: won't work because schema syncing not implemented
describe.skip('schema syncing', () => {
  it('can sync a schema if the client sending updates has a service token and enables the option ', async () => {
    const schema = {
      students: { schema: S.Schema({ id: S.Id(), name: S.String() }) },
    };
    const server = new TriplitServer(
      new DB({
        schema: { collections: schema },
      })
    );
    const alice = createTestClient(server, {
      clientId: 'alice',
      schema,
      syncSchema: true,
      token: SERVICE_KEY,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
        .Id('_schema'),
      () => {}
    );
    bob.subscribe(
      bob
        .query(
          // @ts-expect-error - metadata not in schema
          '_metadata'
        )
        .Id('_schema'),
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
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
      syncSchema: false,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
        .Id('_schema'),
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
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
      syncSchema: true,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
        .Id('_schema'),
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
          }),
          relationships: {
            classes: S.RelationMany('classes', {
              where: [['department_id', '=', '$id']],
            }),
          },
        },
        classes: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            level: S.Number(),
            building: S.String(),
            department_id: S.String(),
          }),
          relationships: {
            department: S.RelationOne('departments', {
              where: [['id', '=', '$department_id']],
            }),
          },
        },
      },
    };
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });
    const query = bob
      .query('departments')
      .Where([['classes.building', '=', 'Voter']]);
    const bobCallbackSpy = vi.fn();
    bob.subscribe(query, bobCallbackSpy);
    await pause();

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
      // console.error(e);
    }
    expect(await alice.fetch(query)).toHaveLength(1);

    // accounts for throttling on ivm
    await pause(40);
    expect(bobCallbackSpy).toHaveBeenCalledTimes(2);
    expect(bobCallbackSpy.mock.calls[0][0]).toHaveLength(0);
    expect(bobCallbackSpy.mock.lastCall[0]).toHaveLength(1);
  });
});

describe('Conflicts', () => {
  it('can merge conflicts', async () => {
    const server = new TriplitServer(new DB({}), undefined);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });
    const charlie = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'charlie',
    });
    const query = bob.query('rappers');

    const aliceCallbackSpy = vi.fn();
    const bobCallbackSpy = vi.fn();
    const charlieCallbackSpy = vi.fn();

    alice.subscribe(query, aliceCallbackSpy);
    bob.subscribe(query, bobCallbackSpy);
    charlie.subscribe(query, charlieCallbackSpy);
    await pause();

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
        }),
        relationships: {
          classes: S.RelationMany('classes', {
            where: [['department_id', '=', '$id']],
          }),
        },
      },
      classes: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          level: S.Number(),
          building: S.String(),
          department_id: S.String(),
        }),
        relationships: {
          department: S.RelationOne('departments', {
            where: [['id', '=', '$department_id']],
          }),
        },
      },
    },
  };
  // FLAKY
  it.skip('can get the remote status in a subscription', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = alice
      .query('departments')
      .Where([['classes.building', '=', 'Voter']]);
    try {
      await alice.insert('departments', { name: 'Mathematics', id: 'math' });
      await alice.insert('classes', {
        name: 'Math 101',
        level: 101,
        building: 'Voter',
        department_id: 'math',
      });
    } catch (e: any) {
      // console.error(e);
    }
    // expect(await alice.fetch(query)).toHaveLength(1);

    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });
    const bobQuery = bob
      .query('departments')
      .Where([['classes.building', '=', 'Voter']]);
    const callback = vi.fn();
    bob.subscribe(bobQuery, callback);
    await pause();
    // once local, once remote, and then once remote again for the hack to ensure the remote status is updated
    expect(callback).toHaveBeenCalledTimes(2);
    const firstCallArgs = callback.mock.calls[0];
    expect(firstCallArgs[0]).toHaveLength(0);
    expect(firstCallArgs[1]).toHaveProperty('hasRemoteFulfilled', false);
    const secondCallArgs = callback.mock.calls[1];
    expect(secondCallArgs[0]).toHaveLength(1);
    expect(secondCallArgs[1]).toHaveProperty('hasRemoteFulfilled', true);
  });

  it('it does not update if the server returns an empty result', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const client = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = client
      .query('departments')
      .Where([['classes.building', '=', 'Voter']]);
    expect(await client.fetch(query)).toHaveLength(0);

    const callback = vi.fn();
    client.subscribe(query, callback);
    await pause(100);
    expect(callback).toHaveBeenCalledTimes(1);
    const firstCallArgs = callback.mock.calls[0];
    expect(firstCallArgs[0]).toHaveLength(0);
  });
});

const client = new TriplitClient();
const baseQuery = client.query('test');
describe('deletes', () => {
  it.each([
    [baseQuery.Where('name', 'like', '%bob%'), ['bob2']],
    [baseQuery.Order('name', 'DESC'), ['bob2', 'alice2']],
    // TODO: get limit working
    // [baseQuery.Order('name', 'ASC').Limit(1), ['alice2']],
  ])('%o', async (query, results) => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });

    // set up data to delete
    await alice.insert('test', { id: 'alice1', name: 'alice1' });
    await alice.insert('test', { id: 'alice2', name: 'alice2' });
    await bob.insert('test', { id: 'bob1', name: 'bob1' });
    await bob.insert('test', { id: 'bob2', name: 'bob2' });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();

    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);
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
    const alice = createTestClient(server, {
      clientId: 'alice',
      token: NOT_SERVICE_KEY,
    });
    const bob = createTestClient(server, {
      clientId: 'bob',
      token: NOT_SERVICE_KEY,
    });
    // set up a subscription for bob
    const bobSub = vi.fn();
    const aliceSub = vi.fn();
    const query = bob.query('test').Where('name', '=', 'george');
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
  // TODO: IVM does not support includes yet
  it('Can sync related deletes', async () => {
    const schema = {
      collections: S.Collections({
        test: {
          schema: S.Schema({
            id: S.Id(),
            related_id: S.String(),
          }),
          relationships: {
            related: S.RelationById('related', '$1.related_id'),
          },
        },
        related: {
          schema: S.Schema({ id: S.Id() }),
        },
      }),
    };
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
    alice.subscribe(alice.query('test').Include('related'), aliceSub);
    bob.subscribe(bob.query('test').Include('related'), bobSub);
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').related
    ).toStrictEqual({ id: 'related1' });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').related
    ).toStrictEqual({ id: 'related1' });
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
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });

    // insert data
    await alice.insert('test', { id: 'alice1', data: [1, 2, 3] });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test'), aliceSub);
    bob.subscribe(bob.query('test'), bobSub);
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
    // TODO: deletes just set to null under the hood
    await alice.update('test', 'alice1', (entity) => {
      delete entity.data;
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toBeNull();
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1').data
    ).toBeNull();
  });
});

describe('record syncing', () => {
  it('can sync record deletes', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });
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
    alice.subscribe(alice.query('test'), aliceSub);
    bob.subscribe(bob.query('test'), bobSub);
    await pause();

    await alice.update('test', 'alice1', (entity) => {
      delete entity.data;
    });
    await pause();
    expect(
      aliceSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
      data: null,
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
      data: null,
    });
  });

  it('can sync record re-assignments', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });
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
    alice.subscribe(alice.query('test'), aliceSub);
    bob.subscribe(bob.query('test'), bobSub);
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
      data: {
        record: 'reassignment',
        firstName: null,
        lastName: null,
        address: null,
      },
      assignToValue: 10,
      assignToNull: null,
    });
    expect(
      bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'alice1')
    ).toEqual({
      id: 'alice1',
      data: {
        record: 'reassignment',
        firstName: null,
        lastName: null,
        address: null,
      },
      assignToValue: 10,
      assignToNull: null,
    });
  });
});

describe('Server API', () => {
  it('can sync an insert on one client to another client', async () => {
    const server = new TriplitServer(new DB({}));
    const sesh = server.createSession({
      'x-triplit-token-type': 'secret',
    });
    const bob = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'bob',
    });
    const callback = vi.fn();
    bob.subscribe(bob.query('test'), callback);
    await pause();
    const entity = { id: 'test-user', name: 'alice' };
    await sesh.insert('test', entity);
    await pause();
    // once for the initial optimistic, once for the empty server response,
    // once for when the server does the insert
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.lastCall?.[0][0]).toMatchObject(entity);
  });
});

describe('Sync situations', () => {
  describe('set and delete an attribute in the same transaction', () => {
    it('can perform delete -> set in the same transaction over the network', async () => {
      const serverDB = new DB({ entityStore: new ServerEntityStore() });
      await serverDB.insert('test', { id: 'test1', name: 'test1' });
      const server = new TriplitServer(serverDB);
      const alice = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'alice',
      });
      const bob = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'bob',
      });

      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('test'), aliceSub);
      bob.subscribe(bob.query('test'), bobSub);
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
      const serverDB = new DB({ entityStore: new ServerEntityStore() });
      await serverDB.insert('test', { id: 'test1' });
      const server = new TriplitServer(serverDB);
      const alice = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'alice',
      });
      const bob = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'bob',
      });

      // set up subscriptions
      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('test'), aliceSub);
      bob.subscribe(bob.query('test'), bobSub);
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
      ).toBeNull();
      expect(
        bobSub.mock.calls.at(-1)[0].find((e: any) => e.id === 'test1').name
      ).toBeNull();
    });
  });

  // TODO: look into the validity of this test...seeing mixed results depending on pause time
  // TODO: subscriptions DO overfire because the server is sending clients changes they already have
  it('subscriptions dont overfire', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const aliceSub = vi.fn();
    alice.subscribe(alice.query('test'), aliceSub);
    await pause();
    expect(aliceSub.mock.calls.length).toBe(1); // empty local result
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    expect(aliceSub.mock.calls.length).toBe(2); // ...prev, optimistic insert

    await alice.update('test', 'test1', (entity) => {
      entity.name = 'updated';
    });
    await pause();
    expect(aliceSub.mock.calls.length).toBe(3); // ...prev, optimistic update

    await alice.delete('test', 'test1');
    await pause();
    expect(aliceSub.mock.calls.length).toBe(5); // ...prev, optimistic delete, echo'd server delete which isn't getting filtered correctly on the client
  });

  it('data is synced properly when query results have been evicted while client is offline', async () => {
    const serverDB = new DB({ entityStore: new ServerEntityStore() });
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
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });
    const bobMessages = spyMessages(bob);
    const query = bob.query('cities').Select(['id']).Where('state', '=', 'CA');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    // bob.onSyncMessageReceived((msg) => {
    //   console.dir(msg, { depth: null });
    // });
    // sync data for alice and bob
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);
    await pause(20);

    // Disconnect bob
    bob.syncEngine.disconnect();
    await pause(20);

    // Alice, online, makes an update removing 'sf' from the query
    await alice.update('cities', 'sf', (entity) => {
      entity.state = 'FL';
    });
    await pause(20);

    // Bob connects and syncs query
    bob.syncEngine.connect();
    await pause(20);
    {
      // bob properly removes sf after reconnecting
      const bobLatest = bobSub.mock.calls.at(-1)[0];
      expect(bobLatest.length).toBe(1);
      expect(bobLatest.find((e: any) => e.id === 'la')).toBeDefined();
      expect(bobLatest.find((e: any) => e.id === 'sf')).toBeUndefined();
    }

    bob.syncEngine.disconnect();
    await pause(20);

    // Alice, online, makes an update removing 'la' from the query
    await alice.delete('cities', 'la');
    await pause(20);

    // Bob connects and syncs query
    bob.syncEngine.connect();
    await pause(20);
    // bob properly removes la after reconnecting
    {
      const bobLatest = bobSub.mock.calls.at(-1)[0];
      expect(bobLatest.length).toBe(0);
    }
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
    const db = new DB({ entityStore: new ServerEntityStore(), schema });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
    await pause(40);
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test'), aliceSub);
    bob.subscribe(bob.query('test'), bobSub);
    await pause(40);
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
    await pause(40);
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
      optional: null,
      record: null,
      set: null,
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
      optional: null,
      record: null,
      set: null,
    });
  });

  it('can order by related data', async () => {
    const schema = {
      collections: {
        main: {
          schema: S.Schema({
            id: S.Id(),
            relationId: S.String(),
          }),
          relationships: {
            related: S.RelationById('relations', '$1.relationId'),
          },
        },
        relations: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
        },
      },
    };
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    await server.db.insert('relations', { id: '1', name: 'c' });
    await server.db.insert('relations', { id: '2', name: 'b' });
    await server.db.insert('relations', { id: '3', name: 'd' });
    await server.db.insert('relations', { id: '4', name: 'a' });
    await server.db.insert('main', { id: '1', relationId: '1' });
    await server.db.insert('main', { id: '2', relationId: '2' });
    await server.db.insert('main', { id: '3', relationId: '3' });
    await server.db.insert('main', { id: '4', relationId: '4' });

    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });

    const query = alice.query('main').Order([
      ['related.name', 'ASC'],
      ['id', 'ASC'],
    ]);
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);

    await pause(20);

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

    await pause(60);

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

  // TODO: currently overfiring because of issue discussed above (server sends clients changes they already have)
  describe('background syncing', () => {
    it('can subscribe to a bulk query in the background and use local subscriptions for data', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore() })
      );
      await server.db.transact(async (tx) => {
        await tx.insert('students', { id: '1', name: 'Alice', dorm: 'A' });
        await tx.insert('students', { id: '2', name: 'Bob', dorm: 'B' });
        await tx.insert('students', { id: '3', name: 'Charlie', dorm: 'A' });
        await tx.insert('students', { id: '4', name: 'David', dorm: 'B' });
        await tx.insert('students', { id: '5', name: 'Eve', dorm: 'A' });
      });

      const alice = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'alice',
      });

      const remoteQuery = alice.query('students');
      const localQueryA = alice.query('students').Where('dorm', '=', 'A');
      const localQueryB = alice.query('students').Where('dorm', '=', 'B');
      const subA = vi.fn();
      const subB = vi.fn();

      alice.subscribe(localQueryA, subA, throwOnError, { localOnly: true });
      alice.subscribe(localQueryB, subB, throwOnError, { localOnly: true });

      await pause();

      // empty local result for both subs
      expect(subA.mock.calls.at(-1)[0]).toHaveLength(0);
      expect(subA).toHaveBeenCalledTimes(1);
      expect(subB.mock.calls.at(-1)[0]).toHaveLength(0);
      expect(subB).toHaveBeenCalledTimes(1);

      // triggers sync
      alice.subscribeBackground(remoteQuery, { onError: throwOnError });

      await pause();

      // remote data is synced, subs are updated
      expect(subA.mock.calls.at(-1)[0]).toHaveLength(3);
      expect(subA).toHaveBeenCalledTimes(2);
      expect(subB.mock.calls.at(-1)[0]).toHaveLength(2);
      expect(subB).toHaveBeenCalledTimes(2);

      await alice.insert('students', { id: '6', name: 'Frank', dorm: 'A' });

      // inserts, getting an optimistic update
      // the relevant subscription updates for each
      // the other subscription does not update
      await pause();
      expect(subA.mock.calls.at(-1)[0]).toHaveLength(4);
      expect(subA).toHaveBeenCalledTimes(3);
      expect(subB.mock.calls.at(-1)[0]).toHaveLength(2);
      expect(subB).toHaveBeenCalledTimes(2);
    });
  });

  it('fires onFulfileld callback when a query is fulfilled', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    await server.db.insert('test', { id: 'test1', name: 'test1' });
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const query = alice.query('test');

    {
      const fetchResult = await alice.fetch(query, { policy: 'local-only' });
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
      const fetchResult = await alice.fetch(query, { policy: 'local-only' });
      expect(fetchResult).toHaveLength(1);
    }
  });
});

describe('sync status', () => {
  // WARNING: flaky test when run in parallel
  it('subscriptions are scoped via syncStatus', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      autoConnect: true,
    });
    const aliceSubPending = vi.fn();
    const aliceSubConfirmed = vi.fn();
    const aliceSubAll = vi.fn();
    alice.subscribe(alice.query('test'), aliceSubPending, throwOnError, {
      syncStatus: 'pending',
    });
    alice.subscribe(alice.query('test'), aliceSubConfirmed, throwOnError, {
      syncStatus: 'confirmed',
    });
    alice.subscribe(alice.query('test'), aliceSubAll, throwOnError, {
      syncStatus: 'all',
    });
    await pause(60);
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause(60);
    // each should have an initial call with the empty db
    // then a call with the optimistic insert (depending on the filter)
    // then a call with the server response and the outbox is cleared
    expect(aliceSubPending.mock.calls.length).toBe(3);
    expect(aliceSubConfirmed.mock.calls.length).toBe(3);
    expect(aliceSubAll.mock.calls.length).toBe(3);
    expect(aliceSubPending.mock.calls.map((c) => c[0])).toStrictEqual([
      [],
      [{ id: 'test1', name: 'test1' }],
      [],
    ]);
    expect(aliceSubConfirmed.mock.calls.map((c) => c[0])).toStrictEqual([
      [],
      [],
      [{ id: 'test1', name: 'test1' }],
    ]);
    expect(aliceSubAll.mock.calls.map((c) => c[0])).toStrictEqual([
      [],
      [{ id: 'test1', name: 'test1' }],
      [{ id: 'test1', name: 'test1' }],
    ]);
    aliceSubAll.mockClear();
    aliceSubConfirmed.mockClear();
    aliceSubPending.mockClear();
    await pause(60);
    await alice.update('test', 'test1', (entity) => {
      entity.name = 'updated';
    });
    await pause(60);
    expect(aliceSubPending.mock.calls.length).toBe(2);
    expect(aliceSubConfirmed.mock.calls.length).toBe(2);
    expect(aliceSubAll.mock.calls.length).toBe(2);
    expect(aliceSubPending.mock.calls.map((c) => c[0])).toStrictEqual([
      [{ id: 'test1', name: 'updated' }],
      [],
    ]);
    expect(aliceSubConfirmed.mock.calls.map((c) => c[0])).toStrictEqual([
      [],
      [{ id: 'test1', name: 'updated' }],
    ]);
    expect(aliceSubAll.mock.calls.map((c) => c[0])).toStrictEqual([
      [{ id: 'test1', name: 'updated' }],
      [{ id: 'test1', name: 'updated' }],
    ]);
  });
  it.todo('fetch is scoped via syncStatus', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      autoConnect: false,
    });
    await alice.insert('test', { id: 'test1', name: 'test1' });
    expect(
      await alice.fetch(alice.query('test'), { syncStatus: 'pending' })
    ).toStrictEqual([{ id: 'test1', name: 'test1' }]);
    expect(
      await alice.fetch(alice.query('test'), { syncStatus: 'confirmed' })
    ).toStrictEqual([]);
    expect(
      await alice.fetch(alice.query('test'), { syncStatus: 'all' })
    ).toStrictEqual([{ id: 'test1', name: 'test1' }]);
    await alice.connect();
    await pause();
    expect(
      await alice.fetch(alice.query('test'), { syncStatus: 'confirmed' })
    ).toStrictEqual([{ id: 'test1', name: 'test1' }]);
    expect(
      await alice.fetch(alice.query('test'), { syncStatus: 'all' })
    ).toStrictEqual([{ id: 'test1', name: 'test1' }]);
    expect(
      await alice.fetch(alice.query('test'), { syncStatus: 'pending' })
    ).toStrictEqual([]);
  });
});

// TODO: client needs to send query results its already seen
describe('offline capabilities', () => {
  it('can sync updates and deletes on a non-relational query after being offline', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('test'), aliceSub);
    bob.subscribe(bob.query('test'), bobSub);
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
  const schema = {
    collections: {
      departments: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
        }),
        relationships: {
          classes: S.RelationMany('classes', {
            where: [['department_id', '=', '$id']],
          }),
        },
      },
      classes: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          level: S.Number(),
          building: S.String(),
          department_id: S.String(),
        }),
        relationships: {
          department: S.RelationById('departments', '$department_id'),
        },
      },
    },
  };
  it('can sync inserts, updates and deletes on an inclusion after being offline', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });

    const mathDepartment = {
      id: 'math',
      name: 'Mathematics',
    };
    await alice.insert('departments', mathDepartment);

    // set up subscriptions
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(alice.query('departments').Include('classes'), aliceSub);

    bob.subscribe(bob.query('departments').Include('classes'), bobSub);
    await pause();
    expect(aliceSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [],
    });
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [],
    });
    bob.disconnect();
    const math101 = {
      id: 'math1',
      name: 'Math 101',
      level: 101,
      building: 'Voter',
      department_id: 'math',
    };
    await alice.insert('classes', math101);
    await pause(60);
    expect(aliceSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [math101],
    });
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [],
    });
    await bob.connect();
    await pause(60);
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [math101],
    });
    bob.disconnect();
    await alice.update('classes', 'math1', (entity) => {
      entity.name = 'Math 101 - Calculus';
    });
    await pause(60);
    expect(aliceSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [
        {
          ...math101,
          name: 'Math 101 - Calculus',
        },
      ],
    });
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [math101],
    });
    await bob.connect();
    await pause(60);
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [
        {
          ...math101,
          name: 'Math 101 - Calculus',
        },
      ],
    });
    bob.disconnect();
    await alice.delete('classes', 'math1');
    await pause(60);
    expect(aliceSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [],
    });
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [
        {
          ...math101,
          name: 'Math 101 - Calculus',
        },
      ],
    });
    await bob.connect();
    await pause(60);
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual({
      ...mathDepartment,
      classes: [],
    });
  });
  it('can sync inserts, updates and deletes on a query with a relational filter after being offline', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );

    const alice = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });
    const mathDepartment = {
      id: 'math',
      name: 'Mathematics',
    };
    const math101 = {
      id: 'math1',
      name: 'Math 101',
      level: 101,
      building: 'Voter',
      department_id: 'math',
    };
    await alice.insert('departments', mathDepartment);
    await alice.insert('classes', math101);
    const query = alice
      .query('classes')
      .Where('department.name', '=', 'Mathematics');
    // set up subscriptions
    const bobSub = vi.fn();
    bob.subscribe(query, bobSub);
    await pause();
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual(math101);
    bob.disconnect();
    await pause(40);
    await alice.update('departments', 'math', (entity) => {
      entity.name = 'Mathematics and Statistics';
    });
    await pause(40);
    await bob.connect();
    await pause(40);
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual(undefined);
    bob.disconnect();
    await alice.update('departments', 'math', (entity) => {
      entity.name = 'Mathematics';
    });
    await pause(40);
    await bob.connect();
    await pause(40);
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual(math101);
    bob.disconnect();
    await alice.delete('departments', 'math');
    await pause(40);
    await bob.connect();
    await pause(40);
    expect(bobSub.mock.lastCall?.[0][0]).toStrictEqual(undefined);
  });
  // Initial IVM sync does not yet send the required related data for ordering
  it('can sync updates and deletes to related data used in an order clause after being offline', async () => {
    const schema = {
      collections: {
        main: {
          schema: S.Schema({
            id: S.Id(),
            relationId: S.String(),
          }),
          relationships: {
            related: S.RelationById('relations', '$relationId'),
          },
        },
        relations: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
        },
      },
    };
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    await server.db.insert('relations', { id: '1', name: 'c' });
    await server.db.insert('relations', { id: '2', name: 'b' });
    await server.db.insert('relations', { id: '3', name: 'd' });
    await server.db.insert('relations', { id: '4', name: 'a' });
    await server.db.insert('main', { id: '1', relationId: '1' });
    await server.db.insert('main', { id: '2', relationId: '2' });
    await server.db.insert('main', { id: '3', relationId: '3' });
    await server.db.insert('main', { id: '4', relationId: '4' });

    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });
    const query = alice.query('main').Order([['related.name', 'ASC']]);
    // set up subscriptions
    const bobSub = vi.fn();
    bob.subscribe(query, bobSub);
    await pause(40);
    expect(bobSub.mock.lastCall?.[0].map((e: any) => e.id)).toStrictEqual([
      '4',
      '2',
      '1',
      '3',
    ]);
    bob.disconnect();
    await pause(40);
    await alice.update('relations', '1', { name: 'z' });
    await pause(40);
    await bob.connect();
    await pause(40);
    expect(bobSub.mock.lastCall?.[0].map((e: any) => e.id)).toStrictEqual([
      '4',
      '2',
      '3',
      '1',
    ]);
  });
});

// TODO: IVM does not yet support include
describe('subquery syncing', () => {
  const schema = {
    collections: {
      departments: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
        }),
        relationships: {
          classes: S.RelationMany('classes', {
            where: [['department_id', '=', '$id']],
          }),
        },
      },
      classes: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          level: S.Number(),
          building: S.String(),
          department_id: S.String(),
        }),
        relationships: {
          department: S.RelationById('departments', '$department_id'),
        },
      },
    },
  };
  it('can sync the entities in a subquery after inserts', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: NOT_SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: NOT_SERVICE_KEY,
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
    const classesQuery = alice.query('departments').Include('classes');
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
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
    const classesQuery = alice.query('departments').Include('classes');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(classesQuery, aliceSub);
    bob.subscribe(classesQuery, bobSub);
    await pause();
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
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
    const classesQuery = alice.query('departments').Include('classes');
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
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
    const classesQuery = alice.query('classes').Include('department');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(classesQuery, aliceSub);
    bob.subscribe(classesQuery, bobSub);
    await pause();
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
    // const messages = spyMessages(alice);
    // alice.onSyncMessageReceived((msg) => {
    //   console.dir(msg, { depth: null });
    // });
    bob.update('departments', 'math', (entity) => {
      entity.name = 'Math';
    });
    await pause(200);
    // console.dir(aliceSub.mock.calls, { depth: 10 });
    // console.log(messages);
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
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema: schema.collections,
    });

    await alice.insert('test', { id: 'test1', data: new Set(['a', 'b', 'c']) });

    const query = alice.query('test').Where('data', '=', 'c');
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
    const serverDb = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    const server = new TriplitServer(serverDb);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
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
      .Order([['number', 'DESC']])
      .Limit(2);
    const sub = vi.fn();
    alice.subscribe(query, sub);
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
      new DB({ entityStore: new ServerEntityStore(), schema })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
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
        .Order(['created_at', 'DESC'])
        .Limit(5)
        .After([datesInASCOrder[5][1]]),
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
    // insert new todo that should be in the subscription window
    const NEW_ID = 'inserted';
    const DATE = '2021-01-05T00:00:00.001Z';
    await alice.insert('todos', {
      text: 'todo',
      created_at: new Date(DATE),
      id: NEW_ID,
    });
    await pause(60);
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
    await pause(60);
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect([...bobSub.mock.calls.at(-1)[0].map((e: any) => e.id)]).toEqual(
      datesInASCOrder
        .slice()
        .reverse()
        .slice(5, 10)
        .map(([id]) => id)
    );
    // insert a new todo that IS NOT in the subscription window
    await alice.insert('todos', {
      text: 'todo',
      created_at: new Date('2021-01-11T00:00:00.000Z'),
      id: 'new',
    });
    await pause(60);
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect([...bobSub.mock.calls.at(-1)[0].map((e: any) => e.id)]).toEqual(
      datesInASCOrder
        .slice()
        .reverse()
        .slice(5, 10)
        .map(([id]) => id)
    );
    // update a todo in the subscription window
    await alice.update('todos', '0', (entity) => {
      entity.text = 'updated';
    });
    await pause(60);
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect(bobSub.mock.lastCall?.[0].find((e: any) => e.id === '0').text).toBe(
      'updated'
    );
    // update a todo that is NOT in the subscription window
    await alice.update('todos', '9', (entity) => {
      entity.text = 'updated';
    });
    await pause(60);
    expect(bobSub.mock.calls.at(-1)[0]).toHaveLength(5);
    expect(bobSub.mock.lastCall?.[0].find((e: any) => e.id === '9')).toBe(
      undefined
    );
  });
});

describe('stateful query syncing', () => {
  it('server doesnt send entity data that has already been sent for a query', async () => {
    const serverDB = new DB({ entityStore: new ServerEntityStore() });
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
    const client = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    {
      const syncMessageCallback = vi.fn();
      client.syncEngine.onSyncMessageReceived(syncMessageCallback);
      const unsub = client.subscribe(
        client.query('cities').Where('state', '=', 'CA'),
        () => {}
      );
      await pause(40);
      expect(syncMessageCallback).toHaveBeenCalled();
      const changesMessages = syncMessageCallback.mock.calls.filter(
        ([{ type }]) => type === 'ENTITY_DATA'
      );
      expect(changesMessages).toHaveLength(1);
      expect(
        changesMessages[0][0].payload.changes.json.cities.sets.length
      ).toBe(2);
      unsub();
    }
    // Resubscribe to the same query and check no triples returned
    {
      const syncMessageCallback = vi.fn();
      client.syncEngine.onSyncMessageReceived(syncMessageCallback);
      await pause();
      const unsub = client.subscribe(
        client.query('cities').Where('state', '=', 'CA'),
        () => {}
      );
      await pause();
      expect(syncMessageCallback).toHaveBeenCalled();
      const changesMessages = syncMessageCallback.mock.calls.filter(
        ([{ type }]) => type === 'ENTITY_DATA'
      );
      expect(changesMessages).toHaveLength(1);
      expect(
        changesMessages[0][0].payload.changes.json.cities.sets.length
      ).toBe(0);
      unsub();
    }
  });
  it('should handle issuing two different queries on the same collection with different inclusions', async () => {
    const schema = {
      branches: {
        schema: S.Schema({
          id: S.Id(),
        }),
        relationships: {
          runs: S.RelationMany('runs', {
            where: [['branch_name', '=', '$id']],
          }),
          latest_run: S.RelationOne('runs', {
            where: [['branch_name', '=', '$id']],
            order: [['created_at', 'DESC']],
          }),
        },
      },
      runs: {
        schema: S.Schema({
          id: S.Id(),
          created_at: S.Date({ default: S.Default.now() }),
          benchmark: S.String(),
          branch_name: S.String(),
          commit_hash: S.String(),
          commit_message: S.String(),
          results: S.Record({
            memory_avg: S.Number(),
            memory_max: S.Number(),
            runtime_avg: S.Number(),
            runtime_max: S.Number(),
            run_metadata: S.Optional(S.String()),
          }),
        }),
        relationships: {
          branch: S.RelationById('branches', '$branch_name'),
        },
      },
      benchmarks: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          description: S.Optional(S.String()),
          created_at: S.Date({ default: S.Default.now() }),
        }),
        relationships: {
          runs: S.RelationMany('runs', { where: [['benchmark', '=', '$id']] }),
          latest_run: S.RelationOne('runs', {
            where: [['benchmark', '=', '$id']],
            order: [['created_at', 'DESC']],
          }),
        },
      },
    };

    const db = new DB({
      schema: { collections: schema },
    });

    const BRANCHES = [
      // Multiple runs on some benchmarks
      { id: 'master' },
      // Multiple runs on some benchamrks
      { id: 'dev' },
      // No runs
      { id: 'feature-1' },
    ];
    const BENCHMARKS = [
      { id: 'benchmark-1', name: 'benchmark-1' },
      { id: 'benchmark-2', name: 'benchmark-2' },
      { id: 'benchmark-3', name: 'benchmark-3' },
    ];
    const RUNS = [
      {
        id: 'run-1',
        benchmark: 'benchmark-1',
        branch_name: 'master',
        commit_hash: 'hash-1',
        commit_message: 'commit message 1',
        created_at: new Date('2023-01-01'),
        results: {
          memory_avg: 100,
          memory_max: 200,
          runtime_avg: 10,
          runtime_max: 20,
        },
      },
      {
        id: 'run-2',
        benchmark: 'benchmark-1',
        branch_name: 'dev',
        commit_hash: 'hash-2',
        commit_message: 'commit message 2',
        created_at: new Date('2023-01-02'),
        results: {
          memory_avg: 100,
          memory_max: 200,
          runtime_avg: 10,
          runtime_max: 20,
        },
      },
      {
        id: 'run-3',
        benchmark: 'benchmark-2',
        branch_name: 'master',
        commit_hash: 'hash-3',
        commit_message: 'commit message 3',
        created_at: new Date('2023-01-02'),
        results: {
          memory_avg: 100,
          memory_max: 200,
          runtime_avg: 10,
          runtime_max: 20,
        },
      },
      {
        id: 'run-4',
        benchmark: 'benchmark-2',
        branch_name: 'dev',
        commit_hash: 'hash-4',
        commit_message: 'commit message 4',
        created_at: new Date('2023-01-03'),
        results: {
          memory_avg: 100,
          memory_max: 200,
          runtime_avg: 10,
          runtime_max: 20,
        },
      },
    ];

    await db.transact(async (tx) => {
      for (const branch of BRANCHES) {
        await tx.insert('branches', branch);
      }
      for (const benchmark of BENCHMARKS) {
        await tx.insert('benchmarks', benchmark);
      }
      for (const run of RUNS) {
        await tx.insert('runs', run);
      }
    });

    const server = new TriplitServer(db);

    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });

    // alice.onSyncMessageReceived((msg) => {
    //   console.dir(msg, { depth: null });
    // });

    const query1 = alice
      .query('benchmarks')
      .Where('id', '=', 'benchmark-1')
      .Include('latest_run');
    const query2 = alice
      .query('benchmarks')
      .Where('id', '=', 'benchmark-1')
      .Include('runs');
    const query1Spy = vi.fn();
    alice.subscribe(query1, query1Spy);
    await pause(50);
    expect(query1Spy.mock.lastCall?.[0]).toEqual([
      {
        id: 'benchmark-1',
        name: 'benchmark-1',
        created_at: expect.any(Date),
        latest_run: {
          id: 'run-2',
          benchmark: 'benchmark-1',
          branch_name: 'dev',
          commit_hash: 'hash-2',
          commit_message: 'commit message 2',
          created_at: new Date('2023-01-02'),
          results: {
            memory_avg: 100,
            memory_max: 200,
            runtime_avg: 10,
            runtime_max: 20,
          },
        },
      },
    ]);
    const query2Spy = vi.fn();
    alice.subscribe(query2, query2Spy);
    await pause(50);
    expect(query2Spy.mock.lastCall?.[0]).toEqual([
      {
        id: 'benchmark-1',
        name: 'benchmark-1',
        created_at: expect.any(Date),
        runs: [
          {
            id: 'run-1',
            benchmark: 'benchmark-1',
            branch_name: 'master',
            commit_hash: 'hash-1',
            commit_message: 'commit message 1',
            created_at: new Date('2023-01-01'),
            results: {
              memory_avg: 100,
              memory_max: 200,
              runtime_avg: 10,
              runtime_max: 20,
            },
          },
          {
            id: 'run-2',
            benchmark: 'benchmark-1',
            branch_name: 'dev',
            commit_hash: 'hash-2',
            commit_message: 'commit message 2',
            created_at: new Date('2023-01-02'),
            results: {
              memory_avg: 100,
              memory_max: 200,
              runtime_avg: 10,
              runtime_max: 20,
            },
          },
        ],
      },
    ]);
  });
});

it.skip('Updates dont oversend triples', async () => {
  const server = new TriplitServer(
    new DB({ entityStore: new ServerEntityStore() })
  );
  const alice = createTestClient(server, {
    token: SERVICE_KEY,
    clientId: 'alice',
  });
  const bob = createTestClient(server, {
    token: SERVICE_KEY,
    clientId: 'bob',
  });
  await alice.insert('test', { id: 'test1', name: 'test1' });
  await pause();
  // // setup subscriptions
  alice.subscribe(alice.query('test'), () => {});
  bob.subscribe(bob.query('test'), () => {});
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
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
    });

    const query = alice.query('test');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub);
    bob.subscribe(query, bobSub);

    await pause();
    await alice.insert('test', { id: 'test1', name: 'test1' });

    const aliceOutbox = alice.db.entityStore.doubleBuffer;
    const aliceCache = alice.db.entityStore.dataStore;
    const bobOutbox = bob.db.entityStore.doubleBuffer;
    const bobCache = bob.db.entityStore.dataStore;

    // Alice before sync
    {
      const outboxEntity = await aliceOutbox.getChangesForEntity(
        alice.db.kv,
        'test',
        'test1'
      );
      const cacheEntity = await aliceCache.getEntity(
        alice.db.kv,
        'test',
        'test1'
      );

      expect(outboxEntity).toBeDefined();
      expect(cacheEntity).toBeUndefined();
    }
    // Bob before sync
    {
      const outboxEntity = await bobOutbox.getChangesForEntity(
        bob.db.kv,
        'test',
        'test1'
      );
      const cacheEntity = await bobCache.getEntity(bob.db.kv, 'test', 'test1');

      expect(outboxEntity).toBeUndefined();
      expect(cacheEntity).toBeUndefined();
    }
    await pause();
    // Alice after sync
    {
      const outboxEntity = await aliceOutbox.getChangesForEntity(
        alice.db.kv,
        'test',
        'test1'
      );
      const cacheEntity = await aliceCache.getEntity(
        alice.db.kv,
        'test',
        'test1'
      );

      expect(outboxEntity).toBeUndefined();
      expect(cacheEntity).toBeDefined();
    }
    // Bob after sync
    {
      const outboxEntity = await bobOutbox.getChangesForEntity(
        bob.db.kv,
        'test',
        'test1'
      );
      const cacheEntity = await bobCache.getEntity(bob.db.kv, 'test', 'test1');

      expect(outboxEntity).toBeUndefined();
      expect(cacheEntity).toBeDefined();
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
        const server = new TriplitServer(
          new DB({ entityStore: new ServerEntityStore() })
        );
        const alice = createTestClient(server, {
          token: SERVICE_KEY,
          clientId: 'alice',
          autoConnect: false,
        });
        const query = alice.query('test');
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
        await pause(20);
      }
    );

    it('on socket disconnect, un-ACKed changes will be re-sent', async () => {
      // Setup data with a successful tx
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore() })
      );
      const alice = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'alice',
        autoConnect: false,
      });
      const query = alice.query('test');
      const { txId: txId1 } = await alice.insert('test', {
        id: 'test1',
        name: 'test1',
      });
      await pause();
      const syncMessageSpy = vi.fn();

      // Alice will send changes but disconnect before receiving an ACK
      {
        const unsubscribe = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'CHANGES') {
              unsubscribe();
              syncMessageSpy(message.payload);
              alice.syncEngine.disconnect();
            }
          }
        );
      }
      alice.syncEngine.connect();
      await pause();

      // Check
      expect(syncMessageSpy).toHaveBeenCalled();
      expect(syncMessageSpy.mock.lastCall[0].changes.json).toEqual({
        test: {
          sets: [['test1', { id: 'test1', name: 'test1' }]],
          deletes: [],
        },
      });
      syncMessageSpy.mockReset();

      // reconnect and flush outbox, changes should try to send again
      alice.syncEngine.connect();
      {
        const unsubscribe = alice.syncEngine.onSyncMessageSent(
          async (message) => {
            if (message.type === 'CHANGES') {
              unsubscribe();
              syncMessageSpy(message.payload);
            }
          }
        );
      }
      await pause(100);
      expect(syncMessageSpy).toHaveBeenCalled();
      expect(syncMessageSpy.mock.lastCall[0].changes.json).toEqual({
        test: {
          sets: [['test1', { id: 'test1', name: 'test1' }]],
          deletes: [],
        },
      });
    });
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
    collections: S.Collections({
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
        }),
        relationships: {
          group: S.RelationById('groupChats', '$groupId'),
        },
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
    }),
  };

  // signing key = "integration-tests"
  const ALICE_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoidG9kb3MiLCJpYXQiOjE2OTc0NzkwMjd9.5sgJA0olA18LreY8_XTGx4_CAnoDLy9tvJsgUqTI2JU';
  const BOB_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJib2IiLCJ4LXRyaXBsaXQtcHJvamVjdC1pZCI6InRvZG9zIiwiaWF0IjoxNjk3NDc5MDI3fQ.S9lOFgpUnUnZuX19bzxkEnyoPDQ4oscpWmwA_NkEW5g';

  describe('insert', async () => {
    it('restricts groupChat insertions', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore(), schema: SCHEMA })
      );
      const alice = createTestClient(server, {
        token: ALICE_TOKEN,
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, {
        token: BOB_TOKEN,
        clientId: 'bob',
        schema: SCHEMA.collections,
      });
      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('groupChats'), aliceSub);
      bob.subscribe(bob.query('groupChats'), bobSub);

      await pause();

      // Alice can insert a group chat where she is a member
      {
        await alice.insert('groupChats', {
          id: 'chat1',
          memberIds: new Set(['alice']),
          name: 'chat1',
          adminId: 'alice',
        });
        alice.onEntitySyncError('groupChats', 'chat1', throwOnError);
        await pause();
        expect(aliceSub).toHaveBeenCalled();
        expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
        expect(bobSub).toHaveBeenCalled();
        expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(0);
      }

      // Bob cannot insert a group chat where he is not a member
      {
        await bob.insert('groupChats', {
          id: 'chat2',
          memberIds: new Set(['alice']),
          name: 'chat2',
          adminId: 'alice',
        });
        const bobErrorSub = vi.fn();
        bob.onEntitySyncError('groupChats', 'chat2', bobErrorSub);
        await pause();
        expect(bobErrorSub).toHaveBeenCalled();
        expect(bobErrorSub.mock.lastCall[0].name).toBe('WritePermissionError');
      }
    });

    it('restricts message insertions', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore(), schema: SCHEMA })
      );
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
      const alice = createTestClient(server, {
        token: ALICE_TOKEN,
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, {
        token: BOB_TOKEN,
        clientId: 'bob',
        schema: SCHEMA.collections,
      });

      const aliceSub = vi.fn();
      const bobSub = vi.fn();
      alice.subscribe(alice.query('messages'), aliceSub);
      bob.subscribe(bob.query('messages'), bobSub);

      await pause();

      // Alice can insert a message in a group chat where she is a member
      {
        await alice.insert('messages', {
          id: 'msg1',
          groupId: 'chat1',
          authorId: 'alice',
          text: 'hello',
        });
        alice.onEntitySyncError('messages', 'msg1', throwOnError);
        await pause();

        // All group members get the messages in group
        expect(aliceSub).toHaveBeenCalled();
        expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
        expect(bobSub).toHaveBeenCalled();
        expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
      }

      const bobErrorSub = vi.fn();
      // Bob cannot insert a message as alice
      {
        await bob.insert('messages', {
          id: 'msg2',
          groupId: 'chat2',
          authorId: 'alice',
          text: 'hello',
        });
        bob.onEntitySyncError('messages', 'msg2', bobErrorSub);
        await pause();
        expect(bobErrorSub).toHaveBeenCalled();
        expect(bobErrorSub.mock.lastCall[0].name).toBe('WritePermissionError');
        bobErrorSub.mockClear();
      }

      // Bob cannot insert a message into a group he is not a member of
      {
        await bob.update('messages', 'msg2', (entity) => {
          entity.authorId = 'bob';
        });
        bob.onEntitySyncError('messages', 'msg4', bobErrorSub);
        await bob.insert('messages', {
          id: 'msg4',
          groupId: 'chat1',
          authorId: 'bob',
          text: 'hello',
        });
        await pause();
        expect(bobErrorSub).toHaveBeenCalled();
        expect(bobErrorSub.mock.lastCall[0].name).toBe('WritePermissionError');
      }
    });
  });

  describe('update', async () => {
    it('restricts groupChat updates', async () => {
      const serverDb = new DB({
        entityStore: new ServerEntityStore(),
        schema: SCHEMA,
      });
      const server = new TriplitServer(serverDb, undefined);
      const alice = createTestClient(server, {
        token: ALICE_TOKEN,
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, {
        token: BOB_TOKEN,
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
      alice.subscribe(alice.query('groupChats'), aliceSub);
      bob.subscribe(bob.query('groupChats'), bobSub);

      await pause();
      expect(aliceSub).toHaveBeenCalled();
      expect(aliceSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
      expect(bobSub).toHaveBeenCalled();
      expect(bobSub.mock.calls.at(-1)?.[0]).toHaveLength(1);
      const bobErrorSub = vi.fn();

      // Bob cannot update group chat because he is not the admin
      bob.onEntitySyncError('groupChats', 'chat1', bobErrorSub);
      await bob.update('groupChats', 'chat1', (entity) => {
        entity.name = 'updated';
      });
      await pause();
      expect(bobErrorSub).toHaveBeenCalled();
      expect(bobErrorSub.mock.lastCall[0].name).toBe('WritePermissionError');
    });

    it('restricts message updates', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore(), schema: SCHEMA })
      );
      const alice = createTestClient(server, {
        token: ALICE_TOKEN,
        clientId: 'alice',
        schema: SCHEMA.collections,
      });
      const bob = createTestClient(server, {
        token: BOB_TOKEN,
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
      alice.subscribe(alice.query('messages'), aliceSub);
      bob.subscribe(bob.query('messages'), bobSub);

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
        await alice.update('messages', 'msg1', (entity) => {
          entity.text = 'updated';
        });
        const errCallback = vi.fn();
        alice.onEntitySyncError('messages', 'msg1', errCallback);
        await pause();
        expect(errCallback).toHaveBeenCalled();
        expect(errCallback.mock.lastCall[0].name).toBe('WritePermissionError');
      }
      // Bob cannot update message because message updates are illegal
      {
        await bob.update('messages', 'msg1', (entity) => {
          entity.text = 'updated';
        });
        const errCallback = vi.fn();
        bob.onEntitySyncError('messages', 'msg1', errCallback);
        await pause();
        expect(errCallback).toHaveBeenCalled();
        expect(errCallback.mock.lastCall[0].name).toBe('WritePermissionError');
      }
    });
  });
});

describe('deduping subscriptions', () => {
  it('sends only one CONNECT_QUERY message for multiple subscriptions to the same query', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const query = alice.query('test');
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
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const query = alice.query('test');
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
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const query = alice.query('test');
    const sub1 = vi.fn();
    const sub2 = vi.fn();
    const onFulfilled = vi.fn();
    const unsub1 = alice.subscribe(query, sub1);
    await pause();
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    const unsub2 = alice.subscribe(query, sub2, undefined, {
      onRemoteFulfilled: onFulfilled,
    });
    await pause();
    expect(sub2).toHaveBeenCalledOnce();
    expect(onFulfilled).toHaveBeenCalledOnce();
  });
  it('will only send one data message for a change across multiple overlapping queries', async () => {
    const server = new TriplitServer(
      new DB({ entityStore: new ServerEntityStore() })
    );
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    const query1 = alice.query('test').Where('id', '=', 'test1');
    const query2 = alice.query('test');
    const unsub1 = alice.subscribe(query1, () => {});
    const unsub2 = alice.subscribe(query2, () => {});
    await pause();
    const syncMessageCallback = vi.fn();
    alice.syncEngine.onSyncMessageReceived(syncMessageCallback);
    await alice.insert('test', { id: 'test1', name: 'test1' });
    await pause();
    expect(syncMessageCallback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ENTITY_DATA' })
    );
    const changesMessages = syncMessageCallback.mock.calls.filter(
      (msg) => msg[0].type === 'ENTITY_DATA'
    );
    expect(changesMessages).toHaveLength(1);
    const changesMessage = changesMessages[0][0];
    expect(changesMessage.payload.forQueries).toHaveLength(2);
    unsub1();
    unsub2();
  });
});

// query state is being deprecated
it.skip('running reset will disconnect and reset the client sync state and clear all data', async () => {
  const db = new DB({ entityStore: new ServerEntityStore() });
  const server = new TriplitServer(db);
  await db.insert('collection_a', { id: 'a1' });
  await db.insert('collection_b', { id: 'b1' });
  const alice = createTestClient(server, {
    token: SERVICE_KEY,
    clientId: 'alice',
  });
  const query1 = alice.query('collection_a');
  const query2 = alice.query('collection_b');
  const qh1 = hashQuery(query1);
  const qh2 = hashQuery(query2);
  alice.subscribe(query1, () => {});
  alice.subscribe(query2, () => {});
  await pause(20);

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
  await pause(20);
  {
    // check state
    // disconnected
    expect(alice.syncEngine.connectionStatus).toBe('CLOSED');

    expect(
      // @ts-expect-error (not exposed)
      alice.syncEngine.awaitingAck.size
    ).toBe(0);
    // expect(
    //   // @ts-expect-error (not exposed)
    //   alice.syncEngine.queries.size
    // ).toBe(0);
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

describe('sessions API', async () => {
  describe('startSession', async () => {
    it('respects the `autoConnect` option in the constructor ', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore() })
      );
      const alice = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'alice',
        autoConnect: false,
      });
      expect(alice.syncEngine.connectionStatus).toBe('CLOSED');
      alice.connect();
      await pause(25);
      expect(alice.syncEngine.connectionStatus).toBe('OPEN');

      const bob = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'bob',
      });
      await pause(25);
      expect(bob.syncEngine.connectionStatus).toBe('OPEN');
    });
    it('respects the `autoConnect` option in the `startSession` method', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore() })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
      });
      expect(alice.syncEngine.connectionStatus).toBe('CLOSED');
      await alice.startSession(SERVICE_KEY, true);
      await pause(25);
      expect(alice.syncEngine.connectionStatus).toBe('OPEN');

      const bob = createTestClient(server, {
        clientId: 'bob',
      });
      await bob.startSession(SERVICE_KEY, false);
      await pause(25);
      expect(bob.syncEngine.connectionStatus).toBe('CLOSED');
    });
    it('will throw an error if you attempt to start a session with an expired token', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore() })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
      });
      const expiredToken = new Jose.UnsecuredJWT({ exp: 0 }).encode();
      await expect(
        async () => await alice.startSession(expiredToken, true)
      ).rejects.toThrow(TokenExpiredError);
    });
    // This has been deprecated
    it.skip('will save the current roles to storage', async () => {
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const collections = {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      };
      const server = new TriplitServer(
        new DB({
          entityStore: new ServerEntityStore(),
          schema: { roles, collections },
        })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
      });
      //@ts-expect-error - private method
      const preSessionRoles = await alice.getRolesForSyncSession();
      expect(preSessionRoles).toStrictEqual(undefined);
      await alice.startSession(SERVICE_KEY, true);
      //@ts-expect-error - private method
      const savedRoles = await alice.getRolesForSyncSession();
      expect(savedRoles).toStrictEqual([{ key: 'admin', roleVars: {} }]);
    });
    // SKIPPING - test transport doesn't have token refresh handling logic, that lives at the hono implementation
    it.skip('can setup a refresh handler to continuously refresh the session token which will clear when you end session', async () => {
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const collections = {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      };
      const server = new TriplitServer(
        new DB({
          entityStore: new ServerEntityStore(),
          schema: { roles, collections },
          clientId: 'server',
        })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
      });
      const EXPIRE_TIME = 2000;
      // create tokens that expire every 2000ms
      function getToken() {
        return new Jose.UnsecuredJWT({
          'x-triplit-token-type': 'secret',
          exp: (Date.now() + EXPIRE_TIME) / 1000,
        }).encode();
      }

      const refreshTracker = vi.fn();

      await alice.startSession(getToken(), true, {
        refreshHandler: () => {
          refreshTracker();
          return new Promise((resolve) => {
            resolve(getToken());
          });
        },
      });

      await pause((EXPIRE_TIME - 950) * 3);
      expect(refreshTracker).toHaveBeenCalledTimes(3);
      refreshTracker.mockClear();

      // ending the session should stop the refresh handler
      await alice.endSession();
      pause(200);
      expect(refreshTracker).not.toHaveBeenCalled();

      // you can also pass in a refresh interval
      const refreshTracker2 = vi.fn();
      const endRefresh = await alice.startSession(getToken(), true, {
        refreshHandler: () => {
          refreshTracker2();
          return new Promise((resolve) => {
            resolve(getToken());
          });
        },
        interval: EXPIRE_TIME,
      });
      await pause(EXPIRE_TIME * 3 + 10);
      expect(refreshTracker2).toHaveBeenCalledTimes(3);
      refreshTracker2.mockClear();
      endRefresh?.();
      await pause(200);
      expect(refreshTracker2).not.toHaveBeenCalled();
    }, 30000);
    // this has also been deprecated
    it.skip('will handle the sync session state of the previous session if you use durable storage', async () => {
      const cache = new MemoryBTreeStorage();
      const outbox = new MemoryBTreeStorage();
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const collections = {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      };
      const server = new TriplitServer(
        new DB({
          entityStore: new ServerEntityStore(),
          schema: { roles, collections },
        })
      );
      await server.db.insert('test', { id: 'test1', name: 'test1' });

      const alice = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
        token: SERVICE_KEY,
        storage: { cache, outbox },
      });
      const query = alice.query('test');
      const queryHash = hashQuery(query);
      // alice shouldn't have any saved roles or state vectors
      await pause(100);
      //@ts-expect-error - private method
      const preSessionRoles = await alice.getRolesForSyncSession();
      expect(preSessionRoles).toStrictEqual([{ key: 'admin', roleVars: {} }]);

      //@ts-expect-error - private method
      let queryState = await alice.syncEngine.getQueryState(queryHash);
      expect(queryState).toStrictEqual(undefined);

      alice.subscribe(query, () => {});
      await pause(100);

      //@ts-expect-error - private method
      queryState = await alice.syncEngine.getQueryState(queryHash);
      expect(queryState).toBeDefined();

      // start a new client - this is mocking a client that went offline mid-session
      const newAlice = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
        token: SERVICE_KEY,
        storage: { cache, outbox },
      });
      await pause(100);

      // new client should have the saved roles and state vectors
      //@ts-expect-error - private method
      const savedRoles = await newAlice.getRolesForSyncSession();
      expect(savedRoles).toStrictEqual([{ key: 'admin', roleVars: {} }]);
      //@ts-expect-error - private method
      queryState = await newAlice.syncEngine.getQueryState(queryHash);
      expect(queryState).toBeDefined();

      // not create another client with a different token
      const newAlice2 = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
        token: NOT_SERVICE_KEY,
        storage: { cache, outbox },
      });
      await pause(100);

      // new client should have overwritten the saved roles and state vectors
      //@ts-expect-error - private method
      const savedRoles2 = await newAlice2.getRolesForSyncSession();
      expect(savedRoles2).toStrictEqual([]);
      //@ts-expect-error - private method
      queryState = await newAlice2.syncEngine.getQueryState(queryHash);
      expect(queryState).toBe(undefined);
    });
  });
  describe('updateSessionToken', async () => {
    it('will throw an error if you attempt to update the session token with a token for a different session', async () => {
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const collections = {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      };
      const server = new TriplitServer(
        new DB({
          entityStore: new ServerEntityStore(),
          schema: { roles, collections },
        })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
        token: SERVICE_KEY,
      });
      // kind of tricky -- this is reliant on some async initialization in the client
      await pause(10);
      await expect(alice.updateSessionToken(NOT_SERVICE_KEY)).rejects.toThrow(
        SessionRolesMismatchError
      );
    });
    it('will throw an error if you attempt to update the session token with an expired token', async () => {
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const collections = {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      };
      const server = new TriplitServer(
        new DB({
          entityStore: new ServerEntityStore(),
          schema: { roles, collections },
        })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
        schema: collections,
        roles,
        token: SERVICE_KEY,
      });
      const expiredToken = new Jose.UnsecuredJWT({ exp: 0 }).encode();
      await expect(alice.updateSessionToken(expiredToken)).rejects.toThrow(
        TokenExpiredError
      );
    });
    it('will throw an error if you attempt to update the session token while no session is active', async () => {
      const server = new TriplitServer(
        new DB({ entityStore: new ServerEntityStore() })
      );
      const alice = createTestClient(server, {
        clientId: 'alice',
      });

      await expect(alice.updateSessionToken(SERVICE_KEY)).rejects.toThrow(
        NoActiveSessionError
      );
    });
  });
  describe('endSession', async () => {
    it('will disconnect the client and clear the token, state vectors, and saved roles', async () => {
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const collections = {
        test: {
          schema: S.Schema({ id: S.Id(), name: S.String() }),
        },
      };
      const db = new DB({ entityStore: new ServerEntityStore() });
      await db.insert('test', { id: 'test1', name: 'test1' });
      await db.insert('test', { id: 'test2', name: 'test2' });

      const server = new TriplitServer(db);
      const bob = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'bob',
        roles,
        schema: collections,
      });
      await pause(25);
      expect(bob.syncEngine.connectionStatus).toBe('OPEN');
      expect(bob.token).toBe(SERVICE_KEY);

      const bobCallback = vi.fn();

      const query = bob.query('test');
      bob.subscribe(query, bobCallback);
      await pause(50);

      // @ts-expect-error (not exposed)
      expect(bob.syncEngine.queries.size).toBe(1);
      // @ts-expect-error (not exposed)
      expect(bob.syncEngine.awaitingAck.size).toBe(0);

      // validate the state after the session ends
      await bob.endSession();
      expect(bob.syncEngine.connectionStatus).toBe('CLOSED');
      expect(bob.token).toBe(undefined);
      // @ts-expect-error (not exposed)
      expect(bob.syncEngine.queries.size).toBe(1);
    });
  });
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
    const serverDB = new DB({ entityStore: new ServerEntityStore(), schema });
    // insert 20 items
    for (let i = 0; i < 40; i++) {
      serverDB.insert('test', { id: `test${i}`, name: `test${i}` });
    }
    const LIMIT = 10;

    const server = new TriplitServer(serverDB);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = alice
      .query('test')
      .Where('name', 'like', 'test%')
      .Limit(LIMIT);
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
    const serverDB = new DB({ entityStore: new ServerEntityStore(), schema });
    // insert 20 items
    for (let i = 0; i < 40; i++) {
      serverDB.insert('test', { id: `test${i}`, name: `test${i}` });
    }
    const LIMIT = 10;

    const server = new TriplitServer(serverDB);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema.collections,
    });
    const query = alice
      .query('test')
      .Order('name', 'ASC')
      .Where('name', 'like', 'test%')
      .Limit(LIMIT);
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

describe('entity cache on client', async () => {
  it('can get cached results for the same collection from two different subscriptions', async () => {
    const schema = {
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
        relationships: {
          events: S.RelationMany('event_registrations', {
            where: [['user_id', '=', '$id']],
          }),
        },
      },
      event_registrations: {
        schema: S.Schema({
          id: S.Id(),
          user_id: S.String(),
        }),
      },
    };
    const serverDB = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    for (let i = 0, len = 31; i < len; i++) {
      await serverDB.insert('users', { id: `user${i}`, name: `user${i}` });
    }
    const alice = createTestClient(new TriplitServer(serverDB), {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema: schema,
      experimental: {
        entityCache: {
          capacity: 10000,
        },
      },
    });
    const allUsersQuery = alice.query('users').Include('events');
    const currentUserQuery = alice.query('users').Id('user0').Limit(1);

    const allUsersSub = vi.fn();
    const currentUserSub = vi.fn();
    alice.subscribe(allUsersQuery, allUsersSub);
    alice.subscribe(currentUserQuery, currentUserSub);
    await pause(200);

    expect(allUsersSub.mock.lastCall?.[0]).toHaveLength(31);
  });
});

// TODO: this is failing because the test transport
// doesn't simulate the connectionStatus well (it is CLOSED when it should be open)
// and the fetch policy is somewhat determined by the connection status
describe('fetch', async () => {
  describe('local-first', async () => {
    it('will get results from remote server with net-new query', async () => {
      const serverDB = new DB({ entityStore: new ServerEntityStore() });
      const server = new TriplitServer(serverDB);
      await serverDB.insert('test', { id: 'test1', name: 'test1' });

      const alice = createTestClient(server, {
        token: SERVICE_KEY,
        clientId: 'alice',
      });
      const query = alice.query('test');
      const results = await alice.fetch(query, { policy: 'local-first' });
      expect(results.length).toBe(1);
    });
  });
});

it.todo('updates to deleted entities over sync are dropped', () => {
  // Old test from db.spec.ts - probably should be a transport test
  // const db = new DB({
  //   schema: {
  //     collections: {
  //       TestScores: {
  //         schema: S.Schema({
  //           id: S.Id(),
  //           score: S.Optional(S.Number()),
  //           date: S.String(),
  //         }),
  //       },
  //     },
  //   },
  // });
  // const scores = [
  //   { score: 99, date: '2023-04-16' },
  //   { score: 98, date: '2023-04-16' },
  //   { score: 97, date: '2023-04-16' },
  //   { score: 96, date: '2023-04-16' },
  //   { score: 95, date: '2023-04-16' },
  // ];
  // let i = 0;
  // for (const score of scores) {
  //   await db.insert('TestScores', { ...score, id: (i++).toString() });
  // }
  // await db.delete('TestScores', '0');
  // // simulate a client syncing a triple to the deleted entity for the optional field
  // await db.tripleStore.insertTriple({
  //   id: appendCollectionToId('TestScores', '0'),
  //   attribute: ['TestScores', 'score'],
  //   value: 99,
  //   timestamp: [1, 'external-client'],
  //   expired: false,
  // });
  // const results = await db.fetch(
  //   db.query('TestScores').Order(['score', 'ASC'])
  // );
  // expect([...results.values()].map((r) => r.score)).toEqual([95, 96, 97, 98]);
});
