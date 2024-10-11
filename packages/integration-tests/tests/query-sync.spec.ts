import { expect, it, describe } from 'vitest';
import { pause } from '../utils/async.js';
import { Server as TriplitServer } from '@triplit/server-core';
import DB from '@triplit/db';
import {
  MessageLog,
  MessageLogItem,
  SERVICE_KEY,
  createTestClient,
  spyMessages,
} from '../utils/client.js';

describe('CONNECT_QUERY message should be sent before DISCONNECT_QUERY', async () => {
  it('should not send disconnect before connect when immediately unsubscribing', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, SERVICE_KEY, { clientId: 'alice' });
    await pause();
    // Start message spy after connecting
    const messageLog = spyMessages(client);
    const query = client.query('test').build();
    const unsub = client.subscribe(query, () => {});
    unsub();
    await pause();
    const mappedMessages = mapMessages(messageLog, (message) => {
      return {
        type: message.type,
      };
    });
    expect(mappedMessages).toEqual([
      {
        direction: 'SENT',
        message: {
          type: 'CONNECT_QUERY',
        },
      },
      {
        direction: 'SENT',
        message: {
          type: 'DISCONNECT_QUERY',
        },
      },
      {
        direction: 'RECEIVED',
        message: {
          type: 'TRIPLES',
        },
      },
    ]);
  });

  it('should not send connect or disconnect if subscribed and unsubscribed will disconnected', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, SERVICE_KEY, {
      clientId: 'alice',
      autoConnect: false,
    });
    const messageLog = spyMessages(client);

    // Start message spy after connecting
    const query = client.query('test').build();
    const unsub = client.subscribe(query, () => {});
    await pause();
    unsub();
    await pause();
    client.connect();
    const mappedMessages = mapMessages(messageLog, (message) => {
      return {
        type: message.type,
      };
    });
    expect(mappedMessages).toHaveLength(0);
  });
});

function mapMessages(
  logs: MessageLog,
  callback: (message: MessageLogItem['message']) => any
) {
  return logs.map((log) => ({
    ...log,
    message: callback(log.message),
  }));
}
