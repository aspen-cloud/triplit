import { expect, it, describe, vi, afterAll, beforeAll } from 'vitest';
import { tempTriplitServer } from '../utils/server.js';
import { TriplitClient, Schema as S, HttpClient } from '@triplit/client';
import { pause } from '../utils/async.js';
import * as jose from 'jose';
import { schema } from '../triplit/schema.js';
import { permission } from 'process';

global.WebSocket = WebSocket;

const SECRET = 'test-secret';

const JWT_SECRET = new TextEncoder().encode(SECRET);

async function encodeToken(payload: any, exp?: string) {
  let token = new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' });
  if (exp) {
    token = token.setExpirationTime(exp);
  }
  return await token.sign(JWT_SECRET);
}

const serviceToken = await encodeToken({ 'x-triplit-token-type': 'secret' });

beforeAll(() => {
  vi.stubEnv('JWT_SECRET', SECRET);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const DEFAULT_TOKEN = await encodeToken({ sub: 'test' });

const DEFAULT_SCHEMA = {
  collections: {
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  },
};

it('client inserts should go into the outbox and clear after syncing', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
  });
  await client.insert('users', { id: '1', name: 'test' });
  expect(
    await client.db.entityStore.doubleBuffer.getChangesForEntity(
      client.db.kv,
      'users',
      '1'
    )
  ).toEqual({
    update: { id: '1', name: 'test' },
    delete: false,
  });
  expect(await client.fetchById('users', '1')).toEqual({
    id: '1',
    name: 'test',
  });
  const messageSentSpy = vi.fn();
  client.onSyncMessageSent(messageSentSpy);
  await pause();
  expect(
    await client.db.entityStore.doubleBuffer.getChangesForEntity(
      client.db.kv,
      'users',
      '1'
    )
  ).toBeUndefined();
  expect(await client.fetchById('users', '1')).toEqual({
    id: '1',
    name: 'test',
  });
  expect(await client.http.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'test' },
  ]);
});
it('will clear the outbox after syncing', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
    autoConnect: true,
  });
  const spy = vi.fn();
  await client.insert('users', { id: '1', name: 'test' });
  expect(
    await client.db.entityStore.doubleBuffer.getChangesForEntity(
      client.db.kv,
      'users',
      '1'
    )
  ).toEqual({
    update: { id: '1', name: 'test' },
    delete: false,
  });
  await pause();
  expect(spy.mock.lastCall);
  expect(
    await client.db.entityStore.doubleBuffer.getChangesForEntity(
      client.db.kv,
      'users',
      '1'
    )
  ).toBeUndefined();
  client.disconnect();
});

it(
  'client updates should go into the outbox and clear after syncing',
  { timeout: 500 },
  async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: { schema: DEFAULT_SCHEMA },
        jwtSecret: SECRET,
      },
    });
    const { port } = server;
    const client = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: DEFAULT_TOKEN,
      schema: DEFAULT_SCHEMA.collections,
      autoConnect: true,
    });

    await pause();
    await client.insert('users', { id: '1', name: 'test' });
    await pause();
    expect(
      await client.db.entityStore.doubleBuffer.getChangesForEntity(
        client.db.kv,
        'users',
        '1'
      )
    ).toStrictEqual(undefined);
    client.disconnect();
    await client.update('users', '1', (e) => {
      e.name = 'updated';
    });
    expect(
      await client.db.entityStore.doubleBuffer.getChangesForEntity(
        client.db.kv,
        'users',
        '1'
      )
    ).toEqual({
      update: { name: 'updated' },
      delete: false,
    });
    expect(await client.fetch({ collectionName: 'users' })).toEqual([
      {
        id: '1',
        name: 'updated',
      },
    ]);
  }
);

