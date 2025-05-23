import { expect, it, describe, vi } from 'vitest';
import { Server as TriplitServer } from '@triplit/server-core';
import {
  createTestClient,
  receivedMessages,
  SERVICE_KEY,
  spyMessages,
} from '../utils/client.js';
import { DB, Models, Schema as S } from '@triplit/db';
import { pause } from '../utils/async.js';
import { generateServiceToken } from '../utils/token.js';
import { tempTriplitServer } from '../utils/server.js';
import { HttpClient, TriplitClient } from '@triplit/client';

const SECRET = 'test-secret';

// TODO: confusing with SERVICE_KEY, rename
const serviceToken = await generateServiceToken(SECRET);

it('allows a schemaful client and schemaful server with incompatible schemas to connect', async () => {
  const serverSchema = {
    collections: S.Collections({
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
        }),
      },
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
      },
    }),
  };
  const clientSchema = {
    collections: S.Collections({
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          done: S.Boolean(),
        }),
      },
      users: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
        }),
      },
    }),
  };
  const serverDb = new DB({
    schema: serverSchema,
  });
  await serverDb.insert('users', {
    id: '1',
    name: 'alice',
  });
  await serverDb.insert('todos', {
    id: '1',
    text: 'test',
    completed: false,
  });
  const server = new TriplitServer(serverDb);

  const client = createTestClient(server, {
    clientId: 'alice',
    token: SERVICE_KEY,
    schema: clientSchema.collections,
    autoConnect: false,
  });
  const spy = spyMessages(client);
  client.connect();
  await pause();
  // Initial handshake is correct
  expect(spy.length).toEqual(1);
  expect(spy[0].direction).toEqual('RECEIVED');
  expect(spy[0].message.type).toEqual('READY');

  // Client can sync with server where schemas are compatible
  const userSub = vi.fn();
  const userQuery = client.query('users');
  client.subscribe(userQuery, userSub);
  await pause();
  expect(userSub.mock.calls.at(-1)?.[0]).toEqual([
    {
      id: '1',
      name: 'alice',
    },
  ]);

  await client.insert('users', {
    id: '2',
    name: 'bob',
  });
  await pause();
  expect(userSub.mock.calls.at(-1)?.[0]).toEqual([
    {
      id: '1',
      name: 'alice',
    },
    {
      id: '2',
      name: 'bob',
    },
  ]);

  // TODO: test error cases
  // const todoSub = vi.fn();
  // const todoQuery = client.query('todos');
  // client.subscribe(todoQuery, todoSub);
  // await pause();
});

it.skip('Should allow a client with the same schema to sync', async () => {
  const schema = {
    collections: S.Collections({
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
        }),
      },
    }),
  };
  const server = new TriplitServer(
    new DB<any>({
      schema,
    })
  );
  const client = createTestClient(server, {
    clientId: 'alice',
    token: SERVICE_KEY,
    schema: schema.collections,
    autoConnect: false,
  });
  const spy = spyMessages(client);
  client.connect();
  await pause();

  // Initial handshake is correct
  expect(spy.length).toEqual(3);
  expect(spy[0].direction).toEqual('RECEIVED');
  expect(spy[0].message.type).toEqual('SCHEMA_REQUEST');
  expect(spy[1].direction).toEqual('SENT');
  expect(spy[1].message.type).toEqual('SCHEMA_RESPONSE');
  expect(spy[2].direction).toEqual('RECEIVED');
  expect(spy[2].message.type).toEqual('READY');

  // Client state is correct
  // @ts-expect-error - private
  expect(client.syncEngine.serverReady).toBe(true);
  expect(client.syncEngine.connectionStatus).toEqual('OPEN');

  // Can write data and subscribe over transport
  const sub = vi.fn();
  const query = client.query('todos');
  client.subscribe(query, sub);
  await client.insert('todos', {
    id: '1',
    text: 'test',
    completed: false,
  });
  await pause();
  expect(sub.mock.calls.at(-1)).toEqual([
    [
      {
        id: '1',
        text: 'test',
        completed: false,
      },
    ],
  ]);
});

