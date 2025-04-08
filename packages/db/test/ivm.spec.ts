import {
  describe,
  test,
  vi,
  expect,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
import { DB, DBSchema } from '../src/db.js';
import {
  createQueryWithExistsAddedToIncludes,
  createQueryWithRelationalOrderAddedToIncludes,
  diffChanges,
  IVM,
  queryResultsToChanges,
} from '../src/ivm.js';
import { Schema as S } from '../src/schema/builder.js';
import {
  CollectionQuery,
  OrderStatement,
  QueryOrder,
} from '../src/query/types/index.js';
import { Models } from '../src/schema/types/index.js';
import { deterministicShuffle } from './utils/seeding.js';
import { prepareQuery } from '../src/query/prepare-query.js';
import { pause } from './utils/async.js';
import { InMemoryTestKVStore } from './utils/test-kv-store.js';
import { areChangesEmpty, mergeDBChanges } from '../src/memory-write-buffer.js';
import { DBChanges } from '../dist/types.js';
import { ViewEntity } from '../dist/query-engine.js';
import { flattenViewEntity } from '../src/query-engine.js';

describe('IVM', () => {
  describe('initial results', async () => {
    test('basic query', async () => {
      const db = new DB();

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('users', { id: '3', name: 'Charlie' });

      const spy = vi.fn();

      const unsubscribe = db.subscribe(
        {
          collectionName: 'users',
          where: [['name', '=', 'Bob']],
        },
        (results) => {
          spy(results);
        }
      );
      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.lastCall[0]).toEqual([{ id: '2', name: 'Bob' }]);

      unsubscribe();
    });

    test('relational query with exists clause', async () => {
      const db = new DB();

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('users', { id: '3', name: 'Charlie' });

      await db.insert('posts', { id: '1', userId: '1' });
      await db.insert('posts', { id: '2', userId: '2' });
      await db.insert('posts', { id: '3', userId: '2' });

      const query = {
        collectionName: 'users',
        where: [
          {
            exists: {
              collectionName: 'posts',
              where: [['userId', '=', '$1.id']],
            },
          },
        ],
      } satisfies CollectionQuery;

      // Below have two subscriptions to the same query to
      // check that the second query gets the correct results
      let unsubs: (() => void)[] = [];
      {
        const spy = vi.fn();

        const unsubscribe = db.subscribe(query, (results) => {
          spy(results);
        });
        unsubs.push(unsubscribe);
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.lastCall[0]).toEqual([
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ]);
      }
      {
        const spy = vi.fn();
        const unsubscribe = db.subscribe(query, (results) => {
          spy(results);
        });
        unsubs.push(unsubscribe);
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.lastCall[0]).toEqual([
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ]);
      }
      unsubs.forEach((unsub) => unsub());
    });
  });
  // No longer tracking changes here because it happens in the server
  describe.each([false])('shouldTrackChanges: %s', (shouldTrackChanges) => {
    test('can subscribe to a non-relational query and get updates', async () => {
      const db = new DB({ ivmOptions: { shouldTrackChanges } });

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });

      const spy = vi.fn();

      const unsubscribe = db.subscribeWithChanges(
        {
          collectionName: 'users',
          where: [['name', '=', 'Alice']],
        },
        ({ results, changes }) => {
          spy({ results, changes });
        },
        (err) => {
          throw err;
        }
      );

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.lastCall[0].results).toEqual([
        { id: '1', name: 'Alice' },
      ]);
      if (shouldTrackChanges) {
        expect(spy.mock.lastCall[0].changes).toEqual({
          users: {
            deletes: new Set(),
            sets: new Map([['1', { id: '1', name: 'Alice' }]]),
          },
        });
      }

      await db.update('users', '1', { name: 'Alice Updated' });

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.lastCall[0].results).toEqual([]);
      if (shouldTrackChanges) {
        expect(spy.mock.lastCall[0].changes).toEqual({
          users: {
            deletes: new Set(),
            sets: new Map([['1', { name: 'Alice Updated' }]]),
          },
        });
      }

      unsubscribe();
    });

    test('can subscribe to a relational query and get updates', async () => {
      const db = new DB({ ivmOptions: { shouldTrackChanges } });

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('users', { id: '3', name: 'Charlie' });

      await db.insert('posts', { id: '1', userId: '1', public: true });
      await db.insert('posts', { id: '2', userId: '2', public: false });
      await db.insert('posts', { id: '3', userId: '2', public: false });

      const spy = vi.fn();
      const unsubscribe = db.subscribe(
        {
          collectionName: 'users',
          where: [
            {
              exists: {
                collectionName: 'posts',
                where: [
                  ['userId', '=', '$1.id'],
                  ['public', '=', true],
                ],
              },
            },
          ],
        },
        spy
      );

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.lastCall[0]).toEqual([{ id: '1', name: 'Alice' }]);

      await db.insert('posts', { id: '4', userId: '2', public: true });

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      // const firstCallResults = spy.mock.calls[0][0];
      // const secondCallResults = spy.mock.calls[1][0];
      // console.dir(firstCallResults === secondCallResults, spy.mock.calls);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.lastCall[0]).toEqual([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]);

      unsubscribe();
    });

    test('can handle deletes on simple, non-relational query', async () => {
      const db = new DB({ ivmOptions: { shouldTrackChanges } });

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('users', { id: '3', name: 'Charlie' });

      const spy = vi.fn();
      const unsubscribe = db.subscribe(
        {
          collectionName: 'users',
          where: [['name', '=', 'Alice']],
        },
        spy
      );

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.lastCall[0]).toEqual([{ id: '1', name: 'Alice' }]);

      await db.delete('users', '1');

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.lastCall[0]).toEqual([]);

      unsubscribe();
    });

    test('can handle deletes on relation', async () => {
      const db = new DB({ ivmOptions: { shouldTrackChanges } });

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('users', { id: '3', name: 'Charlie' });

      await db.insert('posts', { id: '1', userId: '1', public: true });
      await db.insert('posts', { id: '2', userId: '2', public: false });
      await db.insert('posts', { id: '3', userId: '1', public: false });

      const spy = vi.fn();
      const unsubscribe = db.subscribe(
        {
          collectionName: 'users',
          where: [
            {
              exists: {
                collectionName: 'posts',
                where: [
                  ['userId', '=', '$1.id'],
                  ['public', '=', true],
                ],
              },
            },
          ],
        },
        spy
      );

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.lastCall[0]).toEqual([{ id: '1', name: 'Alice' }]);

      // Irrelevant delete (should not trigger a change)
      await db.delete('posts', '3');

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      // This will sometimes bet called twice because of the shortcut used on the client
      // to just
      expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
      expect(spy.mock.lastCall[0]).toEqual([{ id: '1', name: 'Alice' }]);

      await db.delete('posts', '1');

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
      expect(spy.mock.lastCall[0]).toEqual([]);

      unsubscribe();
    });
  });
  // IVM no longer does this specific change tracking rather it happens on the server
  test.skip('can track changes with deletes on simple, non-relational query', async () => {
    const db = new DB();

    await db.insert('users', { id: '1', name: 'Alice' });
    await db.insert('users', { id: '2', name: 'Bob' });
    await db.insert('users', { id: '3', name: 'Charlie' });

    const spy = vi.fn();
    const unsubscribe = db.subscribeChanges(
      {
        collectionName: 'users',
        where: [['name', '=', 'Alice']],
      },
      spy
    );

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.lastCall[0]).toEqual({
      users: {
        deletes: new Set(),
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
      },
    });

    await db.delete('users', '1');

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.lastCall[0]).toEqual({
      users: {
        deletes: new Set(['1']),
        sets: new Map(),
      },
    });

    unsubscribe();
  });

  // IVM no longer does this specific change tracking rather it happens on the server
  test.skip('can track changes with deletes on relation', async () => {
    const db = new DB();

    await db.insert('users', { id: '1', name: 'Alice' });
    await db.insert('users', { id: '2', name: 'Bob' });
    await db.insert('users', { id: '3', name: 'Charlie' });

    await db.insert('posts', { id: '1', userId: '1', public: true });
    await db.insert('posts', { id: '2', userId: '2', public: false });
    await db.insert('posts', { id: '3', userId: '1', public: false });

    const spy = vi.fn();
    const unsubscribe = db.subscribeChanges(
      {
        collectionName: 'users',
        where: [
          {
            exists: {
              collectionName: 'posts',
              where: [
                ['userId', '=', '$1.id'],
                ['public', '=', true],
              ],
            },
          },
        ],
      },
      spy
    );

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.lastCall[0]).toEqual({
      users: {
        deletes: new Set(),
        sets: new Map([['1', { id: '1', name: 'Alice' }]]),
      },
      posts: {
        deletes: new Set(),
        sets: new Map([['1', { id: '1', userId: '1', public: true }]]),
      },
    });

    // Irrelevant delete
    await db.delete('posts', '3');

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    expect(spy).toHaveBeenCalledTimes(1);

    await db.delete('posts', '1');

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.lastCall[0]).toEqual({
      posts: {
        deletes: new Set('1'),
        sets: new Map(),
      },
    });

    unsubscribe();
  });

  describe('queries with order', async () => {
    const schema = {
      collections: S.Collections({
        cars: {
          schema: S.Schema({
            id: S.String(),
            make: S.String(),
            model: S.String(),
            year: S.Number(),
          }),
        },
      }),
    };
    const db = new DB({ schema, ivmOptions: { shouldTrackChanges: false } });
    beforeEach(async () => {
      await db.clear({});
    });

    const ORDER_CLAUSES: QueryOrder<
      (typeof schema)['collections'],
      'cars'
    >[][] = [
      [[['year', 'ASC']]],
      [[['year', 'DESC']]],
      [
        [
          ['year', 'DESC'],
          ['make', 'ASC'],
        ],
      ],
    ];

    test.each(ORDER_CLAUSES)('can handle order clause %o', async (order) => {
      const testDb = new DB({ schema });
      const CARS = [
        {
          id: '1',
          make: 'Toyota',
          model: 'Corolla',
          year: 2020,
        },
        {
          id: '2',
          make: 'Honda',
          model: 'Civic',
          year: 2021,
        },
        {
          id: '3',
          make: 'Toyota',
          model: 'Camry',
          year: 2019,
        },
      ];

      const spy = vi.fn();
      const unsubscribe = db.subscribe(
        {
          collectionName: 'cars',
          where: [],
          order,
        },
        spy
      );

      for await (const car of CARS) {
        await db.insert('cars', car);
        await testDb.insert('cars', car);

        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();

        expect(spy).toHaveBeenCalledTimes(1);

        const subscriptionResults = spy.mock.lastCall[0];
        const fetchResults = await testDb.fetch({
          collectionName: 'cars',
          where: [],
          order,
        });
        expect(subscriptionResults).toEqual(fetchResults);

        spy.mockClear();
      }

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      unsubscribe();
    });

    test('can handle updates that change the order of results', async () => {
      const CARS = [
        {
          id: '1',
          make: 'Toyota',
          model: 'Corolla',
          year: 2020,
        },
        {
          id: '2',
          make: 'Honda',
          model: 'Civic',
          year: 2021,
        },
        {
          id: '3',
          make: 'Toyota',
          model: 'Camry',
          year: 2019,
        },
      ];

      const spy = vi.fn();
      const unsubscribe = db.subscribe(
        {
          collectionName: 'cars',
          where: [],
          order: [
            ['year', 'DESC'],
            ['make', 'ASC'],
          ],
        },
        spy
      );

      for (const car of CARS) {
        await db.insert('cars', car);
      }

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();

      expect(spy).toHaveBeenCalledTimes(1);

      const subscriptionResults = spy.mock.lastCall[0];
      expect(subscriptionResults).toEqual([
        { id: '2', make: 'Honda', model: 'Civic', year: 2021 },
        { id: '1', make: 'Toyota', model: 'Corolla', year: 2020 },
        { id: '3', make: 'Toyota', model: 'Camry', year: 2019 },
      ]);

      await db.update('cars', '2', { year: 2018 });

      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      expect(spy).toHaveBeenCalledTimes(2);

      const updatedSubscriptionResults = spy.mock.lastCall[0];
      expect(updatedSubscriptionResults).toEqual([
        { id: '1', make: 'Toyota', model: 'Corolla', year: 2020 },
        { id: '3', make: 'Toyota', model: 'Camry', year: 2019 },
        { id: '2', make: 'Honda', model: 'Civic', year: 2018 },
      ]);

      unsubscribe();
    });
  });

  describe('including subqueries', () => {
    const schema = {
      collections: S.Collections({
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
          }),
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            userId: S.String(),
            public: S.Boolean(),
          }),
        },
      }),
    };
    const db = new DB({ schema, ivmOptions: { shouldTrackChanges: false } });
    const USERS = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ];
    const POSTS = [
      { id: '1', userId: '1', public: true },
      { id: '2', userId: '2', public: false },
      { id: '3', userId: '1', public: false },
    ];

    beforeEach(async () => {
      await db.clear({});

      for (const user of USERS) {
        await db.insert('users', user);
      }
      for (const post of POSTS) {
        await db.insert('posts', post);
      }
    });

    describe('updates to nested subqueries', () => {
      test('can get initial results with subquery inclusions', async () => {
        const spy = vi.fn();

        const unsubscribe = db.subscribe(
          {
            collectionName: 'users',
            include: {
              publicPosts: {
                subquery: {
                  collectionName: 'posts',
                  where: [
                    ['userId', '=', '$1.id'],
                    ['public', '=', true],
                  ],
                },
                cardinality: 'many',
              },
            },
          },
          spy
        );
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.lastCall[0]).toEqual([
          {
            id: '1',
            name: 'Alice',
            publicPosts: [{ id: '1', userId: '1', public: true }],
          },
          {
            id: '2',
            name: 'Bob',
            publicPosts: [],
          },
          {
            id: '3',
            name: 'Charlie',
            publicPosts: [],
          },
        ]);
        unsubscribe();
      });

      test('can handle tracking changes to subquery', async () => {
        const spy = vi.fn();

        const unsubscribe = db.subscribe(
          {
            collectionName: 'users',
            include: {
              publicPosts: {
                subquery: {
                  collectionName: 'posts',
                  where: [
                    ['userId', '=', '$1.id'],
                    ['public', '=', true],
                  ],
                },
                cardinality: 'many',
              },
            },
          },
          spy
        );
        // Initial results
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        spy.mockClear();

        await db.update('posts', '3', { public: true });
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.lastCall[0]).toEqual([
          {
            id: '1',
            name: 'Alice',
            publicPosts: [
              { id: '1', userId: '1', public: true },
              { id: '3', userId: '1', public: true },
            ],
          },
          {
            id: '2',
            name: 'Bob',
            publicPosts: [],
          },
          {
            id: '3',
            name: 'Charlie',
            publicPosts: [],
          },
        ]);

        await db.update('posts', '2', { public: true });
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();

        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.lastCall[0]).toEqual([
          {
            id: '1',
            name: 'Alice',
            publicPosts: [
              { id: '1', userId: '1', public: true },
              { id: '3', userId: '1', public: true },
            ],
          },
          {
            id: '2',
            name: 'Bob',
            publicPosts: [{ id: '2', userId: '2', public: true }],
          },
          {
            id: '3',
            name: 'Charlie',
            publicPosts: [],
          },
        ]);

        unsubscribe();
      });
    });

    describe('can handle inserts to deeply nested subqueries', async () => {
      // Public posts and their user and their posts
      const query: CollectionQuery = {
        collectionName: 'posts',
        where: [['public', '=', true]],
        include: {
          user: {
            subquery: {
              collectionName: 'users',
              where: [['id', '=', '$1.userId']],
              include: {
                posts: {
                  subquery: {
                    collectionName: 'posts',
                    where: [['userId', '=', '$1.id']],
                  },
                  cardinality: 'many',
                },
              },
            },
            cardinality: 'one',
          },
        },
      };

      const spy = vi.fn();
      let unsubscribe;

      beforeEach(async () => {
        unsubscribe = db.subscribe(query, spy);
        // flush initial results
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        spy.mockClear();
      });

      afterEach(async () => {
        spy.mockClear();
        unsubscribe();
      });

      test('insert to existing nested results', async () => {
        await db.insert('posts', { id: '4-alice', userId: '1', public: false });
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.lastCall[0]).toEqual([
          {
            id: '1',
            userId: '1',
            public: true,
            user: {
              id: '1',
              name: 'Alice',
              posts: [
                { id: '1', userId: '1', public: true },
                { id: '3', userId: '1', public: false },
                { id: '4-alice', userId: '1', public: false },
              ],
            },
          },
        ]);
      });
      test('insert to create new results', async () => {
        await db.insert('posts', { id: '4-bob', userId: '2', public: true });
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);

        expect(spy.mock.lastCall[0]).toEqual([
          {
            id: '1',
            userId: '1',
            public: true,
            user: {
              id: '1',
              name: 'Alice',
              posts: [
                { id: '1', userId: '1', public: true },
                { id: '3', userId: '1', public: false },
              ],
            },
          },
          {
            id: '4-bob',
            userId: '2',
            public: true,
            user: {
              id: '2',
              name: 'Bob',
              posts: [
                { id: '2', userId: '2', public: false },
                { id: '4-bob', userId: '2', public: true },
              ],
            },
          },
        ]);
      });
    });

    describe('can handle deletes to deeply nested subqueries', async () => {
      // Public posts and their users and their posts
      const query: CollectionQuery = {
        collectionName: 'posts',
        where: [['public', '=', true]],
        include: {
          user: {
            subquery: {
              collectionName: 'users',
              where: [['id', '=', '$1.userId']],
              include: {
                posts: {
                  subquery: {
                    collectionName: 'posts',
                    where: [['userId', '=', '$1.id']],
                  },
                  cardinality: 'many',
                },
              },
            },
            cardinality: 'one',
          },
        },
      };

      const spy = vi.fn();
      let unsubscribe: () => void;

      beforeEach(async () => {
        unsubscribe = db.subscribe(query, spy);
        // flush initial results
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        spy.mockClear();
      });

      afterEach(async () => {
        spy.mockClear();
        unsubscribe();
      });

      test('delete from nested results', async () => {
        await db.delete('posts', '1');
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.lastCall[0]).toEqual([]);
      });
      test('delete to remove results', async () => {
        await db.delete('posts', '3');
        await db.updateQueryViews();
        db.broadcastToQuerySubscribers();
        expect(spy).toHaveBeenCalledTimes(1);

        expect(spy.mock.lastCall[0]).toEqual([
          {
            id: '1',
            userId: '1',
            public: true,
            user: {
              id: '1',
              name: 'Alice',
              posts: [{ id: '1', userId: '1', public: true }],
            },
          },
        ]);
      });
    });
  });
});