it('should sync all valid changes made offline', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
    autoConnect: false,
  });
  await client.insert('users', { id: '1', name: 'Peter' });
  await client.insert('users', { id: '2', name: 'Paul' });
  await client.insert('users', { id: '3', name: 'Mary' });
  await client.update('users', '1', (e) => {
    e.name = 'Baxter';
  });
  await client.delete('users', '2');
  expect(await client.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Baxter' },
    { id: '3', name: 'Mary' },
  ]);
  const messageSentSpy = vi.fn();
  client.onSyncMessageSent(messageSentSpy);
  await client.connect();
  await pause(30);
  expect(await client.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Baxter' },
    { id: '3', name: 'Mary' },
  ]);
  expect(
    await client.db.entityStore.doubleBuffer.isEmpty(client.db.kv)
  ).toBeTruthy();
  expect(await client.http.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Baxter' },
    { id: '3', name: 'Mary' },
  ]);
});

it('all inserts should be picked up by syncing', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
  });
  const messageSentSpy = vi.fn();
  client.onSyncMessageSent(messageSentSpy);
  const messageReceivedSpy = vi.fn();
  client.onSyncMessageReceived(messageReceivedSpy);
  await client.insert('users', { id: '1', name: 'Peter' });
  await pause();
  await client.insert('users', { id: '2', name: 'Paul' });
  await pause();
  await client.insert('users', { id: '3', name: 'Mary' });
  await pause(30);
  expect(await client.http.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Peter' },
    { id: '2', name: 'Paul' },
    { id: '3', name: 'Mary' },
  ]);
});

it('will pick up concurrent, independent inserts', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
  });
  const messageSentSpy = vi.fn();
  client.onSyncMessageSent(messageSentSpy);
  const messageReceivedSpy = vi.fn();
  client.onSyncMessageReceived(messageReceivedSpy);
  await Promise.all([
    client.insert('users', { id: '1', name: 'Peter' }),
    client.insert('users', { id: '2', name: 'Paul' }),
    client.insert('users', { id: '3', name: 'Mary' }),
  ]);
  await pause(30);
  expect(await client.http.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Peter' },
    { id: '2', name: 'Paul' },
    { id: '3', name: 'Mary' },
  ]);
});

it('should sync deletes after reconnecting', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
    autoConnect: false,
  });
  await client.insert('users', { id: '1', name: 'Peter' });
  await client.insert('users', { id: '2', name: 'Paul' });
  await client.insert('users', { id: '3', name: 'Mary' });
  await client.connect();
  await pause(30);
  expect(await client.http.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Peter' },
    { id: '2', name: 'Paul' },
    { id: '3', name: 'Mary' },
  ]);
  client.disconnect();
  await client.delete('users', '2');
  await client.connect();
  await pause(30);
  expect(await client.http.fetch({ collectionName: 'users' })).toEqual([
    { id: '1', name: 'Peter' },
    { id: '3', name: 'Mary' },
  ]);
});

