import { describe, it, expect } from 'vitest';
import { TriplitClient } from '../src/triplit-client.js';
import { ClientFetchResult, ClientQuery } from '../src/utils/query.js';

interface Step<Q extends ClientQuery<any, any>> {
  action: (
    results: [results: ClientFetchResult<Q>, info: any],
    sub: any
  ) => Promise<void> | void;
  check: (
    results: [results: ClientFetchResult<Q>, info: any],
    sub: any
  ) => Promise<void> | void;
}

type Steps<Q extends ClientQuery<any, any>> = [
  Pick<Step<Q>, 'check'>,
  ...Step<Q>[]
];

async function testInfiniteSubscription<Q extends ClientQuery<any, any>>(
  client: TriplitClient<any>,
  query: Q,
  steps: Steps<Q>
) {
  return new Promise<void>((resolve, reject) => {
    let stepIndex = 0;
    const sub = client.infiniteSubscribe(query, async (...args) => {
      try {
        await steps[stepIndex].check(args, sub);
        stepIndex++;
        if (stepIndex >= steps.length) {
          return resolve();
        }
        await steps[stepIndex].action(args, sub);
      } catch (e) {
        reject(e);
      }
    });
  });
}

describe('infinite subscribe', () => {
  it('can load more results unitl all data is loaded, hasMore indicates if more data exists outside the limit window', async () => {
    const client = new TriplitClient({
      autoConnect: false,
    });
    await client.insert('test', { id: '1', name: 'alice', age: 20 });
    await client.insert('test', { id: '2', name: 'bob', age: 21 });
    await client.insert('test', { id: '3', name: 'carol', age: 19 });
    await client.insert('test', { id: '4', name: 'dave', age: 20 });
    await client.insert('test', { id: '5', name: 'eve', age: 22 });
    await client.insert('test', { id: '6', name: 'frank', age: 18 });
    await client.insert('test', { id: '7', name: 'grace', age: 20 });
    const query = client.query('test').order(['age', 'ASC']).limit(3).build();
    await testInfiniteSubscription(client, query, [
      {
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['6', '3', '1']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore();
          await new Promise((res) => setTimeout(res, 100));
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(6);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['6', '3', '1', '4', '7', '2']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore();
          await new Promise((res) => setTimeout(res, 100));
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(7);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['6', '3', '1', '4', '7', '2', '5']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore();
          await new Promise((res) => setTimeout(res, 100));
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(7);
        },
      },
    ]);
  });

  it('can load specific page sizes', async () => {
    const client = new TriplitClient({
      autoConnect: false,
    });
    await client.insert('test', { id: '1', name: 'alice', age: 20 });
    await client.insert('test', { id: '2', name: 'bob', age: 21 });
    await client.insert('test', { id: '3', name: 'carol', age: 19 });
    await client.insert('test', { id: '4', name: 'dave', age: 20 });
    await client.insert('test', { id: '5', name: 'eve', age: 22 });
    await client.insert('test', { id: '6', name: 'frank', age: 18 });
    await client.insert('test', { id: '7', name: 'grace', age: 20 });
    const query = client.query('test').order(['age', 'ASC']).limit(3).build();
    await testInfiniteSubscription(client, query, [
      {
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['6', '3', '1']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore(2);
          await new Promise((res) => setTimeout(res, 100));
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(5);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['6', '3', '1', '4', '7']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore(2);
          await new Promise((res) => setTimeout(res, 100));
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(7);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['6', '3', '1', '4', '7', '2', '5']);
        },
      },
    ]);
  });
  it('hasMore should update if relevant data is added out of range', async () => {
    const client = new TriplitClient({
      autoConnect: false,
    });
    await client.insert('test', { id: '1', name: 'alice', age: 20 });
    await client.insert('test', { id: '2', name: 'bob', age: 21 });
    await client.insert('test', { id: '3', name: 'carol', age: 19 });
    const query = client.query('test').order(['age', 'ASC']).limit(3).build();
    await testInfiniteSubscription(client, query, [
      {
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2']);
        },
      },
      {
        // Add data out of range
        action: async ([results, info], sub) => {
          await client.insert('test', { id: '4', name: 'dave', age: 30 });
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore();
          await new Promise((res) => setTimeout(res, 100));
        },
        check: async ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(4);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2', '4']);
        },
      },
    ]);
  });

  // NOTE: this is an important consideration, data will leave the query window which may not be desired behavior
  // Not implementing on first pass, but I think we can support a "sticky" query window
  it('hasMore and results should update if relevant data is added in range', async () => {
    const client = new TriplitClient({
      autoConnect: false,
    });
    await client.insert('test', { id: '1', name: 'alice', age: 20 });
    await client.insert('test', { id: '2', name: 'bob', age: 21 });
    await client.insert('test', { id: '3', name: 'carol', age: 19 });
    const query = client.query('test').order(['age', 'ASC']).limit(3).build();
    await testInfiniteSubscription(client, query, [
      {
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2']);
        },
      },
      {
        // Add data in range
        action: async ([results, info], sub) => {
          await client.insert('test', { id: '4', name: 'dave', age: 20 });
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '4']);
        },
      },
      {
        action: async ([results, info], sub) => {
          sub.loadMore();
          await new Promise((res) => setTimeout(res, 100));
        },
        check: async ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(4);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '4', '2']);
        },
      },
    ]);
  });

  it('hasMore should update if relevant data is removed out of range', async () => {
    const client = new TriplitClient({
      autoConnect: false,
    });
    await client.insert('test', { id: '1', name: 'alice', age: 20 });
    await client.insert('test', { id: '2', name: 'bob', age: 21 });
    await client.insert('test', { id: '3', name: 'carol', age: 19 });
    await client.insert('test', { id: '4', name: 'dave', age: 30 });
    const query = client.query('test').order(['age', 'ASC']).limit(3).build();
    await testInfiniteSubscription(client, query, [
      {
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2']);
        },
      },
      {
        // Remove data out of range
        action: async ([results, info], sub) => {
          await client.delete('test', '4');
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2']);
        },
      },
    ]);
  });

  it('hasMore and results should update if relevant data is removed in range', async () => {
    const client = new TriplitClient({
      autoConnect: false,
    });
    await client.insert('test', { id: '1', name: 'alice', age: 20 });
    await client.insert('test', { id: '2', name: 'bob', age: 21 });
    await client.insert('test', { id: '3', name: 'carol', age: 19 });
    await client.insert('test', { id: '4', name: 'dave', age: 20 });
    const query = client.query('test').order(['age', 'ASC']).limit(3).build();
    await testInfiniteSubscription(client, query, [
      {
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(true);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '4']);
        },
      },
      {
        // Remove data in range
        action: async ([results, info], sub) => {
          await client.delete('test', '4');
        },
        check: ([results, info], sub) => {
          expect(info.hasMore).toBe(false);
          expect(results.size).toBe(3);
          const ids = Array.from(results.values()).map((r) => r.id);
          expect(ids).toEqual(['3', '1', '2']);
        },
      },
    ]);
  });
});