type EntityOperation = {
  collection?: string; // only optional because I don't want to update all the tests
  type: 'insert' | 'update' | 'delete';
  id: string;
  value?: any;
};

// Mini state machine to ensure that a sensible sequence of operations is applied e.g. insert before update, insert before delete, etc.
function generateOps(id: number, seed: number, numOps: number) {
  let internalSeed = id * 91 + seed;
  let lastOp: EntityOperation['type'] = 'delete';
  const ops: EntityOperation[] = [];
  for (let i = 0; i < numOps; i++) {
    const deterministicRandomValueForOp = internalSeed + i;

    // Only valid op after delete is insert
    if (lastOp === 'delete') {
      ops.push({
        type: 'insert',
        id: id.toString(),
        value: deterministicRandomValueForOp,
      });
      lastOp = 'insert';
      continue;
    }
    const nextOp = deterministicRandomValueForOp % 3;
    if (nextOp === 0) {
      ops.push({ type: 'delete', id: id.toString() });
      lastOp = 'delete';
    } else {
      ops.push({
        type: 'update',
        id: id.toString(),
        value: deterministicRandomValueForOp,
      });
      lastOp = 'update';
    }
  }
  return ops;
}

/*
 * Here we test tracking changes to a subscription/view and applying those to another database
 * This is the basis for client-server syncing
 * It's important to note that the changes that are emitted from updating views don't describe how the view changed
 * but instead are intended to be the minimal amount of information necessary to reconstruct the view
 * on another database with the same querying capabilities
 */
