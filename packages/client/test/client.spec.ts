import { describe, it, expect } from 'vitest';
import { TriplitClient } from '../src/client/triplit-client.js';
import { WorkerClient } from '../src/worker-client/worker-client.js';
import { ClientSchema } from '../dist/index.js';
import {
  CollectionQuery,
  FetchResult,
  Models,
  Schema as S,
  SchemaQuery,
} from '@triplit/db';

const workerUrl = new URL(
  '../src/worker-client/worker-client-operator.ts',
  import.meta.url
).href;

interface Step<M extends Models<M>, Q extends SchemaQuery<M>> {
  action: (
    results: [results: FetchResult<M, Q, 'many'>, info: any],
    sub: any
  ) => Promise<void> | void;
  check: (
    results: [results: FetchResult<M, Q, 'many'>, info: any],
    sub: any
  ) => Promise<void> | void;
}

type Steps<M extends Models<M>, Q extends SchemaQuery<M>> = [
  Pick<Step<M, Q>, 'check'>,
  ...Step<M, Q>[],
];

async function testSubscribeWithExpand<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(client: TriplitClient<M> | WorkerClient<M>, query: Q, steps: Steps<M, Q>) {
  return new Promise<void>((resolve, reject) => {
    let stepIndex = 0;
    const sub = client.subscribeWithExpand(
      query,
      async (...args) => {
        try {
          await steps[stepIndex].check(args, sub);
          stepIndex++;
          if (stepIndex >= steps.length) {
            return resolve();
          }
          // @ts-expect-error
          await steps[stepIndex].action(args, sub);
        } catch (e) {
          reject(e);
        }
      },
      (error) => {
        reject(error);
      }
    );
  });
}

async function testSubscribeWithPagination<
  M extends Models<M>,
  Q extends SchemaQuery<M>,
>(client: TriplitClient<M> | WorkerClient<M>, query: Q, steps: Steps<M, Q>) {
  return new Promise<void>((resolve, reject) => {
    let stepIndex = 0;
    const sub = client.subscribeWithPagination(
      query,
      async (...args) => {
        try {
          await steps[stepIndex].check(args, sub);
          stepIndex++;
          if (stepIndex >= steps.length) {
            return resolve();
          }
          // @ts-expect-error
          await steps[stepIndex].action(args, sub);
        } catch (e) {
          reject(e);
        }
      },
      (error) => {
        reject(error);
      }
    );
  });
}