it.skip('Should allow clients that are compatible to sync', async () => {
  const schemaAlice = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
          alice: S.Optional(S.String()),
        }),
      },
    },
  };
  const schemaBob = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
          bob: S.Optional(S.String()),
        }),
      },
    },
  };
  const schemaServer = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
          // Optional fields are backwards compatible
          alice: S.Optional(S.String()),
          bob: S.Optional(S.String()),
        }),
      },
    },
  };
  const server = new TriplitServer(
    new DB({
      schema: schemaServer,
    })
  );
  const clientAlice = createTestClient(server, {
    clientId: 'alice',
    token: SERVICE_KEY,
    schema: schemaAlice.collections,
    autoConnect: false,
  });
  const clientBob = createTestClient(server, {
    clientId: 'bob',
    token: SERVICE_KEY,
    schema: schemaBob.collections,
    autoConnect: false,
  });
  const spyAlice = spyMessages(clientAlice);
  const spyBob = spyMessages(clientBob);
  clientAlice.connect();
  clientBob.connect();
  await pause();
  // Initial handshake is correct
  expect(spyAlice.length).toEqual(3);
  expect(spyAlice[0].direction).toEqual('RECEIVED');
  expect(spyAlice[0].message.type).toEqual('SCHEMA_REQUEST');
  expect(spyAlice[1].direction).toEqual('SENT');
  expect(spyAlice[1].message.type).toEqual('SCHEMA_RESPONSE');
  expect(spyAlice[2].direction).toEqual('RECEIVED');
  expect(spyAlice[2].message.type).toEqual('READY');

  expect(spyBob.length).toEqual(3);
  expect(spyBob[0].direction).toEqual('RECEIVED');
  expect(spyBob[0].message.type).toEqual('SCHEMA_REQUEST');
  expect(spyBob[1].direction).toEqual('SENT');
  expect(spyBob[1].message.type).toEqual('SCHEMA_RESPONSE');
  expect(spyBob[2].direction).toEqual('RECEIVED');
  expect(spyBob[2].message.type).toEqual('READY');

  // Client state is correct
  // @ts-expect-error - private
  expect(clientAlice.syncEngine.serverReady).toBe(true);
  expect(clientAlice.syncEngine.connectionStatus).toEqual('OPEN');
  // @ts-expect-error - private
  expect(clientBob.syncEngine.serverReady).toBe(true);
  expect(clientBob.syncEngine.connectionStatus).toEqual('OPEN');

  // Can write data and subscribe over transport
  const subAlice = vi.fn();
  const subBob = vi.fn();
  const queryAlice = clientAlice.query('todos');
  const queryBob = clientBob.query('todos');
  clientAlice.subscribe(queryAlice, subAlice);
  clientBob.subscribe(queryBob, subBob);
  await clientAlice.insert('todos', {
    id: '1',
    text: 'test',
    completed: false,
    alice: 'test',
  });
  await clientBob.insert('todos', {
    id: '2',
    text: 'test',
    completed: false,
    bob: 'test',
  });
  await pause();
  // TODO: confirm we the exact behavior of select * and data that is technically not in the client schema
  expect(subAlice.mock.calls.at(-1)?.[0].length).toEqual(2);
  expect(subAlice.mock.calls.at(-1)?.[0]).toContainEqual({
    id: '1',
    text: 'test',
    completed: false,
    alice: 'test',
  });
  expect(subAlice.mock.calls.at(-1)?.[0]).toContainEqual({
    id: '2',
    text: 'test',
    completed: false,
    // bob: 'test',
  });

  expect(subBob.mock.calls.at(-1)?.[0].length).toEqual(2);
  expect(subBob.mock.calls.at(-1)?.[0]).toContainEqual({
    id: '1',
    text: 'test',
    completed: false,
    // alice: 'test',
  });
  expect(subBob.mock.calls.at(-1)?.[0]).toContainEqual({
    id: '2',
    text: 'test',
    completed: false,
    bob: 'test',
  });
});

it.skip('Should not allow clients to are incompatible to sync', async () => {
  const schemaClient = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
        }),
      },
    },
  };
  const schemaServer = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
          // Required fields are not backwards compatible
          assignee: S.String(),
        }),
      },
    },
  };
  const server = new TriplitServer(
    new DB({
      schema: schemaServer,
    })
  );
  const client = createTestClient(server, {
    clientId: 'alice',
    token: SERVICE_KEY,
    schema: schemaClient.collections,
    autoConnect: false,
  });
  const spy = spyMessages(client);
  client.connect();
  await pause();
  // Initial handshake fails
  expect(spy.length).toEqual(3);
  expect(spy[0].direction).toEqual('RECEIVED');
  expect(spy[0].message.type).toEqual('SCHEMA_REQUEST');
  expect(spy[1].direction).toEqual('SENT');
  expect(spy[1].message.type).toEqual('SCHEMA_RESPONSE');
  expect(spy[2].direction).toEqual('RECEIVED');
  expect(spy[2].message).toEqual({
    type: 'CLOSE',
    payload: {
      type: 'SCHEMA_MISMATCH',
      retry: false,
      message:
        'The client schema is not backwards compatible with the server schema.',
    },
  });
  // Client state is correct
  // @ts-expect-error - private
  expect(client.syncEngine.serverReady).toBe(false);
  expect(client.syncEngine.connectionStatus).toEqual('CLOSED');
});

