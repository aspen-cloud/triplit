import { it, describe, expect } from 'vitest';
import { hashQuery, Schema as S } from '@triplit/db';
import { MessageLogItem, spyMessages } from '../utils/client.js';
import { pause } from '../utils/async.js';
import { withWebsocketStub } from '../utils/websockets.js';
import { TriplitClient } from '@triplit/client';
import { tempTriplitServer } from '../utils/server.js';
import { Logger } from '@triplit/logger';
import { LogHandlerSpy } from '../utils/logging.js';

const serviceToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoicHJvamVjdCJ9.gcDKyZU9wf8o43Ca9kUVXO4KsGwX8IhhyEg1PO1ZqiQ';

describe('Constructor autoConnect', () => {
  it(
    'A client will attempt to connect to the server on construction if autoConnect is true',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: true,
      });
      await pause();
      expect(openSockets.size).toBe(1);
      expect(client.connectionStatus).toBe('OPEN');
    })
  );
  it(
    'A client will not attempt to connect to the server on construction if autoConnect is false',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: false,
      });
      await pause();
      expect(openSockets.size).toBe(0);
      expect(client.connectionStatus).toBe('UNINITIALIZED');
    })
  );
});
describe('Connecting a client', () => {
  it(
    'Calling client.connect() will attempt to connect to the server',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: false,
      });
      await pause();
      expect(openSockets.size).toBe(0);
      expect(client.connectionStatus).toBe('UNINITIALIZED');
      client.connect();
      await pause();
      expect(openSockets.size).toBe(1);
      expect(client.connectionStatus).toBe('OPEN');
    })
  );
  it(
    'Calling client.connect() multiple times is a no-op',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: true,
      });
      const messageSpy = spyMessages(client);
      client.connect();
      client.connect();
      client.connect();
      client.connect();
      client.connect();
      await pause();
      // Only one socket open
      expect(openSockets.size).toBe(1);
      // Only one ready message sent
      expect(messageSpy.filter(serverReadyMessages).length).toBe(1);
    })
  );
  it('A client will warn if not enough information to connect is provided', async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        jwtSecret: 'test-secret',
      },
    });
    const { port } = server;
    {
      // No params
      const handlerSpy = new LogHandlerSpy();
      const client = new TriplitClient({
        autoConnect: true,
        logger: new Logger([handlerSpy]),
      });
      await pause();
      expect(handlerSpy.logs.length).toBe(1);
      const log = handlerSpy.logs[0];
      expect(log.level).toBe('WARN');
      expect(log.message).toBe(
        'You are attempting to connect to the server but no session is defined. Please ensure you are providing a token and serverUrl in the TriplitClient constructor or run startSession(token) to setup a session.'
      );
    }
    {
      // Missing token
      const handlerSpy = new LogHandlerSpy();
      const client = new TriplitClient({
        serverUrl: `http://localhost:${port}`,
        autoConnect: true,
        logger: new Logger([handlerSpy]),
      });
      await pause();
      expect(handlerSpy.logs.length).toBe(1);
      const log = handlerSpy.logs[0];
      expect(log.level).toBe('WARN');
      expect(log.message).toBe(
        'You are attempting to connect to the server but no session is defined. Please ensure you are providing a token and serverUrl in the TriplitClient constructor or run startSession(token) to setup a session.'
      );
    }
    {
      const handlerSpy = new LogHandlerSpy();
      const client = new TriplitClient({
        // Missing serverUrl
        token: serviceToken,
        autoConnect: true,
        logger: new Logger([handlerSpy]),
      });
      await pause();
      expect(handlerSpy.logs.length).toBe(1);
      const log = handlerSpy.logs[0];
      expect(log.level).toBe('WARN');
      expect(log.message).toBe(
        'You are attempting to connect but the connection cannot be opened because the required parameters are missing: [serverUrl].'
      );
    }
  });
  it('After disconnecting, calling connect() will reconnect and restart syncing', async () => {
    using server = await tempTriplitServer({
      serverOptions: {
        jwtSecret: 'test-secret',
      },
    });
    const { port } = server;
    const client = new TriplitClient({
      serverUrl: `http://localhost:${port}`,
      token: serviceToken,
      autoConnect: true,
    });
    const spy1 = spyMessages(client);
    const query1 = client.query('test');
    const qid1 = hashQuery(query1);
    const query2 = client.query('test2');
    const qid2 = hashQuery(query2);

    // Subscribe to two queries, we should see CONNECT_QUERY messages for both after first and second connections
    client.subscribe(query1, () => {});
    client.subscribe(query2, () => {});
    await pause();

    // Connection is open
    expect(client.connectionStatus).toBe('OPEN');
    // Spy has ready message
    expect(spy1.filter(serverReadyMessages).length).toBe(1);
    // Spy should have two query connect messages
    expect(spy1.filter(sentConnectQueryMessages).length).toBe(2);
    expect(
      spy1.find((m) => sentConnectQueryMessageForQuery(m, qid1))
    ).toBeDefined();
    expect(
      spy1.find((m) => sentConnectQueryMessageForQuery(m, qid2))
    ).toBeDefined();

    // Disconnect the client
    client.disconnect();
    await pause();

    // Connection should now be closed
    expect(client.connectionStatus).toBe('CLOSED');

    // Create a new spy to capture reconnect messages
    const spy2 = spyMessages(client);
    // Reconnect the client
    client.connect();
    await pause();

    // Connection should now be open
    expect(client.connectionStatus).toBe('OPEN');
    // sanity check (2 initial connect_query messages, 2 connect_query messages after reconnect)
    expect(spy1.filter(serverReadyMessages).length).toBe(2);
    expect(spy1.filter(sentConnectQueryMessages).length).toBe(4);

    // Spy after reconnecting has ready message
    expect(spy2.filter(serverReadyMessages).length).toBe(1);
    // Spy after reconnecting should have two query connect messages
    expect(spy2.filter(sentConnectQueryMessages).length).toBe(2);
    expect(
      spy2.find((m) => sentConnectQueryMessageForQuery(m, qid1))
    ).toBeDefined();
    expect(
      spy2.find((m) => sentConnectQueryMessageForQuery(m, qid2))
    ).toBeDefined();
  });
});
describe('Disconnecting a client', () => {
  it(
    'Calling client.disconnect() will attempt to disconnect from the server',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: true,
      });
      await pause();
      expect(openSockets.size).toBe(1);
      client.disconnect();
      await pause();
      expect(openSockets.size).toBe(0);
    })
  );
  it(
    'can connect and disconnect immediately and no socket will remain open - auto connection',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: true,
      });
      client.disconnect();
      await pause();
      expect(openSockets.size).toBe(0);
    })
  );
  it(
    'can connect and disconnect immediately and no socket will remain open - manual connection',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: false,
      });
      client.connect();
      client.disconnect();
      await pause();
      expect(openSockets.size).toBe(0);
    })
  );
  it(
    'Calling client.disconnect() multiple times is a no-op',
    withWebsocketStub(async ({ openSockets }) => {
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            age: S.Number(),
          }),
        },
      });
      using server = await tempTriplitServer({
        serverOptions: {
          dbOptions: {
            schema: { collections: schema },
          },
          jwtSecret: 'test-secret',
        },
      });
      const { port } = server;
      const client = new TriplitClient({
        schema,
        serverUrl: `http://localhost:${port}`,
        token: serviceToken,
        autoConnect: true,
      });
      client.disconnect();
      client.disconnect();
      client.disconnect();
      client.disconnect();
      client.disconnect();
      client.disconnect();
      client.disconnect();
      await pause();
      expect(openSockets.size).toBe(0);
    })
  );
});

// TODO: disconnect, reconnect in succession -> not restarting sycing

function sentConnectQueryMessageForQuery(log: MessageLogItem, qid: string) {
  return (
    log.direction === 'SENT' &&
    log.message.type === 'CONNECT_QUERY' &&
    log.message.payload.id === qid
  );
}

function sentConnectQueryMessages(log: MessageLogItem) {
  return log.direction === 'SENT' && log.message.type === 'CONNECT_QUERY';
}

function serverReadyMessages(log: MessageLogItem) {
  return log.direction === 'RECEIVED' && log.message.type === 'READY';
}
