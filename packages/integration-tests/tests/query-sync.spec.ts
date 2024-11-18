import { expect, it, describe, vi } from 'vitest';
import { pause } from '../utils/async.js';
import { QuerySyncError, Server as TriplitServer } from '@triplit/server-core';
import DB, { TriplitError } from '@triplit/db';
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
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
    });
    await pause();
    // Start message spy after connecting
    const messageLog = spyMessages(client);
    const query = client.query('test').build();
    const unsub = client.subscribe(query, () => {});
    await pause(1);
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

  it('should not send connect or disconnect if subscribed and unsubscribed while disconnected', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      token: SERVICE_KEY,
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

  it('should properly connect if subscribe -> unsubscribe -> subscribe in quick succession', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
    });
    await pause();
    const messageLog = spyMessages(client);
    const query = client.query('test').build();

    const unsubFirst = client.subscribe(query, () => {});
    unsubFirst();
    const resultCallbackSpy = vi.fn();
    const remoteResponseCallbackSpy = vi.fn();
    const unsubSecond = client.subscribe(query, resultCallbackSpy, () => {}, {
      onRemoteFulfilled: remoteResponseCallbackSpy,
    });
    await pause(300);
    expect(resultCallbackSpy).toHaveBeenCalled();
    expect(remoteResponseCallbackSpy).toHaveBeenCalled();
    // expect(resultCallbackSpy.lastCall.args[0].type).toBe('TRIPLES');
  });
});

describe('remote error handling', async () => {
  it('should call the error callback when the server sends QuerySyncError', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
    });
    const query = client.query('test').build();
    const errorCallback = vi.fn();
    client.subscribe(query, () => {}, errorCallback);
    //@ts-expect-error
    const queryId = client.syncEngine.queries.keys().next().value;
    await pause();
    server
      .getConnection('alice')
      ?.sendErrorResponse('CONNECT_QUERY', new QuerySyncError({}), {
        queryKey: queryId,
        innerError: new TriplitError('INNER_ERROR'),
      });
    await pause();
    expect(errorCallback).toHaveBeenCalledTimes(1);
    console.log(errorCallback.mock.calls);
    expect(errorCallback.mock.calls.at(-1)?.[0].name).toBe('QuerySyncError');
    // TODO: pass through inner error information
  });
  // This is current behavior, but may not be the desired behavior in the future
  it('should disconnect the query when the server sends an error', async () => {
    const server = new TriplitServer(new DB());
    const client = createTestClient(server, {
      clientId: 'alice',
      token: SERVICE_KEY,
    });
    const query = client.query('test').build();
    const errorCallback = vi.fn();
    client.subscribe(query, () => {}, errorCallback);
    //@ts-expect-error
    const queryId = client.syncEngine.queries.keys().next().value;
    await pause();
    server
      .getConnection('alice')
      ?.sendErrorResponse('CONNECT_QUERY', new QuerySyncError({}), {
        queryKey: queryId,
        innerError: new TriplitError('INNER_ERROR'),
      });
    await pause();
    expect(
      // @ts-expect-error
      client.syncEngine.queries.size
    ).toBe(0);
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