it.skip('Schema handshake will only occur on first connection with schema', async () => {
  const schemaClient = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
        }),
      },
    },
  };
  const schemaServer = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
          // Required fields are not backwards compatible
          assignee: S.Optional(S.String()),
        }),
      },
    },
  };
  const server = new TriplitServer(
    new DB({
      schema: schemaServer,
    })
  );
  const alice = createTestClient(server, {
    clientId: 'alice',
    token: SERVICE_KEY,
    schema: schemaClient.collections,
    autoConnect: false,
  });
  const bob = createTestClient(server, {
    clientId: 'bob',
    token: SERVICE_KEY,
    schema: schemaClient.collections,
    autoConnect: false,
  });
  const spyAlice = spyMessages(alice);
  const spyBob = spyMessages(bob);

  // Connect Alice first, loads schema into compatibility list
  alice.connect();
  await pause();

  // Then connect Bob
  bob.connect();
  await pause();

  // Alice initial handshake contains schema compatibility checks
  expect(spyAlice.length).toEqual(3);
  expect(spyAlice[0].direction).toEqual('RECEIVED');
  expect(spyAlice[0].message.type).toEqual('SCHEMA_REQUEST');
  expect(spyAlice[1].direction).toEqual('SENT');
  expect(spyAlice[1].message.type).toEqual('SCHEMA_RESPONSE');
  expect(spyAlice[2].direction).toEqual('RECEIVED');
  expect(spyAlice[2].message.type).toEqual('READY');

  // Bob initial handshake does not contain schema compatibility checks
  expect(spyBob.length).toEqual(1);
  expect(spyBob[0].direction).toEqual('RECEIVED');
  expect(spyBob[0].message.type).toEqual('READY');
});

describe('Schemaless situations', () => {
  it('A schemaless client and server should be able to sync', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
      autoConnect: false,
    });
    const spy = spyMessages(client);
    client.connect();
    await pause();

    // No schema handshake because both schemaless
    expect(spy.length).toEqual(1);
    expect(spy[0].direction).toEqual('RECEIVED');
    expect(spy[0].message.type).toEqual('READY');
    // Client state is correct
    // @ts-expect-error - private
    expect(client.syncEngine.serverReady).toBe(true);
    expect(client.syncEngine.connectionStatus).toEqual('OPEN');

    // Can write data and subscribe over transport
    const sub = vi.fn();
    const query = client.query('todos');
    client.subscribe(query, sub);
    await client.insert('todos', {
      id: '1',
      text: 'test',
      completed: false,
    });
    await pause();

    expect(sub.mock.calls.at(-1)).toEqual([
      [
        {
          id: '1',
          text: 'test',
          completed: false,
        },
      ],
    ]);
  });

  it('A schemaless client and schemaful server should be able to sync', async () => {
    const schema = {
      collections: {
        todos: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            completed: S.Boolean(),
          }),
        },
      } satisfies Models,
    };
    const server = new TriplitServer(
      new DB({
        schema,
      })
    );
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
      autoConnect: false,
    });
    const spy = spyMessages(client);
    client.connect();
    await pause();

    // No schema handshake because client is schemaless
    expect(spy.length).toEqual(1);
    expect(spy[0].direction).toEqual('RECEIVED');
    expect(spy[0].message.type).toEqual('READY');
    // Client state is correct
    // @ts-expect-error - private
    expect(client.syncEngine.serverReady).toBe(true);
    expect(client.syncEngine.connectionStatus).toEqual('OPEN');

    // Can write data and subscribe over transport
    const sub = vi.fn();
    const query = client.query('todos');
    client.subscribe(query, sub);
    await client.insert('todos', {
      id: '1',
      text: 'test',
      completed: false,
    });
    await pause();
    expect(sub.mock.calls.at(-1)).toEqual([
      [
        {
          id: '1',
          text: 'test',
          completed: false,
        },
      ],
    ]);
    // write invalid data
    await client.insert('todos', {
      id: '2',
      text: 1,
      done: false,
    });
    await pause();
    expect(spy.at(-1)?.direction).toEqual('RECEIVED');
    expect(spy.at(-1)?.message.type).toEqual('ERROR');
    expect(
      spy
        .at(-1)
        ?.message.payload.metadata.failures.find(
          (failure) =>
            failure.collection === 'todos' &&
            failure.error.name === 'DBSerializationError'
        )
    ).toBeTruthy();
  });

  it('A schemaful client and schemaless server should be able to sync', async () => {
    const schema = {
      collections: {
        todos: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            completed: S.Boolean(),
          }),
        },
      } satisfies Models,
    };
    const serverDb = new DB();
    const server = new TriplitServer(serverDb);
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
      schema: schema.collections,
      autoConnect: false,
    });
    const spy = spyMessages(client);
    client.connect();
    await pause();

    // No schema handshake because client is schemaless
    expect(spy.length).toEqual(1);
    expect(spy[0].direction).toEqual('RECEIVED');
    expect(spy[0].message.type).toEqual('READY');
    // Client state is correct
    // @ts-expect-error - private
    expect(client.syncEngine.serverReady).toBe(true);
    expect(client.syncEngine.connectionStatus).toEqual('OPEN');

    // Can write data and subscribe over transport
    const sub = vi.fn();
    const query = client.query('todos');
    client.subscribe(query, sub);
    await client.insert('todos', {
      id: '1',
      text: 'test',
      completed: false,
    });
    await pause();
    expect(sub.mock.calls.at(-1)).toEqual([
      [
        {
          id: '1',
          text: 'test',
          completed: false,
        },
      ],
    ]);
    // TODO: will throw, need to handle this
    // await serverDb.insert('todos', {
    //   id: '2',
    //   text: 1,
    //   done: false,
    // });
    // await pause();
  });

  it.skip('A schemaful client and schemaless server should not be able to sync', async () => {
    const schema = {
      collections: {
        todos: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            completed: S.Boolean(),
          }),
        },
      } satisfies Models,
    };
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
      schema: schema.collections,
      autoConnect: false,
    });
    const spy = spyMessages(client);
    client.connect();
    await pause();

    // Initial handshake fails
    expect(spy.length).toEqual(1);
    expect(spy[0].direction).toEqual('RECEIVED');
    expect(spy[0].message).toEqual({
      type: 'CLOSE',
      payload: {
        type: 'SCHEMA_MISMATCH',
        retry: false,
        message:
          'The server does not have a schema, but the connecting client does. The server may send un-handleable data and break the client application.',
      },
    });
  });
});

