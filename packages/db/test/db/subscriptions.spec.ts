import { InMemoryTupleStorage } from '@triplit/tuple-database';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DB, CollectionQueryBuilder, Schema as S } from '../../src';
import {
  testSubscription,
  testSubscriptionTriples,
} from '../utils/test-subscription.js';
import { genToArr } from '../../src/utils/generator.js';

describe('subscriptions', () => {
  let db: DB;
  beforeEach(async () => {
    db = new DB({ source: new InMemoryTupleStorage() });
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
      .select(['major', 'id'])
      .where([['name', '=', 'Alice']])
      .build();
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

  it('handles data entering query', async () => {
    const query = db
      .query('students')
      .select(['name', 'major'])
      .where([['dorm', '=', 'Battell']])
      .build();
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

  it('can subscribe to Triples', async () => {
    const query = db
      .query('students')
      .select(['name', 'major'])
      .where([['dorm', '=', 'Battell']])
      .build();
    await testSubscriptionTriples(db, query, [
      { check: (data) => expect(data.length).toBe(10) },
      {
        action: async () => {
          await db.update('students', '1', async (entity) => {
            entity.dorm = 'Battell';
          });
        },
        check: (data) => expect(data.length).toBe(5),
      },
    ]);
  });

  it('handles data leaving query', async () => {
    const query = db
      .query('students')
      .select(['name', 'dorm'])
      .where([['dorm', '=', 'Allen']])
      .build();
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

  it('emits triples even when entity is removed from query', async () => {
    const spy = vi.fn();
    const unsubscribe = db.subscribeTriples(
      CollectionQueryBuilder('students')
        .select(['name', 'major'])
        .where([['dorm', '!=', 'Battell']])
        .build(),
      (triples) => {
        spy(triples);
      }
    );

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    await db.update('students', '1', async (entity) => {
      entity.dorm = 'Battell';
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });

    expect(spy).toHaveBeenCalledTimes(2);

    expect(spy.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(spy.mock.calls[1][0].length).toBeGreaterThan(0);

    await unsubscribe();
  });

  it('data properly backfills with order and limit', async () => {
    const query = db
      .query('students')
      .limit(2)
      .order('major', 'ASC')
      .where([['dorm', '=', 'Allen']])
      .build();

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
      db.query('students').limit(2).order(['major', 'ASC']).build(),
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
    const db = new DB({ source: new InMemoryTupleStorage() });
    await testSubscription(
      db,
      db
        .query('students')
        .where([['deleted', '=', false]])
        .order(['age', 'ASC'])
        .build(),
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

  it('can subscribe to just triples', async () => {
    const LIMIT = 2;
    await testSubscriptionTriples(
      db,
      db.query('students').limit(2).order(['major', 'ASC']).build(),
      [
        { check: (data) => expect(data.length).toBe(LIMIT * 5) },
        {
          action: async () => {
            await db.insert('students', {
              id: '6',
              name: 'Frank',
              major: 'Astronomy',
              dorm: 'Allen',
            });
          },
          check: (data) => {
            expect(data).toHaveLength(5);
          },
        },
      ]
    );
  });

  // Covers bug in past where subscriptions failed to fire if a transaction contained irrelevant data
  it('can handle multiple subscriptions', async () => {
    const db = new DB();
    const completedTodosQuery = db
      .query('todos')
      .where('completed', '=', true)
      .build();
    const incompleteTodosQuery = db
      .query('todos')
      .where('completed', '=', false)
      .build();

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

    // only subscription A fires
    await new Promise<void>((res) =>
      setTimeout(async () => {
        await db.insert('todos', {
          text: 'Buy milk',
          completed: true,
          id: '1',
        });
        res();
      }, 20)
    );
    // only subscription B fires
    await new Promise<void>((res) =>
      setTimeout(async () => {
        await db.insert('todos', {
          text: 'Buy eggs',
          completed: false,
          id: '2',
        });
        res();
      }, 20)
    );

    // Both fire
    await new Promise<void>((res) =>
      setTimeout(async () => {
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
        res();
      }, 20)
    );

    await new Promise<void>((res) => setTimeout(res, 20));
    expect(completedCalls).toEqual(3);
    expect(incompleteCalls).toEqual(3);
  });
});

describe('single entity subscriptions', async () => {
  const storage = new InMemoryTupleStorage();
  const db = new DB({
    source: storage,
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
    await testSubscription(db, db.query('students').id('3').build(), [
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
    await testSubscription(db, db.query('students').id('6').build(), [
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
          const allTriples = await genToArr(db.tripleStore.findByEntity());
          await db.tripleStore.deleteTriples(allTriples);
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
      db.subscribe(db.query('students').id('3').build(), spy);
      setTimeout(() => {
        expect(spy).toHaveBeenCalledOnce();
        resolve();
      }, 50);
    });
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').id('3').build(), spy);
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
      setTimeout(() => {
        expect(spy).toHaveBeenCalledOnce();
        resolve();
      }, 50);
    });
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').id('3').build(), spy);
      await db.transact(async (tx) => {
        await tx.update('students', '1', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.transact(async (tx) => {
        await tx.update('students', '3', async (entity) => {
          entity.major = 'sociology';
        });
      });
      setTimeout(() => {
        expect(spy).toHaveBeenCalledTimes(2);
        resolve();
      }, 50);
    });
  });
});

describe('subscriptions with variables', () => {
  it('will refire the affected subscriptions when global variables change', async () => {
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
        db.query('students').where('major', '=', '$global.major1').build(),
        changedVariablesSubscriptionSpy
      );
      db.subscribe(
        db.query('students').where('major', '=', '$global.major2').build(),
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
  });
});

it.todo('Can subscribe to limit without order, uses id as backup');

it('delta triples OR statments', async () => {
  const query = {
    collectionName: 'messages',
    where: [
      {
        mod: 'or',
        filters: [
          {
            mod: 'and',
            filters: [
              {
                exists: {
                  collectionName: 'groups',
                  where: [
                    ['id', '=', '$1.group_id'],
                    {
                      exists: {
                        collectionName: 'members',
                        where: [
                          ['group_id', '=', '$1.id'],
                          ['user_id', '=', '$session.user_id'],
                          ['role', '=', 'member'],
                        ],
                      },
                    },
                  ],
                },
              },
              ['deleted_at', '=', null],
            ],
          },
          {
            exists: {
              collectionName: 'groups',
              where: [
                ['id', '=', '$1.group_id'],
                {
                  exists: {
                    collectionName: 'members',
                    where: [
                      ['group_id', '=', '$1.id'],
                      ['user_id', '=', '$session.user_id'],
                      ['role', '=', 'admin'],
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const db = new DB();
  await db.insert('users', { id: 'alice', name: 'Alice' });
  await db.insert('users', { id: 'bob', name: 'Bob' });
  await db.insert('users', { id: 'charlie', name: 'Charlie' });
  await db.insert('users', { id: 'david', name: 'David' });
  await db.insert('groups', { id: '1' });
  await db.insert('groups', { id: '2' });
  await db.insert('groups', { id: '3' });
  await db.insert('members', {
    id: '1_alice',
    group_id: '1',
    user_id: 'alice',
    role: 'admin',
  });
  await db.insert('members', {
    id: '1_bob',
    group_id: '1',
    user_id: 'bob',
    role: 'member',
  });
  await db.insert('members', {
    id: '2_bob',
    group_id: '2',
    user_id: 'bob',
    role: 'admin',
  });
  await db.insert('members', {
    id: '2_charlie',
    group_id: '2',
    user_id: 'charlie',
    role: 'member',
  });
  await db.insert('members', {
    id: '3_charlie',
    group_id: '3',
    user_id: 'charlie',
    role: 'admin',
  });
  await db.insert('members', {
    id: '3_david',
    group_id: '3',
    user_id: 'david',
    role: 'member',
  });

  const aliceDB = db.withSessionVars({ user_id: 'alice' });

  await testSubscriptionTriples(aliceDB, query, [
    {
      check: (data) => {
        expect(data.length).toBe(0);
      },
    },
    {
      action: async () => {
        await db.insert('messages', {
          id: '1',
          group_id: '1',
          author_id: 'alice',
          text: 'Hello',
          deleted_at: null,
        });
      },
      check: (data) => {
        expect(data.length).toBeGreaterThan(0);
      },
    },
    {
      action: async () => {
        await db.insert('messages', {
          id: '2',
          group_id: '2',
          author_id: 'bob',
          text: 'Hello',
          deleted_at: null,
        });
      },
      noopTimeout: 500,
      check: (data) => {},
    },
  ]);
});

