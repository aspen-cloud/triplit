import { it, describe, expect } from 'vitest';
import { Server as TriplitServer } from '@triplit/server-core';
import { DB, hashQuery } from '@triplit/entity-db';
import {
  createTestClient,
  MessageLogItem,
  SERVICE_KEY,
  spyMessages,
} from '../utils/client.js';
import { pause } from '../utils/async.js';

describe('Constructor autoConnect', () => {
  it.todo(
    'A client will attempt to connect to the server on construction if autoConnect is true'
  );
  it.todo(
    'A client will not attempt to connect to the server on construction if autoConnect is false'
  );
});
describe('Connecting a client', () => {
  it.todo('Calling client.connect() will attempt to connect to the server');
  it.todo('Calling client.connect() multiple times is a no-op');
  it('After disconnecting, calling connect() will reconnect and restart syncing', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
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
  it.todo(
    'Calling client.disconnect() will attempt to disconnect from the server'
  );
  it.todo('Calling client.disconnect() multiple times is a no-op');
});

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