it.skip('Server will drop all current connections if a backwards incompatible change occurs', async () => {
  const schema = {
    collections: {
      todos: {
        schema: S.Schema({
          id: S.Id(),
          text: S.String(),
          completed: S.Boolean(),
        }),
      },
    },
  };
  using server = await tempTriplitServer({
    serverOptions: { dbOptions: { schema }, jwtSecret: SECRET },
  });
  const { port } = server;

  const http = new HttpClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });

  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
    schema: schema.collections,
  });
  const spy = spyMessages(client);
  await pause();

  // Make a compatible change
  {
    const { data, error } = await http
      // @ts-expect-error - private
      .sendRequest('/override-schema', 'POST', {
        schema: {
          collections: {
            todos: {
              schema: S.Schema({
                id: S.Id(),
                text: S.String(),
                completed: S.Boolean(),
                // Compatible change
                createdAt: S.Optional(S.Date({ default: S.Default.now() })),
              }),
            },
          },
        },
        failOnBackwardsIncompatibleChange: false,
      });
    if (error) throw error;
    if (!data.successful) throw new Error('Failed to update schema');
  }
  await pause();
  expect(client.connectionStatus).toEqual('OPEN');
  expect(receivedMessages(spy).filter((m) => m.type === 'CLOSE').length).toBe(
    0
  );
  {
    // Make an incompatible change
    const { data, error } = await http
      // @ts-expect-error - private
      .sendRequest('/override-schema', 'POST', {
        schema: {
          collections: {
            todos: {
              schema: S.Schema({
                id: S.Id(),
                text: S.String(),
                completed: S.Boolean(),
                createdAt: S.Optional(S.Date({ default: S.Default.now() })),
                // Incompatible change
                assignee: S.String(),
              }),
            },
          },
        },
        failOnBackwardsIncompatibleChange: false,
      });
    if (error) throw error;
    if (!data.successful) throw new Error('Failed to update schema');
  }
  await pause();
  expect(client.connectionStatus).toEqual('CLOSED');
  expect(receivedMessages(spy).filter((m) => m.type === 'CLOSE').length).toBe(
    1
  );
  const closeMessage = receivedMessages(spy).find((m) => m.type === 'CLOSE')!;
  expect(closeMessage.payload.type).toEqual('SCHEMA_MISMATCH');
});

// TODO: You can use client.onSyncMessageReceived, evaluate if we should have a specific event for this
// Also test any what you might do here, which is realistically tell the user to upgrade
it.todo('Client alerts if the schema is incompatible for sync');

// This is a local only test, move it there
it.todo(
  'Will let you know if you cannot upgrade your schema (local test) due to schema change'
  // and gives you option to clear data
);

// Probalby goes in some messaging.spec.ts
it.todo(
  'Will not send messages to the server until a READY message is received',
  async () => {}
);

// connection-changes.spec.ts
it.todo('Generally testing onOpen and onClose events');
// Reconnect will mount any current queries
// Will flush outbox
