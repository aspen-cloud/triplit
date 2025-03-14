import { describe, expect, it, beforeAll, test } from 'vitest';
import { DB } from '../src';
import { classes, departments } from './sample_data/school.js';
import { testDBAndTransaction } from './utils/db-helpers.js';
import { Schema as S } from '../src/schema/builder.js';
import {
  SessionVariableNotFoundError,
  WritePermissionError,
} from '../src/errors.ts';

describe('DB Variables', () => {
  const DEPARTMENT = 'dep-1';
  const db = new DB({
    variables: {
      DEPARTMENT,
    },
  });

  const classesInDep = classes.filter((c) => c.department === DEPARTMENT);

  beforeAll(async () => {
    await db.transact(async (tx) => {
      for (const cls of classes) {
        await tx.insert('classes', cls);
      }
      for (const dpt of departments) {
        await tx.insert('departments', dpt);
      }
    });
  });

  it('fetch supports variables', async () => {
    const query = db
      .query('classes')
      .Where([['department', '=', '$global.DEPARTMENT']]);
    await testDBAndTransaction(
      () => db,
      async (db) => {
        const result = await db.fetch(query);
        expect(result).toHaveLength(classesInDep.length);
        expect(
          [...result.values()].every((r) => r.department === DEPARTMENT)
        ).toBeTruthy();
      }
    );
  });

  it('fetchOne supports variables', async () => {
    const query = db
      .query('classes')
      .Where([['department', '=', '$global.DEPARTMENT']]);
    await testDBAndTransaction(
      () => db,
      async (db) => {
        const result = await db.fetchOne(query);
        expect(result.department).toBe(DEPARTMENT);
      }
    );
  });

  it('fetchById supports variables', async () => {
    await testDBAndTransaction(
      () => db,
      async (db) => {
        const result = await db.fetchById('departments', '$global.DEPARTMENT');
        expect(result?.id).toBe(DEPARTMENT);
      }
    );
  });

  it('id supports variables', async () => {
    const query = db.query('departments').Id('$global.DEPARTMENT');
    await testDBAndTransaction(
      () => db,
      async (db) => {
        const result = await db.fetch(query);
        expect(result).toHaveLength(1);
        expect(result.find((e) => e.id === 'dep-1')?.id).toBe(DEPARTMENT);
      }
    );
  });

  it('can use variables in query with simple grouped filter', async () => {
    const query = db
      .query('classes')
      .Where([
        { mod: 'and', filters: [['department', '=', '$global.DEPARTMENT']] },
      ]);
    const result = await db.fetch(query);
    expect(result).toHaveLength(classesInDep.length);
    expect(
      [...result.values()].every((r) => r.department === DEPARTMENT)
    ).toBeTruthy();
  });

  it('can use variables in query deeply nested grouped filter', async () => {
    const query = db.query('classes').Where([
      {
        mod: 'and',
        filters: [
          {
            mod: 'and',
            filters: [
              {
                mod: 'and',
                filters: [['department', '=', '$global.DEPARTMENT']],
              },
            ],
          },
        ],
      },
    ]);
    await testDBAndTransaction(
      () => db,
      async (db) => {
        const result = await db.fetch(query);
        expect(result).toHaveLength(classesInDep.length);
        expect(
          [...result.values()].every((r) => r.department === DEPARTMENT)
        ).toBeTruthy();
      }
    );
  });

  it('can update global variables', async () => {
    const query = db
      .query('classes')
      .Where([['department', '=', '$global.DEPARTMENT']]);

    const preUpdateResult = await db.fetch(query);
    expect(preUpdateResult.length).toBe(3);

    db.updateGlobalVariables({ DEPARTMENT: 'dep-2' });

    const postUpdateResult = await db.fetch(query);
    expect(postUpdateResult.length).toBe(2);
  });

  it('can provide variables via a query', async () => {
    const query = db
      .query('classes')
      .Where([['department', '=', '$query.DEPARTMENT']]);

    const builtQuery1 = query.Vars({ DEPARTMENT: 'dep-1' });
    const builtQuery2 = query.Vars({ DEPARTMENT: 'dep-2' });

    await testDBAndTransaction(
      () => db,
      async (db) => {
        const result1 = await db.fetch(builtQuery1);
        const result2 = await db.fetch(builtQuery2);

        expect(result1.length).toBe(3);
        expect(result2.length).toBe(2);
      }
    );
  });

  it.todo('insert supports variables');
  it.todo('update supports variables');

  it.todo('supports updating variables with active subscriptions');
});

