import { DB, Schema as S, ServerEntityStore } from '@triplit/db';
import { describe, expect, it, vi } from 'vitest';
import {
  createTestClient,
  SERVICE_KEY,
  spyMessages,
  throwOnError,
} from '../utils/client.js';
import { Server as TriplitServer } from '@triplit/server-core';
import { pause } from '../utils/async.js';

// TODO: add more complex type tests here (record, set, etc)
describe('S.Json', () => {
  const schema = S.Collections({
    test: {
      schema: S.Schema({
        id: S.Id(),
        data: S.Json(),
      }),
    },
  });
  it('can sync an object from one client to another', async () => {
    const db = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema,
    });
    const query = alice.query('test');
    const sub = vi.fn();
    bob.subscribe(query, sub, throwOnError);
    await alice.insert('test', {
      id: '1',
      data: {
        name: 'Alice',
        age: 30,
        address: {
          city: 'Wonderland',
          zip: '12345',
        },
      },
    });
    await pause();
    expect(sub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: {
          name: 'Alice',
          age: 30,
          address: {
            city: 'Wonderland',
            zip: '12345',
          },
        },
      },
    ]);
  });
  it('object assignments converge', async () => {
    const db = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    await db.insert('test', {
      id: '1',
      data: {
        a: 1,
      },
    });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema,
    });
    const query = alice.query('test');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub, throwOnError);
    bob.subscribe(query, bobSub, throwOnError);
    await pause();
    await alice.update('test', '1', (doc) => {
      doc.data = { b: 2 };
    });
    await bob.update('test', '1', (doc) => {
      doc.data = { c: 3 };
    });
    await pause();
    // This is FINE, but we will probably eventually need some levers to opt out of this kind of merge
    expect(aliceSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: { a: null, b: 2, c: 3 },
      },
    ]);
    expect(bobSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: { a: null, b: 2, c: 3 },
      },
    ]);
  });
  it('object property assignments converge', async () => {
    const db = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    await db.insert('test', {
      id: '1',
      data: {
        inner: {
          a: 1,
          b: 2,
          c: 3,
        },
      },
    });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema,
    });
    const query = alice.query('test');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub, throwOnError);
    bob.subscribe(query, bobSub, throwOnError);
    await pause();
    await alice.update('test', '1', (doc) => {
      doc.data.inner.a = '1';
      // delete prop
      delete doc.data.inner.c;
    });
    await bob.update('test', '1', (doc) => {
      doc.data.inner.b = '2';
      // add prop
      doc.data.inner.d = '4';
    });
    await pause();
    // Occasionally, seeing Bob not get alice's changes, possibly not paused long enough?
    expect(aliceSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: {
          inner: {
            a: '1',
            b: '2',
            c: null,
            d: '4',
          },
        },
      },
    ]);
    expect(bobSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: {
          inner: {
            a: '1',
            b: '2',
            c: null,
            d: '4',
          },
        },
      },
    ]);
  });
  it('Array assignments converge by overwriting', async () => {
    const db = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    await db.insert('test', {
      id: '1',
      data: [1, 2, 3],
    });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema,
    });
    const query = alice.query('test');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub, throwOnError);
    bob.subscribe(query, bobSub, throwOnError);
    await pause();
    await alice.update('test', '1', (doc) => {
      doc.data = [4, 5];
    });
    await bob.update('test', '1', (doc) => {
      doc.data = [6];
    });
    await pause();
    expect(aliceSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: [6],
      },
    ]);
    expect(bobSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: [6],
      },
    ]);
  });
  it('Array index assignments converge', async () => {
    const db = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    await db.insert('test', {
      id: '1',
      data: [1, 2, 3],
    });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema,
    });
    const query = alice.query('test');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub, throwOnError);
    bob.subscribe(query, bobSub, throwOnError);
    await pause();
    await alice.update('test', '1', (doc) => {
      doc.data[0] = 4;
    });
    await bob.update('test', '1', (doc) => {
      doc.data[0] = 5;
    });
    await pause();
    expect(aliceSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: [5, 2, 3],
      },
    ]);
    expect(bobSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: [5, 2, 3],
      },
    ]);
  });
  // NOTE: arr.push() is not officially supported
  it('Test array.push()', async () => {
    const db = new DB({
      entityStore: new ServerEntityStore(),
      schema: { collections: schema },
    });
    await db.insert('test', {
      id: '1',
      data: [1, 2, 3],
    });
    const server = new TriplitServer(db);
    const alice = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'alice',
      schema,
    });
    const spy = spyMessages(alice);
    const bob = createTestClient(server, {
      token: SERVICE_KEY,
      clientId: 'bob',
      schema,
    });
    const query = alice.query('test');
    const aliceSub = vi.fn();
    const bobSub = vi.fn();
    alice.subscribe(query, aliceSub, throwOnError);
    bob.subscribe(query, bobSub, throwOnError);
    await pause();
    await alice.update('test', '1', (doc) => {
      doc.data.push(4);
    });
    await bob.update('test', '1', (doc) => {
      doc.data.push(5);
    });
    await pause();
    expect(aliceSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: [1, 2, 3, 5],
      },
    ]);
    expect(bobSub.mock.calls.at(-1)?.[0]).toEqual([
      {
        id: '1',
        data: [1, 2, 3, 5],
      },
    ]);
  });
});