describe('IVM syncing', () => {
  const TODAY = new Date('2024-01-01').getTime();
  const USERS = ['alice', 'bob', 'charlie'];
  const CONVERSATIONS = ['conv1', 'conv2', 'conv3'];

  const QUERIES: Record<string, CollectionQuery> = {
    aliceMessages: {
      collectionName: 'messages',
      where: [
        {
          exists: {
            collectionName: 'conversationMembers',
            where: [
              ['conversationId', '=', '$1.conversationId'],
              ['userId', '=', 'alice'],
            ],
            order: [['id', 'DESC']],
          },
        },
      ],
      include: {
        membership: {
          subquery: {
            collectionName: 'conversationMembers',
            where: [['conversationId', '=', '$1.conversationId']],
            order: [['id', 'DESC']],
          },
          cardinality: 'one',
        },
      },
    },
    messagesFromEitherBobOrCharlie: {
      collectionName: 'messages',
      where: [
        {
          mod: 'or',
          filters: [
            ['senderId', '=', 'bob'],
            ['senderId', '=', 'charlie'],
          ],
        },
      ],
    },
    conversationsWithMessages: {
      collectionName: 'conversations',
      where: [
        {
          exists: {
            collectionName: 'messages',
            where: [
              ['conversationId', '=', '$1.id'],
              ['id', 'isDefined', true],
            ],
          },
        },
      ],
    },
    conversationWithMessagesWithSenders: {
      collectionName: 'conversations',
      where: [['id', '=', 'conv1']],
      include: {
        messages: {
          subquery: {
            collectionName: 'messages',
            where: [['conversationId', '=', '$1.id']],
            include: {
              sender: {
                subquery: {
                  collectionName: 'users',
                  where: [['id', '=', '$1.senderId']],
                },
                cardinality: 'one',
              },
            },
          },
          cardinality: 'many',
        },
      },
    },
    allMessages: {
      collectionName: 'messages',
      where: [],
    },
    conversationsWithMostRecentMessage: {
      collectionName: 'conversations',
      where: [],
      include: {
        mostRecentMessage: {
          subquery: {
            collectionName: 'messages',
            where: [['conversationId', '=', '$1.id']],
            order: [
              ['sentAt', 'DESC'],
              // ID is added for tiebreaks between messages with the same sentAt
              ['id', 'ASC'],
            ],
            limit: 1,
          },
          cardinality: 'one',
        },
      },
    },
    threeMostRecentMessages: {
      collectionName: 'messages',
      where: [],
      order: [
        ['sentAt', 'DESC'],
        // ID is added for tiebreaks between messages with the same sentAt
        ['id', 'ASC'],
      ],
      limit: 3,
    },
    aliceConversations: {
      collectionName: 'conversations',
      where: [
        {
          exists: {
            collectionName: 'conversationMembers',
            where: [
              ['conversationId', '=', '$1.id'],
              ['userId', '=', 'alice'],
            ],
          },
        },
      ],
    },
    messagesInTheLastDay: {
      collectionName: 'messages',
      where: [['sentAt', '>', TODAY - 24 * 60 * 60 * 1000]],
    },
    // TODO / note that because there is no ORDER, it isn't deterministic which messages are returned
    // so it can differ between IVM and a fresh fetch
    // fiveMessages: {
    //   collectionName: 'messages',
    //   limit: 5,
    // },
    messagesByConversationByDate: {
      collectionName: 'messages',
      where: [],
      order: [
        ['conversationId', 'ASC'],
        ['sentAt', 'ASC'],
        // ID is added for tiebreaks between messages with the same sentAt
        ['id', 'ASC'],
      ],
    },
    messagesByDateSinceYesterday: {
      collectionName: 'messages',
      where: [],
      order: [['sentAt', 'DESC']],
      after: [[TODAY - 3000], true],
    },
  };
  const randomEntityFactory = {
    messages: (seed: number) => ({
      id: seed.toString(),
      conversationId: CONVERSATIONS[seed % CONVERSATIONS.length],
      senderId: USERS[seed % USERS.length],
      text: `Message ${seed}`,
      sentAt: TODAY - Math.round(100000 * Math.random()),
    }),
    conversationMembers: (seed: number) => ({
      id: seed.toString(),
      conversationId: CONVERSATIONS[seed % CONVERSATIONS.length],
      userId: USERS[seed % USERS.length],
    }),
    conversations: (seed: number) => ({
      id: CONVERSATIONS[seed % CONVERSATIONS.length],
    }),
  };

  function createRandomOpsForCollection(
    collectionName: string,
    numOps: number,
    seed: number
  ) {
    const ops: EntityOperation[] = [];
    const aliveEntities: string[] = [];
    const rand = lcg(seed);
    for (let i = 0; i < numOps; i++) {
      const op =
        aliveEntities.length === 0
          ? 'insert'
          : // Making inserts and updates more likely than deletes
            ['insert', 'insert', 'update', 'update', 'delete'][rand(5)];

      if (op === 'delete') {
        ops.push({
          type: 'delete',
          collection: collectionName,
          id: aliveEntities.shift()!,
        });
      } else if (op === 'update') {
        const id = aliveEntities[rand(aliveEntities.length)];
        const { id: _, ...value } = randomEntityFactory[collectionName](
          rand(1000)
        );
        ops.push({
          type: 'update',
          collection: collectionName,
          id,
          value,
        });
      } else {
        const seeded = rand(1000);
        let randomEntity = randomEntityFactory[collectionName](seeded);
        // in case we have a collision with an existing message
        if (collectionName === 'messages') {
          let isIdAlreadyUsed = aliveEntities.includes(randomEntity.id);
          while (isIdAlreadyUsed) {
            randomEntity = randomEntityFactory[collectionName](rand(1000));
            isIdAlreadyUsed = aliveEntities.includes(randomEntity.id);
          }
        }

        ops.push({
          type: 'insert',
          collection: collectionName,
          id: randomEntity.id,
          value: randomEntity,
        });
        aliveEntities.push(randomEntity.id);
      }
    }
    return ops;
  }

  const RANDOM_SEEDS = Array.from({ length: 50 }, (_, i) =>
    Math.floor(Math.random() * 10_000)
  );
  const QUERIES_TO_TEST: Array<keyof typeof QUERIES> = Object.keys(QUERIES);
  // const QUERIES_TO_TEST: Array<keyof typeof QUERIES> = ['fiveMessages'];
  describe.each(RANDOM_SEEDS)('seed %i', (seed) => {
    describe.each([false, true])(
      'should track changes: %s',
      (shouldTrackChanges) => {
        async function testQueries(queryKeys: string[]) {
          for (const queryKey of queryKeys) {
            let query = QUERIES[queryKey];
            const serverDb = new DB();
            const clientDb = new DB();

            // const expectedNumberOfCalls = Math.floor(
            //   randomOps.length / flushChangesFrequency
            // );
            const spy = vi.fn();
            let ranStep, resolve, reject;
            let numCalls = 0;

            query = shouldTrackChanges
              ? createQueryWithRelationalOrderAddedToIncludes(
                  createQueryWithExistsAddedToIncludes(
                    prepareQuery(
                      query,
                      serverDb.schema?.['collections'],
                      {},
                      undefined,
                      {
                        applyPermission: undefined,
                      }
                    )
                  )
                )
              : prepareQuery(query, undefined, {}, undefined, {
                  applyPermission: undefined,
                });
            // starting states should match
            expect(await serverDb.fetch(query)).toEqual(
              await clientDb.fetch(query)
            );
            let subscribedQueryState = new Map<
              CollectionQuery<any, any>,
              DBChanges
            >();
            subscribedQueryState.set(query, {});
            serverDb.subscribeRaw(
              query,
              async (rawServerResults: ViewEntity[]) => {
                ({
                  promise: ranStep,
                  resolve,
                  reject,
                } = Promise.withResolvers());
                spy();

                try {
                  const serverResults = rawServerResults.map((r) =>
                    structuredClone(flattenViewEntity(r))
                  );
                  if (shouldTrackChanges) {
                    const serverChanges = queryResultsToChanges(
                      rawServerResults,
                      query
                    );
                    /**
                     * This is replicating / simulating the diffing that happens on the server
                     */
                    // TODO actually share the function and/or move this testing to integration-tests
                    let unionOfChangesBefore = {};
                    let unionOfChangesAfter = {};
                    for (const [q, changes] of subscribedQueryState.entries()) {
                      unionOfChangesBefore = mergeDBChanges(
                        structuredClone(unionOfChangesBefore),
                        structuredClone(changes)
                      );
                      if (q === query) {
                        unionOfChangesAfter = mergeDBChanges(
                          structuredClone(unionOfChangesAfter),
                          structuredClone(serverChanges)
                        );
                      } else {
                        unionOfChangesAfter = mergeDBChanges(
                          structuredClone(unionOfChangesAfter),
                          structuredClone(changes)
                        );
                      }
                    }
                    subscribedQueryState.set(
                      query,
                      structuredClone(serverChanges)
                    );
                    const changeDiff = diffChanges(
                      unionOfChangesBefore,
                      unionOfChangesAfter
                    );
                    // console.dir(
                    //   {
                    //     serverResults,
                    //     unionOfChangesBefore,
                    //     unionOfChangesAfter,
                    //     serverChanges,
                    //     changeDiff,
                    //   },
                    //   { depth: null }
                    // );
                    // console.dir({ serverChanges }, { depth: null });
                    // expect(serverChanges).toBeDefined();
                    // expect(areChangesEmpty(serverChanges)).toBeFalsy();
                    for (const [collection, changes] of Object.entries(
                      changeDiff
                    )) {
                      if (!changes) {
                        console.warn('no changes', collection, changes);
                        continue;
                      }
                      for (const id of changes.deletes) {
                        await clientDb.delete(collection, id);
                      }
                      for (const [id, value] of changes.sets.entries()) {
                        if ('id' in value) {
                          await clientDb.insert(collection, value);
                        } else {
                          await clientDb.update(collection, id, value);
                        }
                      }
                    }

                    const clientFetchResults = await clientDb.fetch(query);

                    if (query.order != null) {
                      // console.dir(
                      //   { clientFetchResults, serverResults },
                      //   { depth: null }
                      // );
                      expect(clientFetchResults).toEqual(serverResults);
                    } else {
                      // console.dir(
                      //   {
                      //     clientFetchResults,
                      //     serverResults,
                      //     serverChanges,
                      //     changeDiff,
                      //   },
                      //   { depth: null }
                      // );
                      const clientResultMap =
                        resultArrToMap(clientFetchResults);
                      const serverResultMap = resultArrToMap(serverResults);
                      expect(clientResultMap).toEqual(serverResultMap);
                    }
                  } else {
                    const serverFetchResults = await serverDb.fetch(query);

                    // TODO verify subquery result order
                    if (query.order != null) {
                      // TODO verify order rather than expect order to be exactly the same.
                      // E.g. a result can satisfy the order in multiple different ways
                      // but still be correct in the face of equal values. I.e. it's an unstable sort
                      expect(serverResults).toEqual(serverFetchResults);
                    } else {
                      expect(resultArrToMap(serverResults)).toEqual(
                        resultArrToMap(serverFetchResults)
                      );
                    }
                  }
                  numCalls++;
                  resolve();
                } catch (e) {
                  reject(e);
                }
              }
            );

            const NUM_OPS = 10;
            const randomOps = deterministicMixArrays(
              [
                createRandomOpsForCollection('messages', NUM_OPS, seed),
                createRandomOpsForCollection(
                  'conversationMembers',
                  NUM_OPS,
                  seed * 2
                ),
                createRandomOpsForCollection(
                  'conversations',
                  NUM_OPS,
                  seed * 3
                ),
              ],
              seed
            );

            const flushChangesFrequency = [1, 2, 3, 4, 5, 6][seed % 6];
            // const updateViewFrequency = [1, 2, 3, 4, 5, 6][seed % 6];
            const broadcastChangesFrequency = [1, 2, 3, 4, 5, 6][seed % 6];

            let i = 0;
            for (const op of randomOps) {
              await applyOpToDB(serverDb, op);
              i++;
              if (i % flushChangesFrequency === 0) {
                await serverDb.updateQueryViews();
              }
              if (i % broadcastChangesFrequency === 0) {
                ranStep = Promise.resolve();
                // if the query subscription runs it should reassign ranStep
                // to a promise that resolves when the result checks finish
                serverDb.broadcastToQuerySubscribers();
                await ranStep;
              }
            }
          }
        }
        test.each(QUERIES_TO_TEST)('Query: %s', async (queryKey) => {
          return await testQueries([queryKey]);
        });
        // test('all queries concurrently', async () => {
        //   await testQueries(QUERIES_TO_TEST);
        // });
      }
    );
  });
});

