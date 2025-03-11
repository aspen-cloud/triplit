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
    await db.awaitReady;
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
