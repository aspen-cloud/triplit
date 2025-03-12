import { expect, it, beforeAll, afterAll, vi } from 'vitest';
import { tempTriplitServer } from '../utils/server.js';
import { TriplitClient } from '@triplit/client';
import { pause } from '../utils/async.js';
import { encodeToken } from '../utils/token.js';
const SECRET = 'test-secret';

const serviceToken = await encodeToken(
  { 'x-triplit-token-type': 'secret' },
  SECRET
);

beforeAll(() => {
  vi.stubEnv('JWT_SECRET', SECRET);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

it("isFirstTimeFetchingQuery should return true if the query has not been fetching before or if the server hasn't responded yet", async () => {
  await using server = await tempTriplitServer();
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await pause(60);
  const query = client.query('users');
  expect(await client.isFirstTimeFetchingQuery(query)).toBe(true);
  await client.fetch(query);
  expect(await client.isFirstTimeFetchingQuery(query)).toBe(false);

  const subscriptionQuery = client.query('developers');
  expect(await client.isFirstTimeFetchingQuery(subscriptionQuery)).toBe(true);
  client.subscribe(
    subscriptionQuery,
    () => {},
    () => {}
  );
  expect(await client.isFirstTimeFetchingQuery(subscriptionQuery)).toBe(true);
  await pause(60);
  expect(await client.isFirstTimeFetchingQuery(subscriptionQuery)).toBe(false);
});

it('onConnectionStatusChange should reflect the correct connection status', async () => {
  await using server = await tempTriplitServer();
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  const statuses: string[] = [];
  client.onConnectionStatusChange((status) => {
    statuses.push(status);
  }, true);
  expect(statuses).toEqual(['UNINITIALIZED']);
  await pause(60);
  expect(statuses).toEqual(['UNINITIALIZED', 'CONNECTING', 'OPEN']);
  client.disconnect();
  await pause(60);
  expect(statuses).toEqual(['UNINITIALIZED', 'CONNECTING', 'OPEN', 'CLOSED']);
});

it("if the query hasn't been seen before, subscribeWithStatus.fetching should turn false after a response from the server has occurred", async () => {
  await using server = await tempTriplitServer();
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await client.insert('users', { id: '1', name: 'John' });
  await pause(20);
  const query = client.query('users');
  const states: any[] = [];

  client.subscribeWithStatus(query, (state) => {
    states.push(state);
  });
  await pause(20);
  expect(states).toEqual([
    // immediate initial result
    {
      results: undefined,
      error: undefined,
      fetching: true,
      fetchingLocal: true,
      fetchingRemote: false,
    },
    // local optimistic result returns
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: true,
      fetchingLocal: false,
      fetchingRemote: false,
    },
    // remote sync has started, fetching and fetchingRemote turns true
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: true,
      fetchingLocal: false,
      fetchingRemote: true,
    },
    // remote results, no change but fetching and fetchingRemote turns false
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: false,
      fetchingLocal: false,
      fetchingRemote: false,
    },
  ]);
});

it('if the query has been seen before, subscribeWithStatus.fetching should turn false after the initial optimistic fetch is done', async () => {
  await using server = await tempTriplitServer();
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await pause(20);
  const query = client.query('users');
  await client.fetch(query);
  await client.insert('users', { id: '1', name: 'John' });
  await pause(20);

  const states: any[] = [];

  client.subscribeWithStatus(query, (state) => {
    states.push(state);
  });
  await pause(20);
  expect(states).toEqual([
    // immediate initial result
    {
      results: undefined,
      error: undefined,
      fetching: true,
      fetchingLocal: true,
      fetchingRemote: false,
    },
    // local result returns
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: false,
      fetchingLocal: false,
      fetchingRemote: false,
    },
    // remote sync has started, fetchingRemote turns true but fetching is still false
    // because we have suitable local results
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: false,
      fetchingLocal: false,
      fetchingRemote: true,
    },
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: false,
      fetchingLocal: false,
      fetchingRemote: false,
    },
  ]);
});
it('when the client is not connected to a server, subscribeWithStatus.fetching should be true only as long as subscribeWithStatus.fetchingLocal is true, and subscribeWithStatus.fetchingRemote should end on false', async () => {
  const client = new TriplitClient();
  await pause(20);
  const query = client.query('users');
  // await client.fetch(query);
  await client.insert('users', { id: '1', name: 'John' });
  await pause(20);

  const states: any[] = [];

  client.subscribeWithStatus(query, (state) => {
    states.push(state);
  });
  await pause(20);
  expect(states).toEqual([
    // immediate initial result
    {
      results: undefined,
      error: undefined,
      fetching: true,
      fetchingLocal: true,
      fetchingRemote: false,
    },
    // optimistic result returns
    // fetchingRemote should be false
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: false,
      fetchingLocal: false,
      fetchingRemote: false,
    },
  ]);
});
it('subscribeWithStatus should have the correct states for a local-only query', async () => {
  await using server = await tempTriplitServer();
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
  });
  await pause(20);
  const query = client.query('users');
  await client.insert('users', { id: '1', name: 'John' });
  await pause(20);

  const states: any[] = [];

  client.subscribeWithStatus(
    query,
    (state) => {
      states.push(state);
    },
    { localOnly: true }
  );
  await pause(20);
  expect(states).toEqual([
    // immediate initial result
    {
      results: undefined,
      error: undefined,
      fetching: true,
      fetchingLocal: true,
      fetchingRemote: false,
    },
    // local result returns
    {
      results: [{ id: '1', name: 'John' }],
      error: undefined,
      fetching: false,
      fetchingLocal: false,
      fetchingRemote: false,
    },
  ]);
});
it('should have the correct state for a client has autoconnect:false but then connects', async () => {
  await using server = await tempTriplitServer();
  const { port } = server;
  const client = new TriplitClient({
    serverUrl: `http://localhost:${port}`,
    token: serviceToken,
    autoConnect: false,
  });
  await pause(20);
  const query = client.query('users');
  await client.insert('users', { id: '1', name: 'John' });
  await pause(20);
  const spy = vi.fn();
  const states: any[] = [];

  client.subscribeWithStatus(query, spy);
  await pause(20);
  await client.connect();
  await pause(40);
  expect(spy.mock.calls).toEqual([
    // immediate initial result
    [
      {
        results: undefined,
        error: undefined,
        fetching: true,
        fetchingLocal: true,
        fetchingRemote: false,
      },
    ],
    // local result returns
    [
      {
        results: [{ id: '1', name: 'John' }],
        error: undefined,
        fetching: false,
        fetchingLocal: false,
        fetchingRemote: false,
      },
    ],
    [
      {
        results: [{ id: '1', name: 'John' }],
        error: undefined,
        fetching: false,
        fetchingLocal: false,
        fetchingRemote: true,
      },
    ],
    [
      {
        results: [{ id: '1', name: 'John' }],
        error: undefined,
        fetching: false,
        fetchingLocal: false,
        fetchingRemote: false,
      },
    ],
  ]);
});