describe('can remedy rejected sync operations with simple mutations', async () => {
  const schema = {
    roles: {
      user: {
        match: {
          sub: '$userId',
        },
      },
    },
    collections: {
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
        permissions: {
          user: {
            read: { filter: [true] },
            insert: { filter: [true] },
            update: { filter: [true] },
            delete: { filter: [true] },
          },
        },
      },
      posts: {
        schema: S.Schema({
          id: S.Id(),
          title: S.String(),
          authorId: S.String(),
        }),
        permissions: {
          user: {
            read: { filter: [true] },
            insert: { filter: [['authorId', '=', '$role.userId']] },
            update: { filter: [['authorId', '=', '$role.userId']] },
            delete: { filter: [['authorId', '=', '$role.userId']] },
          },
        },
      },
    },
  };

  it('can remedy syncing by deleting', async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: { schema },
        jwtSecret: SECRET,
      },
    });
    const { port } = server;
    const client = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: DEFAULT_TOKEN,
      schema: schema.collections,
      autoConnect: true,
    });
    const sessionMessagesSpy = vi.fn();
    client.onSyncMessageReceived(sessionMessagesSpy);

    // Insert one valid and one invalid post
    await client.transact(async (tx) => {
      await tx.insert('posts', { id: '1', title: 'Post 1', authorId: 'test' });
      await tx.insert('posts', { id: '2', title: 'Post 2', authorId: '2' });
    });
    await pause();
    /**
     * TEST QUIRK:
     * There's currently two chances for the outbox to fire
     * - once when the local insert commits
     * - once when the onOpen event fires in the syncEngine
     * With a "dirty" outbox that has an erroneous change in it
     * this might lead to the sync and associated error message
     * firing twice. This makes it hard to say exactly how many
     * messages a client might send out when making local mutations
     * as soon as it initializes
     */
    // expect(sessionMessagesSpy).toHaveBeenCalledTimes(1);
    expect(sessionMessagesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ERROR',
        payload: expect.objectContaining({
          messageType: 'CHANGES',
          metadata: {
            failures: [
              expect.objectContaining({
                error: expect.objectContaining({
                  name: 'WritePermissionError',
                }),
              }),
            ],
          },
        }),
      })
    );

    expect(await client.http.fetch({ collectionName: 'posts' })).toEqual([]);

    // Fix the invalid post
    await client.delete('posts', '2');
    await pause(50);

    expect(await client.http.fetch({ collectionName: 'posts' })).toEqual([
      {
        id: '1',
        title: 'Post 1',
        authorId: 'test',
      },
    ]);
  });

  it('can remedy syncing by updating', async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: { schema },
        jwtSecret: SECRET,
      },
    });
    const { port } = server;
    const client = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: DEFAULT_TOKEN,
      schema: schema.collections,
      autoConnect: true,
    });
    const sessionMessagesSpy = vi.fn();
    client.onSyncMessageReceived(sessionMessagesSpy);

    // Insert one valid and one invalid post
    await client.transact(async (tx) => {
      await tx.insert('posts', {
        id: '1',
        title: 'Post 1',
        authorId: 'not-test',
      });
    });

    await pause();
    // expect(sessionMessagesSpy).toHaveBeenCalledTimes(2);
    expect(sessionMessagesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ERROR',
        payload: expect.objectContaining({
          messageType: 'CHANGES',
          metadata: {
            failures: [
              expect.objectContaining({
                error: expect.objectContaining({
                  name: 'WritePermissionError',
                }),
              }),
            ],
          },
        }),
      })
    );
    expect(await client.http.fetch({ collectionName: 'posts' })).toEqual([]);

    // Fix the invalid post
    await client.update('posts', '1', { authorId: 'test' });
    await pause(50);

    expect(await client.http.fetch({ collectionName: 'posts' })).toEqual([
      {
        id: '1',
        title: 'Post 1',
        authorId: 'test',
      },
    ]);
  });
  it('can remedy syncing by clearing a specific entity from the outbox', async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: { schema },
        jwtSecret: SECRET,
      },
    });
    const { port } = server;
    const admin = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: serviceToken,
      schema: schema.collections,
      autoConnect: true,
    });
    const user = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: DEFAULT_TOKEN,
      schema: schema.collections,
      autoConnect: true,
    });
    const sessionMessagesSpy = vi.fn();
    user.onSyncMessageReceived(sessionMessagesSpy);

    await pause();
    // Admin insert one valid post
    await admin.http.insert('posts', {
      id: '1',
      title: 'Post 1',
      authorId: 'admin',
    });

    // User can see the post
    expect(await user.http.fetch({ collectionName: 'posts' })).toEqual([
      {
        id: '1',
        title: 'Post 1',
        authorId: 'admin',
      },
    ]);

    // user attempts to delete the post
    await user.delete('posts', '1');
    await pause(40);
    // expect(sessionMessagesSpy).toHaveBeenCalledTimes(1);
    const WRITE_PERMISSION_ERROR_MSG = expect.objectContaining({
      type: 'ERROR',
      payload: expect.objectContaining({
        messageType: 'CHANGES',
        metadata: {
          failures: [
            expect.objectContaining({
              error: expect.objectContaining({
                name: 'WritePermissionError',
              }),
            }),
          ],
        },
      }),
    });
    // but user doesn't have permission
    expect(sessionMessagesSpy).toHaveBeenCalledWith(WRITE_PERMISSION_ERROR_MSG);
    sessionMessagesSpy.mockClear();
    // user attempts to insert another post but
    // the delete sitting in their outbox is blocking it
    await user.insert('posts', {
      id: '2',
      title: 'Post 2',
      authorId: 'test',
    });
    await pause(50);
    //

    expect(sessionMessagesSpy).toHaveBeenCalledTimes(1);

    // but user doesn't have permission
    expect(sessionMessagesSpy).toHaveBeenCalledWith(WRITE_PERMISSION_ERROR_MSG);
    sessionMessagesSpy.mockClear();
    await user.clearPendingChangesForEntity('posts', '1');
    await pause(50);
    expect(sessionMessagesSpy).toHaveBeenCalledTimes(1);
    expect(sessionMessagesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHANGES_ACK',
      })
    );
    expect(await user.http.fetch({ collectionName: 'posts' })).toEqual([
      {
        id: '1',
        title: 'Post 1',
        authorId: 'admin',
      },
      {
        id: '2',
        title: 'Post 2',
        authorId: 'test',
      },
    ]);
  });
  it('can remedy syncing by clearing all pending changes', async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        dbOptions: { schema },
        jwtSecret: SECRET,
      },
    });
    const { port } = server;
    const admin = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: serviceToken,
      schema: schema.collections,
      autoConnect: true,
    });
    const user = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: DEFAULT_TOKEN,
      schema: schema.collections,
      autoConnect: true,
    });
    const sessionMessagesSpy = vi.fn();
    user.onSyncMessageReceived(sessionMessagesSpy);

    await pause();
    // Admin insert one valid post
    await admin.http.insert('posts', {
      id: '1',
      title: 'Post 1',
      authorId: 'admin',
    });

    // User can see the post
    expect(await user.http.fetch({ collectionName: 'posts' })).toEqual([
      {
        id: '1',
        title: 'Post 1',
        authorId: 'admin',
      },
    ]);

    // user attempts to delete the post
    await user.delete('posts', '1');
    await pause();
    const WRITE_PERMISSION_ERROR_MSG = expect.objectContaining({
      type: 'ERROR',
      payload: expect.objectContaining({
        messageType: 'CHANGES',
        metadata: {
          failures: [
            expect.objectContaining({
              error: expect.objectContaining({
                name: 'WritePermissionError',
              }),
            }),
          ],
        },
      }),
    });
    // but user doesn't have permission
    expect(sessionMessagesSpy).toHaveBeenLastCalledWith(
      WRITE_PERMISSION_ERROR_MSG
    );
    sessionMessagesSpy.mockClear();
    // user attempts to insert another post but
    // the delete sitting in their outbox is blocking it
    await user.insert('posts', {
      id: '2',
      title: 'Post 2',
      authorId: 'test',
    });
    await pause(50);
    //

    expect(sessionMessagesSpy).toHaveBeenCalledTimes(1);

    // but user doesn't have permission
    expect(sessionMessagesSpy).toHaveBeenCalledWith(WRITE_PERMISSION_ERROR_MSG);
    sessionMessagesSpy.mockClear();
    await user.clearPendingChangesAll();
    await user.insert('posts', {
      id: '3',
      title: 'Post 3',
      authorId: 'test',
    });
    await pause(50);
    expect(sessionMessagesSpy).toHaveBeenCalledTimes(1);
    expect(sessionMessagesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHANGES_ACK',
      })
    );
    expect(await user.http.fetch({ collectionName: 'posts' })).toEqual([
      {
        id: '1',
        title: 'Post 1',
        authorId: 'admin',
      },
      {
        id: '3',
        title: 'Post 3',
        authorId: 'test',
      },
    ]);
  });
});