describe('sessions', () => {
  it('can create scoped variables with sessions', () => {
    const db = new DB({ variables: { test: 'variable' } });
    expect(db.systemVars).toEqual({
      $global: { test: 'variable' },
      $session: {},
    });
    {
      const session = db.withSessionVars({ foo: 'bar' });
      expect(session.systemVars).toEqual({
        $global: { test: 'variable' },
        $session: { foo: 'bar' },
      });
      expect(db.systemVars).toEqual({
        $global: { test: 'variable' },
        $session: {},
      });
    }
    {
      const session1 = db.withSessionVars({ foo: 'bar' });

      expect(session1.systemVars).toEqual({
        $global: { test: 'variable' },
        $session: {
          foo: 'bar',
        },
      });

      const session2 = session1.withSessionVars({ bar: 'baz' });
      expect(session2.systemVars).toEqual({
        $global: { test: 'variable' },
        $session: {
          bar: 'baz',
        },
      });

      expect(db.systemVars).toEqual({
        $global: { test: 'variable' },
        $session: {},
      });
    }
  });

  it('can create multiple sessions and use their variables in queries independently', async () => {
    const db = new DB();
    const sessionFoo = db.withSessionVars({ name: 'foo' });
    const sessionBar = db.withSessionVars({ name: 'bar' });

    // Insert some data
    await sessionFoo.insert('test', { id: '1', name: 'bar', visible: false });
    await sessionBar.insert('test', { id: '2', name: 'foo', visible: true });
    await db.insert('test', { id: '3', bar: 'baz', visible: true });

    const query = db
      .query('test')
      .Where(['name', '=', '$session.name'], ['visible', '=', true]);
    {
      expect(await db.fetch(db.query('test'))).toHaveLength(3);
    }

    {
      const resp = await sessionFoo.fetch(query);
      expect(resp).toHaveLength(1);
      expect(resp.find((e) => e.id === '2')).toMatchObject({
        id: '2',
        name: 'foo',
        visible: true,
      });
    }
    {
      const resp = await sessionBar.fetch(query);
      expect(resp).toHaveLength(0);
    }
  });
});