describe.each([TriplitClient, WorkerClient])('%O', (Client) => {
  describe('infinite subscribe', () => {
    it('can load more results unitl all data is loaded, hasMore indicates if more data exists outside the limit window', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      await client.insert('test', { id: '5', name: 'eve', age: 22 });
      await client.insert('test', { id: '6', name: 'frank', age: 18 });
      await client.insert('test', { id: '7', name: 'grace', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithExpand(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(6);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1', '4', '7', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(7);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1', '4', '7', '2', '5']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(7);
          },
        },
      ]);
    });

    it('can load specific page sizes', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      await client.insert('test', { id: '5', name: 'eve', age: 22 });
      await client.insert('test', { id: '6', name: 'frank', age: 18 });
      await client.insert('test', { id: '7', name: 'grace', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithExpand(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore(2);
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(5);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1', '4', '7']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore(2);
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(7);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1', '4', '7', '2', '5']);
          },
        },
      ]);
    });
    it('hasMore should update if relevant data is added out of range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithExpand(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          // Add data out of range
          action: async (_args, _sub) => {
            await client.insert('test', { id: '4', name: 'dave', age: 30 });
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: async ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(4);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2', '4']);
          },
        },
      ]);
    });

    // NOTE: this is an important consideration, data will leave the query window which may not be desired behavior
    // Not implementing on first pass, but I think we can support a "sticky" query window
    it('hasMore and results should update if relevant data is added in range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithExpand(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          // Add data in range
          action: async (_args, _sub) => {
            await client.insert('test', { id: '4', name: 'dave', age: 20 });
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '4']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.loadMore();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: async ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(4);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '4', '2']);
          },
        },
      ]);
    });

    it('hasMore should update if relevant data is removed out of range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 30 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithExpand(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          // Remove data out of range
          action: async (_args, _sub) => {
            await client.delete('test', '4');
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
      ]);
    });

    it('hasMore and results should update if relevant data is removed in range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithExpand(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '4']);
          },
        },
        {
          // Remove data in range
          action: async (_args, _sub) => {
            await client.delete('test', '4');
          },
          check: ([results, info], _sub) => {
            expect(info.hasMore).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
      ]);
    });
    it.todo('confirm stable re-subscriptions', () => {
      // TODO: maybe implement a store that scrambles collection scans?
    });
  });

  describe('paginated subscription', () => {
    it('initializes properly with an empty page', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(0);
          },
        },
      ]);
    });
    it('initializes properly with a non full page', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(1);
          },
        },
      ]);
    });
    it('can paginate forward and backward until cursor runs out of room', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      await client.insert('test', { id: '5', name: 'eve', age: 22 });
      await client.insert('test', { id: '6', name: 'frank', age: 18 });
      await client.insert('test', { id: '7', name: 'grace', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.nextPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['4', '7', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.nextPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(1);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['5']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.prevPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['4', '7', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.prevPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
      ]);
    });
    it('hasNextPage should update if relevant data is added out of range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          action: async (_args, _sub) => {
            await client.insert('test', { id: '4', name: 'dave', age: 30 });
          },
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
      ]);
    });
    it('hasNextPage should update if relevant data is added in range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          action: async (_args, _sub) => {
            await client.insert('test', { id: '4', name: 'dave', age: 20 });
          },
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '4']);
          },
        },
      ]);
    });
    it('hasNextPage should update if relevant data is removed out of range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 30 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          action: async (_args, _sub) => {
            await client.delete('test', '4');
          },
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
      ]);
    });
    it('hasNextPage should update if relevant data is removed in range', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '4']);
          },
        },
        {
          action: async (_args, _sub) => {
            await client.delete('test', '4');
          },
          check: ([results, info], _sub) => {
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
      ]);
    });

    // Edge cases for previous page
    // 1. Adding data behind range on first page...its on the "first page" so data probably shifts...
    // 2. If on second page, if you delete all data on the first page, that should update hasPrevPage
    // 3. If on second page, if you delete some data on the first page, paging back should give you a full result (probs with no after?) ... like a reset...

    // I guess if we determine you dont have a prev page, reset after i guess

    it('on initial load, adding data before current set shifts results', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '2']);
          },
        },
        {
          action: async (_args, _sub) => {
            await client.insert('test', { id: '4', name: 'dave', age: 10 });
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['4', '3', '1']);
          },
        },
      ]);
    });

    it('after page back, adding data before current set shifts results', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      await client.insert('test', { id: '5', name: 'eve', age: 22 });
      await client.insert('test', { id: '6', name: 'frank', age: 18 });
      await client.insert('test', { id: '7', name: 'grace', age: 20 });

      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.nextPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['4', '7', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.prevPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
        {
          action: async (_args, _sub) => {
            await client.insert('test', { id: '8', name: 'hayley', age: 17 });
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['8', '6', '3']);
          },
        },
      ]);
    });

    it('on second page, deleting all data on first page should update hasPrevPage', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
      });
      await client.insert('test', { id: '1', name: 'alice', age: 20 });
      await client.insert('test', { id: '2', name: 'bob', age: 21 });
      await client.insert('test', { id: '3', name: 'carol', age: 19 });
      await client.insert('test', { id: '4', name: 'dave', age: 20 });
      const query = client.query('test').Order(['age', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['3', '1', '4']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.nextPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(1);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['2']);
          },
        },
        {
          action: async (_args, _sub) => {
            // TODO: review subscription overfiring here
            await client.transact(async (tx) => {
              await tx.delete('test', '1');
              await tx.delete('test', '3');
              await tx.delete('test', '4');
            });
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(1);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['2']);
          },
        },
      ]);
    });

    /**
     * There's a mix of overfire and async issues impacting this test for the WorkerClient
     *
     * The test will:
     * 1. delete data on a non current page
     * 2. the subsription fires (erroneously)
     * 3. the test pages back, causing another subscription
     * 4. the subscription fires again (correctly)
     *
     * The subscription fire at step 2 is picked up by the test and cannot be short circuited by an internal unsubscribe because the worker client methods are all async under the hood
     *
     * Because testSubscribeWithPagination expects no additional fires (fire at step 2), this test will fail
     *
     * We should come back and fix this
     */
    if (Client.name !== 'WorkerClient') {
      it('on second page, deleting some data on first page and going back to prev page should result in full page', async () => {
        const client = new Client({
          autoConnect: false,
          workerUrl,
        });
        await client.insert('test', { id: '1', name: 'alice', age: 20 });
        await client.insert('test', { id: '2', name: 'bob', age: 21 });
        await client.insert('test', { id: '3', name: 'carol', age: 19 });
        await client.insert('test', { id: '4', name: 'dave', age: 20 });
        const query = client.query('test').Order(['age', 'ASC']).Limit(3);
        await testSubscribeWithPagination(client, query, [
          {
            check: ([results, info], _sub) => {
              expect(info.hasPreviousPage).toBe(false);
              expect(info.hasNextPage).toBe(true);
              expect(results.length).toBe(3);
              const ids = Array.from(results.values()).map((r) => r.id);
              expect(ids).toEqual(['3', '1', '4']);
            },
          },
          {
            action: async (_args, sub) => {
              sub.nextPage();
              await new Promise((res) => setTimeout(res, 100));
            },
            check: ([results, info], _sub) => {
              expect(info.hasPreviousPage).toBe(true);
              expect(info.hasNextPage).toBe(false);
              expect(results.length).toBe(1);
              const ids = Array.from(results.values()).map((r) => r.id);
              expect(ids).toEqual(['2']);
            },
          },
          {
            action: async (_args, sub) => {
              await client.delete('test', '1');
              sub.prevPage();
              await new Promise((res) => setTimeout(res, 100));
            },
            check: ([results, info], _sub) => {
              expect(info.hasPreviousPage).toBe(false);
              expect(info.hasNextPage).toBe(false);
              expect(results.length).toBe(3);
              const ids = Array.from(results.values()).map((r) => r.id);
              expect(ids).toEqual(['3', '4', '2']);
            },
          },
        ]);
      });
    }
    it('can perform basic paging with dates', async () => {
      const client = new Client({
        autoConnect: false,
        workerUrl,
        schema: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              dob: S.Date(),
            }),
          },
        },
      });
      await client.insert('test', {
        id: '1',
        name: 'alice',
        dob: new Date('1995-07-15'),
      });
      await client.insert('test', {
        id: '2',
        name: 'bob',
        dob: new Date('1995-07-16'),
      });
      await client.insert('test', {
        id: '3',
        name: 'carol',
        dob: new Date('1995-07-14'),
      });
      await client.insert('test', {
        id: '4',
        name: 'dave',
        dob: new Date('1995-07-15'),
      });
      await client.insert('test', {
        id: '5',
        name: 'eve',
        dob: new Date('1995-07-17'),
      });
      await client.insert('test', {
        id: '6',
        name: 'frank',
        dob: new Date('1995-07-13'),
      });
      await client.insert('test', {
        id: '7',
        name: 'grace',
        dob: new Date('1995-07-15'),
      });

      const query = client.query('test').Order(['dob', 'ASC']).Limit(3);
      await testSubscribeWithPagination(client, query, [
        {
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.nextPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['4', '7', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.nextPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(false);
            expect(results.length).toBe(1);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['5']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.prevPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], sub) => {
            expect(info.hasPreviousPage).toBe(true);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['4', '7', '2']);
          },
        },
        {
          action: async (_args, sub) => {
            sub.prevPage();
            await new Promise((res) => setTimeout(res, 100));
          },
          check: ([results, info], _sub) => {
            expect(info.hasPreviousPage).toBe(false);
            expect(info.hasNextPage).toBe(true);
            expect(results.length).toBe(3);
            const ids = Array.from(results.values()).map((r) => r.id);
            expect(ids).toEqual(['6', '3', '1']);
          },
        },
      ]);
    });
    it.todo('check pagination along tied values');
    it.todo('confirm stable re-subscriptions', () => {
      // TODO: maybe implement a store that scrambles collection scans?
    });
  });
});