it('will fire an onEntitySyncSuccess callback', async () => {
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA }, jwtSecret: SECRET },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
    autoConnect: true,
  });
  const spy = vi.fn();
  const unsub = client.onEntitySyncSuccess('users', '1', spy);
  await client.insert('users', { id: '1', name: 'test' });
  await pause(30);
  expect(spy).toHaveBeenCalled();
  await client.update('users', '1', (e) => {
    e.name = 'updated';
  });
  await pause(30);
  expect(spy).toHaveBeenCalledTimes(2);

  await client.delete('users', '1');
  await pause(30);
  expect(spy).toHaveBeenCalledTimes(3);
  unsub();
  spy.mockClear();
  await client.insert('users', { id: '1', name: 'biggerTest' });
  await client.insert('users', { id: '2', name: 'test' });
  await pause(30);
  expect(spy).not.toHaveBeenCalled();
});

it('will fire an onFailureToSyncWrites callback', async () => {
  using server = await tempTriplitServer({
    serverOptions: {
      dbOptions: {
        schema: {
          roles: { user: { match: { sub: '$userId' } } },
          collections: S.Collections({
            users: {
              schema: S.Schema({ id: S.Id(), name: S.String() }),
              permissions: {
                user: {
                  insert: { filter: [true] },
                  update: { filter: [false] },
                  delete: { filter: [false] },
                },
              },
            },
          }),
        },
      },
      jwtSecret: SECRET,
    },
  });
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
    schema: DEFAULT_SCHEMA.collections,
    autoConnect: true,
  });
  const spy = vi.fn();
  const unsub = client.onFailureToSyncWrites(spy);
  await client.insert('users', { id: '1', name: 'test' });
  await pause(30);
  expect(spy).not.toHaveBeenCalled();
  await client.update('users', '1', (e) => {
    e.name = 'updated';
  });
  await pause(30);
  expect(spy).toHaveBeenCalled();
  await client.delete('users', '1');
  await pause(30);
  expect(spy).toHaveBeenCalledTimes(2);
  unsub();
});