function applyOpToDB(db: DB, op: EntityOperation) {
  if (op.type === 'insert') {
    return db.insert(op.collection!, op.value);
  } else if (op.type === 'update') {
    return db.update(op.collection!, op.id, op.value);
  } else {
    return db.delete(op.collection!, op.id);
  }
}

/**
 * This will recursively turn an array of results into a map with the id as the key
 * @param results
 */
function resultArrToMap(results: any[]) {
  return new Map(
    results.map((ent) => {
      const mappifiedEnt = Object.fromEntries(
        Object.entries(ent).map(([key, value]) => {
          if (Array.isArray(value)) {
            return [key, resultArrToMap(value)];
          }
          return [key, value];
        })
      );
      return [mappifiedEnt.id, mappifiedEnt];
    })
  );
}

describe('Concurrency ', () => {
  test('it does not lose changes when changes are buffered while updating views', async () => {
    const db = new DB({
      kv: new InMemoryTestKVStore({ delay: 1 }),
    });

    await db.insert('users', { id: '1', name: 'Alice' });
    await db.insert('users', { id: '2', name: 'Bob' });
    await db.insert('users', { id: '3', name: 'Charlie' });

    await db.insert('posts', { id: '1', userId: '1' });
    await db.insert('posts', { id: '2', userId: '2' });
    await db.insert('posts', { id: '3', userId: '2' });

    const query = {
      collectionName: 'users',
      where: [
        {
          exists: {
            collectionName: 'posts',
            where: [['userId', '=', '$1.id']],
          },
        },
      ],
    } satisfies CollectionQuery;

    const subSpy = vi.fn();
    const unsubscribe = db.subscribe(query, subSpy);
    await db.updateQueryViews();
    // Start a query view update
    // Concurrently make a change
    await Promise.all([
      db.updateQueryViews(),
      db.transact(async (tx) => {
        await tx.insert('users', { id: '4', name: 'Dave' });
        pause(1);
        await tx.insert('posts', { id: '5', userId: '4' });
      }),
      db.updateQueryViews(),
      db.insert('posts', { id: '4', userId: '3' }).then(() => {
        return db.delete('posts', '4');
      }),
      db.updateQueryViews(),
    ]);
    // Run an update again (should guarantee that the insert is now incorporated )
    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    expect(subSpy.mock.lastCall[0]).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '4', name: 'Dave' },
    ]);
  });

  test('unsubscribing between updates and broadcast does not cause error', async () => {
    const db = new DB({
      kv: new InMemoryTestKVStore({ delay: 1 }),
    });

    await db.insert('users', { id: '1', name: 'Alice' });
    await db.insert('users', { id: '2', name: 'Bob' });
    await db.insert('users', { id: '3', name: 'Charlie' });

    await db.insert('posts', { id: '1', userId: '1' });
    await db.insert('posts', { id: '2', userId: '2' });
    await db.insert('posts', { id: '3', userId: '2' });

    const query = {
      collectionName: 'users',
      where: [
        {
          exists: {
            collectionName: 'posts',
            where: [['userId', '=', '$1.id']],
          },
        },
      ],
    } satisfies CollectionQuery;

    const subSpy = vi.fn();
    const unsubscribe = db.subscribe(query, subSpy);
    await db.updateQueryViews();
    unsubscribe();
    expect(() => db.broadcastToQuerySubscribers()).not.toThrow();
    expect(subSpy).not.toHaveBeenCalled();
  });
});

function lcg(seed: number) {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32; // 4294967296
  let state = seed;
  return function (scale: number = 1) {
    state = (a * state + c) % m;
    return Math.floor((state / m) * scale); // Scale to 0, 1, 2
  };
}

function deterministicMixArrays(arrays: any[][], seed: number) {
  const rand = lcg(seed); // Seed it
  const mixed = [];
  let i = 0;
  while (arrays.some((arr) => arr.length > 0)) {
    const arrayIndex = rand(arrays.length);
    if (arrays[arrayIndex].length > 0) {
      mixed.push(arrays[arrayIndex].shift());
    }
    i++;
  }
  return mixed;
}