describe('variable conflicts', () => {
  const baseDB = new DB({
    variables: {
      name: 'CS101',
    },
    schema: {
      collections: {
        classes: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            department_id: S.String(),
          }),
          relationships: {
            department: S.RelationById('departments', '$1.department_id'),
          },
        },
        departments: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            head_id: S.String(),
          }),
          relationships: {
            head: S.RelationById('faculty', '$1.head_id'),
            faculty: S.RelationMany('faculty', {
              where: [['department_id', '=', '$1.id']],
            }),
          },
        },
        faculty: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            department_id: S.String(),
          }),
          relationships: {
            department: S.RelationById('departments', '$1.department_id'),
          },
        },
      },
    },
  });

  describe('handles conflicting variable names', () => {
    let db: typeof baseDB;

    beforeAll(async () => {
      db = baseDB.withSessionVars({ name: 'MATH101' });
      await db.insert('faculty', {
        id: '1',
        name: 'Alice',
        department_id: 'CS',
      });
      await db.insert('faculty', {
        id: '2',
        name: 'Bob',
        department_id: 'MATH',
      });
      await db.insert('faculty', {
        id: '3',
        name: 'Charlie',
        department_id: 'CS',
      });
      await db.insert('faculty', {
        id: '4',
        name: 'David',
        department_id: 'MATH',
      });
      await db.insert('departments', {
        id: 'CS',
        name: 'Computer Science',
        head_id: '1',
      });
      await db.insert('departments', {
        id: 'MATH',
        name: 'Mathematics',
        head_id: '2',
      });
      await db.insert('classes', {
        id: '1',
        name: 'CS101',
        department_id: 'CS',
      });
      await db.insert('classes', {
        id: '2',
        name: 'MATH101',
        department_id: 'MATH',
      });
      await db.insert('classes', {
        id: '3',
        name: 'CS102',
        department_id: 'CS',
      });
      await db.insert('classes', {
        id: '4',
        name: 'MATH102',
        department_id: 'MATH',
      });
    });

    it('can query with global variables', async () => {
      const query = db.query('classes').Where(['name', '=', '$global.name']);
      const result = await db.fetch(query);
      expect(result.length).toBe(1);
      expect(result.map((e) => e.id)).toStrictEqual(['1']);
    });

    it('can query with session variables', async () => {
      const query = db.query('classes').Where(['name', '=', '$session.name']);
      const result = await db.fetch(query);
      expect(result.length).toBe(1);
      expect(result.map((e) => e.id)).toStrictEqual(['2']);
    });

    it('can query with query variables', async () => {
      const query = db
        .query('classes')
        .Vars({ name: 'CS102' })
        .Where(['name', '=', '$query.name']);
      const result = await db.fetch(query);
      expect(result.length).toBe(1);
      expect(result.map((e) => e.id)).toStrictEqual(['3']);
    });

    describe('can query with subquery variables', async () => {
      beforeAll(async () => {
        await db.insert('faculty', {
          id: '5',
          name: 'Eve',
          department_id: 'EVE',
        });
        await db.insert('departments', {
          id: 'EVE',
          name: 'Eve',
          head_id: '5',
        });
        await db.insert('classes', {
          id: '5',
          name: 'Eve',
          department_id: 'EVE',
        });
        await db.insert('classes', {
          id: '6',
          name: 'EVE101',
          department_id: 'EVE',
        });
        await db.insert('classes', {
          id: '7',
          name: 'EVE102',
          department_id: 'EVE',
        });
      });

      it('can reference own entity in subquery', async () => {
        const query1 = db
          .query('classes')
          .Where(['department.head.name', '=', '$0.name']);
        const result1 = await db.fetch(query1);
        expect(result1.length).toBe(1);
        expect(result1.map((e) => e.id)).toStrictEqual(['5']);
      });

      describe('can use reference to self and access entity relations', async () => {
        test('single level', async () => {
          const query2 = db
            .query('classes')
            .Where(['department.head.name', '=', '$0.department.name']);
          const result2 = await db.fetch(query2);
          expect(result2.length).toBe(3);
          expect(result2.map((e) => e.id)).toStrictEqual(['5', '6', '7']);
        });
        test('multi level', async () => {
          const query3 = db
            .query('classes')
            .Where(['department.head.name', '=', '$0.department.head.name']);
          const result3 = await db.fetch(query3);
          expect(result3.length).toBe(7);
        });
      });
    });
  });

  it('Will throw an error if a variable is referenced that does not exist', async () => {
    const db = baseDB.withSessionVars({ name: 'MATH101' });
    await expect(
      db.fetch(db.query('classes').Where(['name', '=', '$session.$name']))
    ).rejects.toThrow(SessionVariableNotFoundError);
  });

  it('can access a nested data and record types via a variable', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              address: S.Record({
                street: S.String(),
                city_id: S.String(),
              }),
            }),
            relationships: {
              city: S.RelationById('cities', '$1.address.city_id'),
            },
          },
          cities: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              state: S.String(),
            }),
          },
        },
      },
    });
    await db.insert('cities', { id: '1', name: 'Springfield', state: 'IL' });
    await db.insert('cities', { id: '2', name: 'Chicago', state: 'IL' });
    await db.insert('users', {
      id: '1',
      name: 'Alice',
      address: {
        street: '123 Main St',
        city_id: '1',
      },
    });
    await db.insert('users', {
      id: '2',
      name: 'Bob',
      address: {
        street: '456 Elm St',
        city_id: '2',
      },
    });

    // Access nested paths in subqueries
    {
      const query = db.query('users').Select(['id']).Include('city');
      const result = await db.fetch(query);
      expect(result.find((e) => e.id === '1')).toMatchObject({
        id: '1',
        city: { id: '1', name: 'Springfield', state: 'IL' },
      });
      expect(result.find((e) => e.id === '2')).toMatchObject({
        id: '2',
        city: { id: '2', name: 'Chicago', state: 'IL' },
      });
    }

    // Access nested paths in variables
    {
      const sessionDB = db.withSessionVars({ city: { id: '2' } });
      const query = sessionDB
        .query('users')
        .Where(['address.city_id', '=', '$session.city.id']);
      const result = await sessionDB.fetch(query);
      expect(result.length).toBe(1);
      expect(result.find((e) => e.id === '2')).toMatchObject({
        id: '2',
        name: 'Bob',
        address: {
          street: '456 Elm St',
          city_id: '2',
        },
      });
    }
  });

  describe('backwards compatibility', () => {
    // TODO: is there a good case to keep this if we have the chance to drop it?
    it.skip('$SESSION_USER_ID is translated to $session.SESSION_USER_ID', async () => {
      const db = new DB({
        schema: {
          roles: {
            user: {
              match: {
                SESSION_USER_ID: '$SESSION_USER_ID',
              },
            },
          },
          collections: {
            users: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
              }),
              permissions: {
                user: {
                  read: {
                    // This is what we would expect a user to write:
                    // filter: [['id', '=', '$role.SESSION_USER_ID']],
                    filter: [['id', '=', '$SESSION_USER_ID']],
                  },
                },
              },
            },
          },
        },
      });
      await db.insert('users', { id: '1', name: 'Alice' }, { skipRules: true });
      await db.insert('users', { id: '2', name: 'Bob' }, { skipRules: true });

      const aliceDB = db.withSessionVars({ SESSION_USER_ID: '1' });
      const bobDB = db.withSessionVars({ SESSION_USER_ID: '2' });
      {
        const result = await aliceDB.fetch(aliceDB.query('users'));
        expect(result.length).toBe(1);
        expect(result.find((e) => e.id === '1')).toMatchObject({
          id: '1',
          name: 'Alice',
        });
      }

      {
        const result = await bobDB.fetch(db.query('users'));
        expect(result.length).toBe(1);
        expect(result.find((e) => e.id === '2')).toMatchObject({
          id: '2',
          name: 'Bob',
        });
      }
    });
    it('rules properly reference current entity', async () => {
      const db = new DB({
        schema: {
          roles: {
            user: {
              match: {
                SESSION_USER_ID: '$SESSION_USER_ID',
              },
            },
          },
          collections: {
            departments: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
                head_id: S.String(),
              }),
              relationships: {
                head: S.RelationById('faculty', '$head_id'),
              },
              permissions: {
                user: {
                  read: {
                    filter: [true],
                  },
                  insert: {
                    // Head must be in the department
                    filter: [['head.department_id', '=', '$id']],
                  },
                },
              },
            },
            faculty: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
                department_id: S.String(),
              }),
            },
            posts: {
              schema: S.Schema({
                id: S.String(),
                content: S.String(),
                author_id: S.String(),
              }),
              relationships: {
                author: S.RelationById('faculty', '$author_id'),
              },
              permissions: {
                user: {
                  read: {
                    filter: [true],
                  },
                  insert: {
                    filter: [['author_id', '=', '$role.SESSION_USER_ID']],
                  },
                },
              },
            },
          },
        },
      });

      await db.insert(
        'faculty',
        {
          id: '1',
          name: 'Alice',
          department_id: 'CS',
        },
        { skipRules: true }
      );
      await db.insert(
        'faculty',
        {
          id: '2',
          name: 'Bob',
          department_id: 'MATH',
        },
        { skipRules: true }
      );

      const aliceDB = db.withSessionVars({ SESSION_USER_ID: '1' });

      // Check that referential vars match
      // can insert if the head is in department
      await expect(
        aliceDB.insert('departments', {
          id: 'CS',
          name: 'Computer Science',
          head_id: '1',
        })
      ).resolves.not.toThrow();
      // fails if the head is not in department
      await expect(
        aliceDB.insert('departments', {
          id: 'MATH',
          name: 'Mathematics',
          head_id: '1',
        })
      ).rejects.toThrow(WritePermissionError);
      // succeeds if the head is in department
      await expect(
        aliceDB.insert('departments', {
          id: 'MATH',
          name: 'Mathematics',
          head_id: '2',
        })
      ).resolves.not.toThrow();

      {
        await expect(
          aliceDB.insert('posts', { id: '1', content: 'Hello', author_id: '1' })
        ).resolves.not.toThrow();
        await expect(
          aliceDB.insert('posts', { id: '2', content: 'Hello', author_id: '2' })
        ).rejects.toThrow(WritePermissionError);
      }
    });
    it('Subqueries properly reference parent entity', async () => {
      const db = new DB({
        schema: {
          collections: {
            users: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
              }),
              relationships: {
                posts: S.RelationMany('posts', {
                  where: [['author_id', '=', '$id']],
                }),
              },
            },
            posts: {
              schema: S.Schema({
                id: S.String(),
                content: S.String(),
                author_id: S.String(),
              }),
              relationships: {
                author: S.RelationById('users', '$author_id'),
              },
            },
          },
        },
      });

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('posts', { id: '1', content: 'Hello1', author_id: '1' });
      await db.insert('posts', { id: '2', content: 'Hello2', author_id: '1' });
      await db.insert('posts', { id: '3', content: 'Hello3', author_id: '2' });
      await db.insert('posts', { id: '4', content: 'Hello4', author_id: '2' });

      {
        const result = await db.fetch(db.query('users').Include('posts'));
        expect(result.find((e) => e.id === '1')?.posts).toStrictEqual([
          { id: '1', content: 'Hello1', author_id: '1' },
          { id: '2', content: 'Hello2', author_id: '1' },
        ]);
        expect(result.find((e) => e.id === '2')?.posts).toStrictEqual([
          { id: '3', content: 'Hello3', author_id: '2' },
          { id: '4', content: 'Hello4', author_id: '2' },
        ]);
      }

      {
        const result = await db.fetch(db.query('posts').Include('author'));
        expect(result.find((e) => e.id === '1')?.author).toStrictEqual({
          id: '1',
          name: 'Alice',
        });
        expect(result.find((e) => e.id === '2')?.author).toStrictEqual({
          id: '1',
          name: 'Alice',
        });
        expect(result.find((e) => e.id === '3')?.author).toStrictEqual({
          id: '2',
          name: 'Bob',
        });
        expect(result.find((e) => e.id === '4')?.author).toStrictEqual({
          id: '2',
          name: 'Bob',
        });
      }
    });
  });
});
