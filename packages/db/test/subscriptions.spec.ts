import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src/db.js';
import { testSubscription } from './utils/test-subscription.js';

describe('subscriptions', () => {
  let db: DB;
  beforeEach(async () => {
    db = new DB();
    const docs = [
      { id: '1', name: 'Alice', major: 'Computer Science', dorm: 'Allen' },
      { id: '2', name: 'Bob', major: 'Biology', dorm: 'Battell' },
      { id: '3', name: 'Charlie', major: 'Computer Science', dorm: 'Battell' },
      { id: '4', name: 'David', major: 'Math', dorm: 'Allen' },
      { id: '5', name: 'Emily', major: 'Biology', dorm: 'Allen' },
    ];
    await Promise.all(docs.map((doc) => db.insert('students', doc)));
  });

  it('handles selection updates', async (done) => {
    const query = db
      .query('students')
      .Select(['major', 'id'])
      .Where([['name', '=', 'Alice']]);

    await testSubscription(db, query, [
      {
        check: (data) =>
          expect(data.find((e) => e.id === '1').major).toBe('Computer Science'),
      },
      {
        action: async () => {
          await db.update('students', '1', async (entity) => {
            entity.major = 'Math';
          });
        },
        check: (data) =>
          expect(data.find((e) => e.id === '1').major).toBe('Math'),
      },
    ]);
  });

  it('serializes data properly', async (done) => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              items: S.Set(S.String(), { default: S.Default.Set.empty() }),
              created_at: S.Date(),
            }),
          },
        },
      },
    });
    const query = db.query('users');
    // .select(['major', 'id'])
    // .where([['name', '=', 'Alice']])
    const now = new Date();
    const later = new Date(now.getTime() + 1000);
    await db.insert('users', {
      id: '1',
      name: 'Alice',
      items: new Set(['a', 'b', 'c']),
      created_at: now,
    });
    await testSubscription(db, query, [
      {
        check: (data) =>
          expect(data).toEqual([
            {
              id: '1',
              name: 'Alice',
              items: new Set(['a', 'b', 'c']),
              created_at: now,
            },
          ]),
      },
      {
        action: async () => {
          await db.insert('users', {
            id: '2',
            name: 'Bob',
            items: new Set(['d']),
            created_at: now,
          });
        },
        check: (data) =>
          expect(data).toEqual([
            {
              id: '1',
              name: 'Alice',
              items: new Set(['a', 'b', 'c']),
              created_at: now,
            },
            {
              id: '2',
              name: 'Bob',
              items: new Set(['d']),
              created_at: now,
            },
          ]),
      },
      {
        action: async () => {
          await db.update('users', '1', (user) => {
            user.items.add('d');
            user.created_at = later;
          });
        },
        check: (data) =>
          expect(data).toEqual([
            {
              id: '1',
              name: 'Alice',
              items: new Set(['a', 'b', 'c', 'd']),
              created_at: later,
            },
            {
              id: '2',
              name: 'Bob',
              items: new Set(['d']),
              created_at: now,
            },
          ]),
      },
    ]);
  });

  it('handles data entering query', async () => {
    const query = db
      .query('students')
      .Select(['name', 'major'])
      .Where([['dorm', '=', 'Battell']]);
    await testSubscription(db, query, [
      { check: (data) => expect(data.length).toBe(2) },
      {
        action: async () => {
          await db.update('students', '1', async (entity) => {
            entity.dorm = 'Battell';
          });
        },
        check: (data) => expect(data.length).toBe(3),
      },
    ]);
  });

  it('handles data leaving query', async () => {
    const query = db
      .query('students')
      .Select(['name', 'dorm'])
      .Where([['dorm', '=', 'Allen']]);
    await testSubscription(db, query, [
      {
        check: (data) => expect(data.length).toBe(3),
      },
      {
        action: async () => {
          await db.update('students', '1', async (entity) => {
            entity.dorm = 'Battell';
          });
        },
        check: (data) => expect(data.length).toBe(2),
      },
    ]);
  });

  it('data properly backfills with order and limit', async () => {
    const query = db
      .query('students')
      .Limit(2)
      .Order('major', 'ASC')
      .Where([['dorm', '=', 'Allen']]);

    await testSubscription(db, query, [
      {
        check: (data) => expect(data.length).toBe(2), // initial data
      },
      {
        action: async () => {
          await db.update('students', '1', async (entity) => {
            entity.dorm = 'Battell';
          });
        },
        check: (data) => expect(data.length).toBe(2), // backfills after delete
      },
      {
        action: async () => {
          await db.update('students', '4', async (entity) => {
            entity.dorm = 'Battell';
          });
        },
        check: (data) => expect(data.length).toBe(1), // cant backfill, no more matching data
      },
      {
        action: async () => {
          await db.update('students', '5', async (entity) => {
            entity.dorm = 'Battell';
          });
        },
        check: (data) => expect(data.length).toBe(0), // handles down to zero
      },
    ]);
  });

  it('handles order and limit', async () => {
    // return new Promise<void>(async (resolve, reject) => {
    let i = 0;
    let LIMIT = 2;

    await testSubscription(
      db,
      db.query('students').Limit(2).Order(['major', 'ASC']),
      [
        {
          check: (data) => {
            expect(data.length).toBe(LIMIT);
            expect([...data.values()].map((r) => r.major)).toEqual([
              'Biology',
              'Biology',
            ]);
          },
        },
        {
          action: async (results) => {
            await db.insert('students', {
              id: '6',
              name: 'Frank',
              major: 'Astronomy',
              dorm: 'Allen',
            });
          },
          check: (data) => {
            expect(data.length).toBe(LIMIT);
            expect([...data.values()].map((r) => r.major)).toEqual([
              'Astronomy',
              'Biology',
            ]);
          },
        },
      ]
    );
  });

  it('maintains order in subscription', async () => {
    const db = new DB();
    await testSubscription(
      db,
      db
        .query('students')
        .Where([['deleted', '=', false]])
        .Order(['age', 'ASC']),
      [
        { check: (data) => expect(Array.from(data.keys())).toEqual([]) },
        {
          action: async () => {
            await db.insert('students', {
              id: '1',
              name: 'Alice',
              age: 30,
              deleted: false,
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual(['1']),
        },
        {
          action: async () => {
            await db.insert('students', {
              id: '2',
              name: 'Bob',
              age: 21,
              deleted: false,
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual(['2', '1']),
        },
        {
          action: async () => {
            await db.insert('students', {
              id: '3',
              name: 'Charlie',
              age: 35,
              deleted: false,
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual(['2', '1', '3']),
        },
        {
          action: async () => {
            await db.insert('students', {
              id: '4',
              name: 'Alice',
              age: 32,
              deleted: false,
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual([
              '2',
              '1',
              '4',
              '3',
            ]),
        },
        {
          action: async () => {
            await db.update('students', '4', async (entity) => {
              entity.age = 29;
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual([
              '2',
              '4',
              '1',
              '3',
            ]),
        },
        {
          action: async () => {
            await db.update('students', '4', async (entity) => {
              entity.deleted = true;
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual(['2', '1', '3']),
        },
        {
          action: async () => {
            await db.update('students', '3', async (entity) => {
              entity.deleted = true;
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual(['2', '1']),
        },
        {
          action: async () => {
            await db.update('students', '2', async (entity) => {
              entity.deleted = true;
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual(['1']),
        },
        {
          action: async () => {
            await db.update('students', '1', async (entity) => {
              entity.deleted = true;
            });
          },
          check: (data) =>
            expect(Array.from(data.map((e) => e.id))).toEqual([]),
        },
      ]
    );
  });

  // Covers bug in past where subscriptions failed to fire if a transaction contained irrelevant data
  it('can handle multiple subscriptions', async () => {
    const db = new DB();
    const completedTodosQuery = db.query('todos').Where('completed', '=', true);
    const incompleteTodosQuery = db
      .query('todos')
      .Where('completed', '=', false);

    let completedCalls = 0;
    let completedAssertions = [
      (results: any[]) => {
        expect(results.length).toBe(0);
      },
      (results: any[]) => {
        expect(results.length).toBe(1);
        expect(results.find((e) => e.id === '1')).toBeTruthy();
      },
      (results: any[]) => {
        expect(results.length).toBe(2);
        expect(results.find((e) => e.id === '1')).toBeTruthy();
        expect(results.find((e) => e.id === '3')).toBeTruthy();
      },
    ];
    db.subscribe(completedTodosQuery, (data) => {
      completedAssertions[completedCalls](data);
      completedCalls++;
    });

    let incompleteCalls = 0;
    let incompleteAssertions = [
      (results: any[]) => {
        expect(results.length).toBe(0);
      },
      (results: any[]) => {
        expect(results.length).toBe(1);
        expect(results.find((e) => e.id === '2')).toBeTruthy();
      },
      (results: any[]) => {
        expect(results.length).toBe(2);
        expect(results.find((e) => e.id === '2')).toBeTruthy();
        expect(results.find((e) => e.id === '4')).toBeTruthy();
      },
    ];
    db.subscribe(incompleteTodosQuery, (data) => {
      incompleteAssertions[incompleteCalls](data);
      incompleteCalls++;
    });

    // initial results (empty)
    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    // only subscription A fires
    await db.insert('todos', {
      text: 'Buy milk',
      completed: true,
      id: '1',
    });

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    // only subscription B fires
    await db.insert('todos', {
      text: 'Buy eggs',
      completed: false,
      id: '2',
    });

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    // Both fire
    await db.transact(async (tx) => {
      await tx.insert('todos', {
        text: 'Buy bread',
        completed: true,
        id: '3',
      });
      await tx.insert('todos', {
        text: 'Buy butter',
        completed: false,
        id: '4',
      });
    });

    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();

    expect(completedCalls).toEqual(3);
    expect(incompleteCalls).toEqual(3);
  });
});

describe('single entity subscriptions', async () => {
  const db = new DB({
    schema: {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            major: S.String(),
            dorm: S.String(),
          }),
        },
      },
    },
  });
  const defaultData = [
    { id: '1', name: 'Alice', major: 'Computer Science', dorm: 'Allen' },
    { id: '2', name: 'Bob', major: 'Biology', dorm: 'Battell' },
    { id: '3', name: 'Charlie', major: 'Computer Science', dorm: 'Battell' },
    { id: '4', name: 'David', major: 'Math', dorm: 'Allen' },
    { id: '5', name: 'Emily', major: 'Biology', dorm: 'Allen' },
  ];
  beforeEach(async () => {
    await db.clear();
  });
  // 3) update other entities and not have it fire

  it('can subscribe to an entity', async () => {
    await Promise.all(defaultData.map((doc) => db.insert('students', doc)));
    await testSubscription(db, db.query('students').Where('id', '=', '3'), [
      {
        check: (results) => {
          const entity = results.find((e) => e.id === '3');
          expect(entity).toBeDefined();
          expect(results.length).toBe(1);
          expect(entity.id).toBe('3');
        },
      },
      {
        action: async (results) => {
          await db.transact(async (tx) => {
            await tx.update('students', '3', async (entity) => {
              entity.major = 'sociology';
            });
          });
        },
        check: (results) => {
          expect(results.find((e) => e.id === '3').major).toBe('sociology');
        },
      },
    ]);
  });
  it("should return nothing if the entity doesn't exist, and then update when it is inserted and deleted", async () => {
    await Promise.all(defaultData.map((doc) => db.insert('students', doc)));
    await testSubscription(db, db.query('students').Where('id', '=', '6'), [
      {
        check: (results) => {
          const entity = results.find((e) => e.id === '6');
          expect(entity).not.toBeDefined();
          expect(results.length).toBe(0);
        },
      },
      {
        action: async (results) => {
          await db.transact(async (tx) => {
            await tx.insert('students', {
              id: '6',
              name: 'Helen',
              major: 'Virtual Reality',
              dorm: 'Painter',
            });
          });
        },
        check: (results) => {
          const entity = results.find((e) => e.id === '6');
          expect(entity).toBeDefined();
          expect(results.length).toBe(1);
          expect(entity.id).toBe('6');
        },
      },
      {
        action: async () => {
          await db.delete('students', '6');
        },
        check: async (results) => {
          const entity = results.find((e) => e.id === '6');
          expect(entity).not.toBeDefined();
        },
      },
    ]);
  });
  it('should only fire updates when the entity in question is affected', async () => {
    await Promise.all(defaultData.map((doc) => db.insert('students', doc)));
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').Where('id', '=', '3'), spy);
      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      setTimeout(() => {
        expect(spy).toHaveBeenCalledOnce();
        resolve();
      }, 50);
    });
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').Where('id', '=', '3'), spy);
      await db.transact(async (tx) => {
        await tx.update('students', '1', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.transact(async (tx) => {
        await tx.update('students', '2', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      setTimeout(() => {
        expect(spy).toHaveBeenCalledOnce();
        resolve();
      }, 50);
    });
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').Where('id', '=', '3'), spy);
      await db.transact(async (tx) => {
        await tx.update('students', '1', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      await db.transact(async (tx) => {
        await tx.update('students', '3', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.updateQueryViews();
      db.broadcastToQuerySubscribers();
      setTimeout(() => {
        expect(spy).toHaveBeenCalledTimes(2);
        resolve();
      }, 50);
    });
  });
});

// TODO: recalculate subscripts on global var changes, session changes, etc
it.todo(
  'will refire the affected subscriptions when global variables change',
  async () => {
    const db = new DB({
      schema: {
        collections: {
          students: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              major: S.String(),
              dorm: S.String(),
            }),
          },
        },
      },
      variables: {
        major1: 'Computer Science',
        major2: 'Biology',
      },
    });
    const defaultData = [
      { id: '1', name: 'Alice', major: 'Computer Science', dorm: 'Allen' },
      { id: '2', name: 'Bob', major: 'Biology', dorm: 'Battell' },
      {
        id: '3',
        name: 'Charlie',
        major: 'Computer Science',
        dorm: 'Battell',
      },
      { id: '4', name: 'David', major: 'Math', dorm: 'Allen' },
      { id: '5', name: 'Emily', major: 'Biology', dorm: 'Allen' },
    ];
    const changedVariablesSubscriptionSpy = vi.fn();
    const unchangedVariablesSubscriptionSpy = vi.fn();

    await Promise.all(defaultData.map((doc) => db.insert('students', doc)));
    await new Promise<void>(async (resolve) => {
      db.subscribe(
        db.query('students').Where('major', '=', '$global.major1'),
        changedVariablesSubscriptionSpy
      );
      db.subscribe(
        db.query('students').Where('major', '=', '$global.major2'),
        unchangedVariablesSubscriptionSpy
      );
      await db.insert('students', {
        id: '6',
        name: 'Frank',
        major: 'Computer Science',
        dorm: 'Painter',
      });
      setTimeout(() => {
        expect(changedVariablesSubscriptionSpy).toHaveBeenCalledTimes(2);
        expect(unchangedVariablesSubscriptionSpy).toHaveBeenCalledTimes(1);
        expect(
          changedVariablesSubscriptionSpy.mock.lastCall?.[0].map(
            (e: any) => e.id
          )
        ).toEqual(['1', '3', '6']);
        resolve();
      }, 50);
    });
    changedVariablesSubscriptionSpy.mockClear();
    unchangedVariablesSubscriptionSpy.mockClear();

    // change the global variable should cause the subscription with the variable to refire
    // and the subscription without the variable to not refire
    await new Promise<void>(async (resolve) => {
      db.updateGlobalVariables({ major1: 'Biology', major2: 'Biology' });
      setTimeout(() => {
        expect(changedVariablesSubscriptionSpy).toHaveBeenCalledOnce;
        expect(unchangedVariablesSubscriptionSpy).toBeCalledTimes(0);
        expect(
          changedVariablesSubscriptionSpy.mock.lastCall?.[0].map(
            (e: any) => e.id
          )
        ).toEqual(['2', '5']);
        resolve();
      }, 50);
    });
  }
);

it.todo('Can subscribe to limit without order, uses id as backup');

it('handles updates to deeply nested inclusions', async () => {
  const schema = S.Collections({
    branches: {
      schema: S.Schema({
        id: S.Id(),
      }),
      relationships: {
        runs: S.RelationMany('runs', {
          where: [['branch_name', '=', '$1.id']],
        }),
        latest_run: S.RelationOne('runs', {
          where: [['branch_name', '=', '$1.id']],
          order: [['created_at', 'DESC']],
        }),
      },
    },
    runs: {
      schema: S.Schema({
        id: S.Id(),
        created_at: S.Date({ default: S.Default.now() }),
        benchmark: S.String(),
        branch_name: S.String(),
        commit_hash: S.String(),
        commit_message: S.String(),
        results: S.Record({
          memory_avg: S.Number(),
          memory_max: S.Number(),
          memory_measurements: S.Optional(S.Number()),
          run_metadata: S.Optional(S.String()),
          runtime_avg: S.Number(),
          runtime_max: S.Number(),
          runtime_measurements: S.Optional(S.Number()),
        }),
        scenario: S.Optional(S.String()),
        dataset: S.Optional(S.String()),
        storage: S.Optional(S.String()),
        task: S.Optional(S.String()),
        params: S.Optional(S.String()),
      }),
      relationships: {
        branch: S.RelationById('branches', '$1.branch_name'),
      },
    },
    benchmarks: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        description: S.Optional(S.String()),
        created_at: S.Date({ default: S.Default.now() }),
        deprecated: S.Optional(S.Boolean()),
      }),
      relationships: {
        runs: S.RelationMany('runs', { where: [['benchmark', '=', '$1.id']] }),
        latest_run: S.RelationOne('runs', {
          where: [['benchmark', '=', '$1.id']],
          order: [['created_at', 'DESC']],
        }),
      },
    },
  });

  const db = new DB({
    schema: { collections: schema },
  });

  const BRANCHES = [
    // Multiple runs on some benchmarks
    { id: 'master' },
    // Multiple runs on some benchamrks
    { id: 'dev' },
    // No runs
    { id: 'feature-1' },
  ];
  const BENCHMARKS = [
    { id: 'benchmark-1', name: 'benchmark-1', deprecated: false },
    { id: 'benchmark-2', name: 'benchmark-2', deprecated: false },
    { id: 'benchmark-3', name: 'benchmark-3', deprecated: false },
  ];
  const RUNS = [
    {
      id: 'run-1',
      benchmark: 'benchmark-1',
      branch_name: 'master',
      commit_hash: 'hash-1',
      commit_message: 'commit message 1',
      created_at: new Date('2023-01-01'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
    {
      id: 'run-2',
      benchmark: 'benchmark-1',
      branch_name: 'dev',
      commit_hash: 'hash-2',
      commit_message: 'commit message 2',
      created_at: new Date('2023-01-02'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
    {
      id: 'run-3',
      benchmark: 'benchmark-2',
      branch_name: 'master',
      commit_hash: 'hash-3',
      commit_message: 'commit message 3',
      created_at: new Date('2023-01-02'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
    {
      id: 'run-4',
      benchmark: 'benchmark-2',
      branch_name: 'dev',
      commit_hash: 'hash-4',
      commit_message: 'commit message 4',
      created_at: new Date('2023-01-03'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
  ];

  await db.transact(async (tx) => {
    for (const branch of BRANCHES) {
      await tx.insert('branches', branch);
    }
    for (const benchmark of BENCHMARKS) {
      await tx.insert('benchmarks', benchmark);
    }
    for (const run of RUNS) {
      await tx.insert('runs', run);
    }
  });

  const query = db
    .query('branches')
    .Order('id', 'ASC')
    .SubqueryOne('latest_run', {
      collectionName: 'runs',
      order: [['created_at', 'DESC']],
      where: [['branch_name', '=', '$1.id']],
    })
    .SubqueryMany('benchmarks', {
      collectionName: 'benchmarks',
      where: [['deprecated', '=', false]],
      include: {
        latest_branch_run: {
          subquery: {
            collectionName: 'runs',
            order: [['created_at', 'DESC']],
            where: [
              ['benchmark', '=', '$1.id'],
              ['branch_name', '=', '$2.id'],
            ],
          },
          cardinality: 'one',
        },
      },
    });

  const spy = vi.fn();

  function currentDBSnapshot() {
    return db.fetch(query);
  }
  function lastSubscriptionCall() {
    return spy.mock.calls[spy.mock.calls.length - 1][0];
  }
  async function expectSnapshotToEqualSubscriptionCall() {
    await db.updateQueryViews();
    db.broadcastToQuerySubscribers();
    expect(await currentDBSnapshot()).toEqual(lastSubscriptionCall());
  }

  const unsub = db.subscribe(query, spy);

  await expectSnapshotToEqualSubscriptionCall();
  await expectSnapshotToEqualSubscriptionCall();
  // add a new branch and associated run
  await db.transact(async (tx) => {
    await tx.insert('branches', {
      id: 'feature-2',
    });
    await tx.insert('runs', {
      id: 'run-5',
      benchmark: 'benchmark-1',
      branch_name: 'feature-2',
      commit_hash: 'hash-5',
      commit_message: 'commit message 5',
      created_at: new Date('2023-01-04'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    });
  });
  await expectSnapshotToEqualSubscriptionCall();
  // deprecate an existing benchmark
  await db.update('benchmarks', 'benchmark-1', (entity) => {
    entity.deprecated = true;
  });
  await expectSnapshotToEqualSubscriptionCall();
  // create a new benchmark
  await db.insert('benchmarks', {
    id: 'benchmark-4',
    name: 'benchmark-4',
    deprecated: false,
  });
  await expectSnapshotToEqualSubscriptionCall();
  // insert multiple new runs that become the most recent run for all benchmarks
  await db.transact(async (tx) => {
    await tx.insert('runs', {
      id: 'run-6',
      benchmark: 'benchmark-4',
      branch_name: 'feature-2',
      commit_hash: 'hash-6',
      commit_message: 'commit message 6',
      created_at: new Date('2023-01-05'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    });
    await tx.insert('runs', {
      id: 'run-7',
      benchmark: 'benchmark-3',
      branch_name: 'feature-2',
      commit_hash: 'hash-7',
      commit_message: 'commit message 7',
      created_at: new Date('2023-01-06'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    });
  });
  await expectSnapshotToEqualSubscriptionCall();
});