it('Outbox data is always overlaid during in data from subscriptions', async () => {
  // const serverDB = new DB({ entityStore: new ServerEntityStore() });
  // await serverDB.insert('test', { id: 'test1', name: 'test1' });
  // const server = new TriplitServer(serverDB);
  using server = await tempTriplitServer({
    serverOptions: { jwtSecret: SECRET },
  });
  const { port } = server;

  const http = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
  });
  await http.insert('test', { id: 'test1', name: 'test1' });

  // Initialize alice and bob and subscriptions
  const alice = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
  });
  const bob = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: DEFAULT_TOKEN,
  });
  const aliceSub = vi.fn();
  const bobSub = vi.fn();
  alice.subscribe(alice.query('test'), aliceSub);
  bob.subscribe(bob.query('test'), bobSub);
  await pause();
  expect(aliceSub.mock.calls.at(-1)?.[0]).toStrictEqual([
    { id: 'test1', name: 'test1' },
  ]);
  expect(bobSub.mock.calls.at(-1)?.[0]).toStrictEqual([
    { id: 'test1', name: 'test1' },
  ]);

  // Prevent outbox clearing for alice
  // THIS ISNT EXACTLY AN API BUT WE CAN KEEP ITEMS IN THE OUTBOX BY TOGGLING syncInProgress
  alice.syncEngine.syncInProgress = true;
  // Update data
  await alice.update('test', 'test1', {
    name: 'a',
  });
  await pause();
  expect(aliceSub.mock.calls.at(-1)?.[0]).toStrictEqual([
    { id: 'test1', name: 'a' },
  ]);
  expect(bobSub.mock.calls.at(-1)?.[0]).toStrictEqual([
    { id: 'test1', name: 'test1' },
  ]);

  // Bob makes a change that will sync to alice
  await bob.update('test', 'test1', {
    name: 'b',
  });
  await pause();
  // Alice still has the outbox change
  expect(aliceSub.mock.calls.at(-1)?.[0]).toStrictEqual([
    { id: 'test1', name: 'a' },
  ]);
  expect(bobSub.mock.calls.at(-1)?.[0]).toStrictEqual([
    { id: 'test1', name: 'b' },
  ]);
  // TODO: If alice clears outbox, she should see bobs data
  // await alice.clearPendingChangesForEntity('test', 'test1');
  // await pause();
  // console.dir(aliceSub.mock.calls, { depth: null });
});
