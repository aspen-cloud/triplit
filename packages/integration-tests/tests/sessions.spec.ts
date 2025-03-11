import { expect, it, describe, vi, afterAll, beforeAll } from 'vitest';
import { tempTriplitServer } from '../utils/server.js';
import { TriplitClient } from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

import { Roles, Schema as S } from '@triplit/db';
import * as jose from 'jose';
import WebSocket from 'ws';
import { pause } from '../utils/async.js';

// @ts-expect-error
import workerUrl from '@triplit/client/worker-client-operator?url';

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

describe.each([TriplitClient, WorkerClient])('%O', (Client) => {
  describe('Session Management', async () => {
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
      client.updateSessionToken(await encodeToken(initialPayload, '30 min'));
      await pause(200);
      await client.insert('users', { id: '2', name: 'Bob' });
      dataResult = await client.fetch(client.query('users'));
      expect(dataResult.length).toBe(2);

      // End session
      client.endSession();
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
      await pause(50);
      alice.updateSessionToken(
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
      alice.updateSessionToken(await encodeToken(initialPayload));
      await bob.insert('users', { id: '2', name: 'Bob' });
      await pause(100);
      expect(aliceSubSpy.mock.lastCall?.[0]?.length).toBe(2);

      // Update session token without expiration time
      alice.updateSessionToken(await encodeToken(initialPayload, '1s'));

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
  });
});
