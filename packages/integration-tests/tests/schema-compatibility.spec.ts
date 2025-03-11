import { expect, it, describe, vi } from 'vitest';
import { Server as TriplitServer } from '@triplit/server-core';
import { createTestClient, SERVICE_KEY, spyMessages } from '../utils/client.js';
import { DB, Models, Schema as S } from '@triplit/db';
import { pause } from '../utils/async.js';

it('Should allow a client with the same schema to sync', async () => {
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

it('Should allow clients that are compatible to sync', async () => {
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
    bob: 'test',
  });

  expect(subBob.mock.calls.at(-1)?.[0].length).toEqual(2);
  expect(subBob.mock.calls.at(-1)?.[0]).toContainEqual({
    id: '1',
    text: 'test',
    completed: false,
    alice: 'test',
  });
  expect(subBob.mock.calls.at(-1)?.[0]).toContainEqual({
    id: '2',
    text: 'test',
    completed: false,
    bob: 'test',
  });
});

it('Should not allow clients to are incompatible to sync', async () => {
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
it('Schema handshake will only occur on first connection with schema', async () => {
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

  it('A schemaful client and schemaless server should not be able to sync', async () => {
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

// This is the safe thing to do on a schema change
// We could do it on every change, or just on incompatible changes
it.todo(
  'Server will re-check connections if a backwards incompatible change occurs'
);

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
