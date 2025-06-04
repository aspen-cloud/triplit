import { expect, it, describe, vi, afterAll, beforeAll } from 'vitest';
import { tempTriplitServer } from '../utils/server.js';
import { TriplitClient } from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

import { Models, Roles, Schema as S } from '@triplit/db';
import * as jose from 'jose';
import { pause } from '../utils/async.js';

// @ts-expect-error
import workerUrl from '@triplit/client/worker-client-operator?url';
import { spyMessages } from '../utils/client.js';

const initialPayload = {
  'x-triplit-token-type': 'anon',
};

const JWT_SECRET = new TextEncoder().encode('test-secret');

async function encodeToken(payload: any, exp?: string) {
  let token = new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' });
  if (exp) {
    token = token.setExpirationTime(exp);
  }
  return await token.sign(JWT_SECRET);
}

// process.env.PROJECT_ID = 'project';
// process.env.JWT_SECRET = 'test-secret';

beforeAll(() => {
  vi.stubEnv('JWT_SECRET', 'test-secret');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

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

function isTriplitClient<M extends Models<M>>(
  client: TriplitClient<M> | WorkerClient<M>
): client is TriplitClient<M> {
  return client.constructor.name === 'TriplitClient';
}

describe.each([TriplitClient, WorkerClient])('%O', (Client) => {
  describe('Session Management', async () => {
    it('if no token is provided, a session will not start automatically', async () => {
      using server = await tempTriplitServer();
      const { port } = server;
      const client = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        autoConnect: false,
      });
      const connectionSpy = vi.fn();
      client.onConnectionStatusChange(connectionSpy, true);
      await pause(500);
      if (isTriplitClient(client)) {
        expect(client.token).toBeUndefined();
        expect(client.syncEngine.currentSession).toBeUndefined();
      }
      expect(client.connectionStatus).toBe('UNINITIALIZED');
      expect(connectionSpy.mock.calls).toEqual([['UNINITIALIZED']]);
    });
    it('providing a token in the constructor will start a session automatically', async () => {
      using server = await tempTriplitServer();
      const { port } = server;
      const token = await encodeToken(initialPayload, '30 min');
      const client = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token,
        autoConnect: false,
      });
      const connectionSpy = vi.fn();
      client.onConnectionStatusChange(connectionSpy, true);
      await pause(500);
      // TODO: handle additional accessors in WorkerClient
      if (isTriplitClient(client)) {
        expect(client.token).toBe(token);
        expect(client.syncEngine.currentSession).toBeDefined();
      }
      expect(client.connectionStatus).toBe('UNINITIALIZED');
      expect(connectionSpy.mock.calls).toEqual([['UNINITIALIZED']]);
    });
    it('providing a token and autoConnect will start a session and connect automatically', async () => {
      using server = await tempTriplitServer();
      const { port } = server;
      const token = await encodeToken(initialPayload, '30 min');
      const client = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token,
        autoConnect: true,
      });
      const connectionSpy = vi.fn();
      client.onConnectionStatusChange(connectionSpy, true);
      await pause(500);
      if (isTriplitClient(client)) {
        expect(client.token).toBe(token);
        expect(client.syncEngine.currentSession).toBeDefined();
      }

      expect(client.connectionStatus).toBe('OPEN');
      if (isTriplitClient(client)) {
        expect(connectionSpy.mock.calls).toEqual([
          ['UNINITIALIZED'],
          ['CONNECTING'],
          ['OPEN'],
        ]);
      } else {
        // Some asynchrony causes us to miss the initial 'UNINITIALIZED' state (by the time we "runImmediately", the connection is CONNECTING)
        expect(connectionSpy.mock.calls).toEqual([['CONNECTING'], ['OPEN']]);
      }
    });
    it('manually starting a session will connect unless specified otherwise', async () => {
      using server = await tempTriplitServer();
      const { port } = server;
      {
        const client = new Client({
          workerUrl,
          serverUrl: `http://localhost:${port}`,
          autoConnect: false,
        });
        const connectionSpy = vi.fn();
        client.onConnectionStatusChange(connectionSpy, true);
        // Worker client taking a bit to pick up the connection status change call
        await pause(500);
        expect(client.connectionStatus).toBe('UNINITIALIZED');
        expect(connectionSpy.mock.calls).toEqual([['UNINITIALIZED']]);

        const token = await encodeToken(initialPayload, '30 min');
        await client.startSession(token);
        await pause();
        if (isTriplitClient(client)) {
          expect(client.token).toBe(token);
          expect(client.syncEngine.currentSession).toBeDefined();
        }
        expect(client.connectionStatus).toBe('OPEN');
        expect(connectionSpy.mock.calls).toEqual([
          ['UNINITIALIZED'],
          ['CONNECTING'],
          ['OPEN'],
        ]);
      }
      // Specify `connect: false`
      {
        const client = new Client({
          workerUrl,
          serverUrl: `http://localhost:${port}`,
          autoConnect: false,
        });
        const connectionSpy = vi.fn();
        client.onConnectionStatusChange(connectionSpy, true);
        await pause();
        expect(client.connectionStatus).toBe('UNINITIALIZED');
        expect(connectionSpy.mock.calls).toEqual([['UNINITIALIZED']]);

        const token = await encodeToken(initialPayload, '30 min');
        await client.startSession(token, false);
        await pause();
        if (isTriplitClient(client)) {
          expect(client.token).toBe(token);
          expect(client.syncEngine.currentSession).toBeDefined();
        }
        expect(client.connectionStatus).toBe('UNINITIALIZED');
        expect(connectionSpy.mock.calls).toEqual([['UNINITIALIZED']]);
      }
    });
    it('can start, update, and end a session', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const client = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        autoConnect: true,
        schema: DEFAULT_SCHEMA.collections,
      });

      const initialToken = await encodeToken(initialPayload, '30 min');

      // Start session
      await client.startSession(initialToken);
      const connectionSpy = vi.fn();
      const sessionErrorSpy = vi.fn();
      client.onSessionError(sessionErrorSpy);
      await pause(200);
      client.onConnectionStatusChange(connectionSpy, true);
      console.log(connectionSpy.mock.calls);
      await client.insert('users', { id: '1', name: 'Alice' });
      let dataResult = await client.fetch(client.query('users'));
      expect(dataResult.length).toBe(1);

      // Update session token
      await client.updateSessionToken(
        await encodeToken(initialPayload, '30 min')
      );
      await pause(200);
      await client.insert('users', { id: '2', name: 'Bob' });
      dataResult = await client.fetch(client.query('users'));
      expect(dataResult.length).toBe(2);

      // End session
      await client.endSession();
      await pause(200);
      expect(sessionErrorSpy).not.toHaveBeenCalled();
      // expect(client.connectionStatus).toBe('CLOSED');
    });
    it('can start a session with the startSession method', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;

      const bob = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        schema: DEFAULT_SCHEMA.collections,
      });

      const newToken = await encodeToken(initialPayload, '30 min');
      await bob.startSession(newToken);
      await pause(200);
      await bob.insert('users', { id: '1', name: 'Alice' });
    });
    it('will gracefully end the old session and start another one if you call startSession in succession', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const client = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        autoConnect: true,
        schema: DEFAULT_SCHEMA.collections,
      });

      const bob = new TriplitClient({
        serverUrl: `http://localhost:${port}`,
        schema: DEFAULT_SCHEMA.collections,
        token: await encodeToken(initialPayload, '30 min'),
      });

      const initialToken = await encodeToken(initialPayload, '30 min');

      // Start session
      await client.startSession(initialToken);
      const sessionErrorSpy = vi.fn();
      client.onSessionError(sessionErrorSpy);
      await pause(60);
      const subSpy = vi.fn();
      client.subscribe(client.query('users'), subSpy);
      await pause(60);
      await bob.insert('users', { id: '1', name: 'Alice' });
      await pause(100);
      expect(subSpy.mock.lastCall).toEqual([[{ id: '1', name: 'Alice' }]]);

      // Start another session
      const newToken = await encodeToken(initialPayload, '10 min');
      await client.startSession(newToken);
      await pause(60);
      await bob.insert('users', { id: '2', name: 'Bob' });
      await pause(60);
      // continues syncing
      expect(subSpy.mock.lastCall).toEqual([
        [
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ],
      ]);
    });

    it('server wont accept messages from clients with expired tokens', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        autoConnect: true,
        schema: DEFAULT_SCHEMA.collections,
      });
      // can't have two worker clients in the same test
      const bob = new TriplitClient({
        serverUrl: `http://localhost:${port}`,
        schema: DEFAULT_SCHEMA.collections,
      });

      const initialToken = await encodeToken(initialPayload, '1 sec');

      // Start session
      await alice.startSession(initialToken);
      const connectionSpy = vi.fn();
      const sessionErrorSpy = vi.fn();
      alice.onSessionError(sessionErrorSpy);
      await pause(200);
      alice.onConnectionStatusChange(connectionSpy, true);
      expect(sessionErrorSpy).not.toHaveBeenCalled();
      // expect(connectionSpy).toHaveBeenCalledWith('OPEN');
      await pause(800);
      await alice.insert('users', { id: '1', name: 'Alice' });
      await pause(50);
      expect(sessionErrorSpy).toHaveBeenCalledWith('TOKEN_EXPIRED');
      const newToken = await encodeToken(initialPayload, '30 min');
      await bob.startSession(newToken);
      const bobSpy = vi.fn();
      bob.subscribe(bob.query('users'), bobSpy);
      await pause(50);
      // Alice wasn't inserted, so it shouldn't sync to bob
      expect(bobSpy).toHaveBeenCalled();
      expect(bobSpy.mock.lastCall?.[0]).toStrictEqual([]);
    });

    it('server wont send messages to clients with expired sessions', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const aliceToken = await encodeToken(initialPayload, '2 sec');
      const bobToken = await encodeToken(initialPayload, '5 min');
      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token: aliceToken,
        schema: DEFAULT_SCHEMA.collections,
      });
      const bob = new TriplitClient({
        serverUrl: `http://localhost:${port}`,
        schema: DEFAULT_SCHEMA.collections,
        token: bobToken,
      });
      // Start session
      const aliceSubSpy = vi.fn();
      const sessionErrorSpy = vi.fn();
      alice.onSessionError(sessionErrorSpy);
      alice.subscribe(alice.query('users'), aliceSubSpy);
      await pause(200);
      expect(sessionErrorSpy).not.toHaveBeenCalledWith('EXPIRED_TOKEN');
      expect(aliceSubSpy).toHaveBeenCalledTimes(1);
      await pause(1800);
      await bob.insert('users', { id: '1', name: 'Alice' });
      await pause(50);
      expect(sessionErrorSpy).toHaveBeenCalled();
      expect(aliceSubSpy).toHaveBeenCalledTimes(1);
      // connection closed, so the insert didn't sync
      expect(aliceSubSpy.mock.lastCall?.[0]).toStrictEqual([]);
    });
    it('will reject token updates for tokens with different roles', async () => {
      const roles: Roles = {
        admin: {
          match: {
            'x-triplit-token-type': 'secret',
          },
        },
      };
      const schema = {
        collections: {
          users: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
            }),
          },
        },
        roles,
      };
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema } },
      });
      const { port } = server;
      const aliceToken = await encodeToken(initialPayload, '30 min');
      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token: aliceToken,
        schema: schema.collections,
      });
      const sessionErrorSpy = vi.fn();
      alice.onSessionError(sessionErrorSpy);
      await pause(500);
      await alice.updateSessionToken(
        await encodeToken({ 'x-triplit-token-type': 'secret' }, '30 min')
      );
      await pause(50);
      expect(sessionErrorSpy).toHaveBeenCalledWith('ROLES_MISMATCH');
    });
    it("tokens without an expiration time are allowed, don't expire, and can be updated with tokens that do or don't have an expiration time", async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const initialToken = await encodeToken(initialPayload);

      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token: initialToken,
        schema: DEFAULT_SCHEMA.collections,
      });

      const bob = new TriplitClient({
        serverUrl: `http://localhost:${port}`,
        schema: DEFAULT_SCHEMA.collections,
        token: initialToken,
      });

      // Start session
      const sessionErrorSpy = vi.fn();
      const aliceSubSpy = vi.fn();
      alice.onSessionError(sessionErrorSpy);

      alice.subscribe(alice.query('users'), aliceSubSpy);
      await pause(100);
      expect(sessionErrorSpy).not.toHaveBeenCalled();
      await bob.insert('users', { id: '1', name: 'Alice' });
      await pause(100);
      expect(aliceSubSpy.mock.lastCall?.[0]?.length).toBe(1);

      // Update session token with no expiration time
      await alice.updateSessionToken(await encodeToken(initialPayload));
      await bob.insert('users', { id: '2', name: 'Bob' });
      await pause(100);
      expect(aliceSubSpy.mock.lastCall?.[0]?.length).toBe(2);

      // Update session token without expiration time
      await alice.updateSessionToken(await encodeToken(initialPayload, '1s'));

      await pause(1050);
      await bob.insert('users', { id: '3', name: 'Charlie' });
      await pause(200);
      expect(aliceSubSpy.mock.lastCall?.[0]?.length).toBe(2);
      expect(sessionErrorSpy).toHaveBeenCalledWith('TOKEN_EXPIRED');
    });
    it('tokens that are expired at the start of the session will be refreshed if a handler is provided', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const initialToken = await encodeToken(initialPayload, '-1 sec');

      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token: initialToken,
        schema: DEFAULT_SCHEMA.collections,
        refreshOptions: {
          refreshHandler: async () => {
            return await encodeToken(initialPayload, '2 sec');
          },
        },
      });

      const bob = new TriplitClient({
        serverUrl: `http://localhost:${port}`,
        schema: DEFAULT_SCHEMA.collections,
        token: initialToken,
        refreshOptions: {
          refreshHandler: async () => {
            return await encodeToken(initialPayload, '2 sec');
          },
        },
      });

      // Start session
      const sessionErrorSpy = vi.fn();
      const aliceSubSpy = vi.fn();
      alice.onSessionError(sessionErrorSpy);

      alice.subscribe(alice.query('users'), aliceSubSpy);
      await pause(100);
      expect(sessionErrorSpy).not.toHaveBeenCalled();
      expect(aliceSubSpy.mock.lastCall?.[0]?.length).toBe(0);
      await bob.insert('users', { id: '1', name: 'Alice' });
      await pause(100);
      expect(aliceSubSpy.mock.lastCall?.[0]?.length).toBe(1);
    });
    it('token refreshes occur in the background and do not impact connection status', async () => {
      using server = await tempTriplitServer();
      const { port } = server;
      const initialToken = await encodeToken(initialPayload, '-1 sec');
      function getToken() {
        return encodeToken(initialPayload, '1 sec');
      }
      let refreshCount = 0;
      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        token: initialToken,
        schema: DEFAULT_SCHEMA.collections,
        refreshOptions: {
          refreshHandler: async () => {
            refreshCount++;
            return await getToken();
          },
          interval: 1000,
        },
      });
      const connectionSpy = vi.fn();
      const sessionErrorSpy = vi.fn();
      alice.onConnectionStatusChange(connectionSpy, true);
      alice.onSessionError(sessionErrorSpy);
      await pause(3000);
      expect(refreshCount).toBeGreaterThan(0);
      // Stays open with no thrashing
      expect(connectionSpy.mock.calls).toEqual([
        ['UNINITIALIZED'],
        ['CONNECTING'],
        ['OPEN'],
      ]);
      // no session errors
      expect(sessionErrorSpy).not.toHaveBeenCalled();
    });
    it('server rejects starting a token with an expired session', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;
      const sessionErrorSpy = vi.fn();
      const alice = new Client({
        clientId: 'alice',
        onSessionError: sessionErrorSpy,
        autoConnect: false,
        serverUrl: `http://localhost:${port}`,
      });
      const messageSpy = spyMessages(alice);
      const expiredToken = await encodeToken(initialPayload, '-1 sec');
      await alice.startSession(expiredToken, true);
      await pause();
      expect(sessionErrorSpy.mock.calls.length).toBe(1);
      expect(sessionErrorSpy.mock.calls[0][0]).toBe('UNAUTHORIZED');
      expect(messageSpy.length).toBe(1);
      const closeMessage = messageSpy[0];
      expect(closeMessage.direction).toBe('RECEIVED');
      expect(closeMessage.message.type).toBe('CLOSE');
      // @ts-expect-error
      expect(closeMessage.message.payload.type).toBe('UNAUTHORIZED');
      expect(alice.connectionStatus).toBe('CLOSED');
    });
    it('endSession() will disconnect the client and clear the token, state vectors, and saved roles', async () => {
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

      const server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: { collections, roles } } },
      });
      const { port } = server;
      const token = await encodeToken(
        { 'x-triplit-token-type': 'secret' },
        '30 min'
      );
      const bob = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        autoConnect: true,
        token: token,
        roles,
        schema: collections,
      });
      await pause(500);
      expect(bob.connectionStatus).toBe('OPEN');
      if (isTriplitClient(bob)) {
        expect(bob.token).toBe(token);
      }
      const query = bob.query('test');
      bob.subscribe(query, () => {});
      await pause();
      if (isTriplitClient(bob)) {
        // @ts-expect-error (not exposed)
        expect(bob.syncEngine.queries.size).toBe(1);
      }
      // validate the state after the session ends
      await bob.endSession();
      await pause(500);
      expect(bob.connectionStatus).toBe('UNINITIALIZED');
      if (isTriplitClient(bob)) {
        expect(bob.token).toBe(undefined);
        // @ts-expect-error (not exposed)
        expect(bob.syncEngine.queries.size).toBe(1);
      }
    });

    it('can setup a refresh handler to continuously refresh the session token which will clear when you end session', async () => {
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
      const server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: { collections, roles } } },
      });
      const { port } = server;
      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        autoConnect: false,
        schema: collections,
        roles,
      });
      // create tokens that expire every 2000ms
      const EXPIRE_TIME = 2000;
      function getToken() {
        return encodeToken(
          {
            'x-triplit-token-type': 'secret',
          },
          '2 sec'
        );
      }

      const refreshTracker = vi.fn();

      await alice.startSession(await getToken(), true, {
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
      const endRefresh = await alice.startSession(await getToken(), true, {
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
  });

  describe('Token checking', () => {
    // TODO: this check occurs on the server, is it possible you'll start a session / sign in, but offline and cause issues?
    it('server will reject non jwt token values with UNAUTHORIZED', async () => {
      using server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: DEFAULT_SCHEMA } },
      });
      const { port } = server;

      {
        // Using TriplitClient constructor
        const sessionErrorSpy = vi.fn();
        const client = new Client({
          serverUrl: `http://localhost:${port}`,
          token: 'invalid-token',
          schema: DEFAULT_SCHEMA.collections,
          onSessionError: sessionErrorSpy,
        });
        // Lots of async calls in worker client init
        // A little concerning its taking > default pause time
        await pause(500);
        expect(sessionErrorSpy).toHaveBeenCalledWith('UNAUTHORIZED');
      }
      {
        // Using .startSession()
        const client = new Client({
          workerUrl,
          serverUrl: `http://localhost:${port}`,
          autoConnect: false,
          schema: DEFAULT_SCHEMA.collections,
        });
        const invalidToken = 'invalid-token';
        const sessionErrorSpy = vi.fn();
        client.onSessionError(sessionErrorSpy);
        await pause();
        expect(sessionErrorSpy).not.toHaveBeenCalled();
        await client.startSession(invalidToken);
        await pause();
        expect(sessionErrorSpy).toHaveBeenCalledWith('UNAUTHORIZED');
      }
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
      const server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: { roles, collections } } },
      });
      const { port } = server;
      const token1 = await encodeToken(
        { 'x-triplit-token-type': 'secret' },
        '30 min'
      );
      const token2 = await encodeToken(
        { 'x-triplit-token-type': 'test' },
        '30 min'
      );
      const alice = new Client({
        schema: collections,
        roles,
        token: token1,
        serverUrl: `http://localhost:${port}`,
        workerUrl,
      });
      // kind of tricky -- this is reliant on some async initialization in the client
      await pause();
      await safeExpectError(
        () => alice.updateSessionToken(token2),
        'SessionRolesMismatchError'
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
      const server = await tempTriplitServer({
        serverOptions: { dbOptions: { schema: { roles, collections } } },
      });
      const { port } = server;
      const token = await encodeToken(
        { 'x-triplit-token-type': 'secret' },
        '30 min'
      );
      const alice = new Client({
        workerUrl,
        serverUrl: `http://localhost:${port}`,
        schema: collections,
        roles,
        token,
      });
      const expiredToken = await encodeToken(
        { 'x-triplit-token-type': 'secret' },
        '-1 sec'
      );
      await safeExpectError(
        () => alice.updateSessionToken(expiredToken),
        'TokenExpiredError'
      );
    });
    it('will throw an error if you attempt to update the session token while no session is active', async () => {
      const server = await tempTriplitServer();
      const token = await encodeToken(initialPayload, '30 min');
      const alice = new Client({
        serverUrl: `http://localhost:${server.port}`,
        workerUrl,
        autoConnect: false,
      });
      await safeExpectError(
        () => alice.updateSessionToken(token),
        'NoActiveSessionError'
      );
    });
  });
});

async function safeExpectError(
  fn: () => void | Promise<void>,
  errorName: string
) {
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  expect(error?.name).toBe(errorName);
}
