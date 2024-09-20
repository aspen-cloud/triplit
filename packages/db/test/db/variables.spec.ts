import { InMemoryTupleStorage } from '@triplit/tuple-database';
import { describe, expect, it, beforeAll } from 'vitest';
import { DB } from '../../src';
import { classes, departments } from '../sample_data/school.js';
import { testDBAndTransaction } from '../utils/db-helpers.js';

describe('DB Variables', () => {
  const storage = new InMemoryTupleStorage();
  const DEPARTMENT = 'dep-1';
  const db = new DB({
    source: storage,
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
      .where([['department', '=', '$DEPARTMENT']])
      .build();

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
      .where([['department', '=', '$DEPARTMENT']])
      .build();

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
        const result = await db.fetchById('departments', '$DEPARTMENT');
        expect(result?.id).toBe(DEPARTMENT);
      }
    );
  });

  it('id supports variables', async () => {
    const query = db.query('departments').id('$DEPARTMENT').build();
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
      .where([{ mod: 'and', filters: [['department', '=', '$DEPARTMENT']] }])
      .build();
    const result = await db.fetch(query);
    expect(result).toHaveLength(classesInDep.length);
    expect(
      [...result.values()].every((r) => r.department === DEPARTMENT)
    ).toBeTruthy();
  });

  it('can use variables in query deeply nested grouped filter', async () => {
    const query = db
      .query('classes')
      .where([
        {
          mod: 'and',
          filters: [
            {
              mod: 'and',
              filters: [
                { mod: 'and', filters: [['department', '=', '$DEPARTMENT']] },
              ],
            },
          ],
        },
      ])
      .build();
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
      .where([['department', '=', '$DEPARTMENT']])
      .build();

    const preUpdateResult = await db.fetch(query);
    expect(preUpdateResult.length).toBe(3);

    db.updateGlobalVariables({ DEPARTMENT: 'dep-2' });

    const postUpdateResult = await db.fetch(query);
    expect(postUpdateResult.length).toBe(2);
  });

  it('can provide variables via a query', async () => {
    const query = db
      .query('classes')
      .where([['department', '=', '$DEPARTMENT']]);

    const builtQuery1 = query.vars({ DEPARTMENT: 'dep-1' }).build();
    const builtQuery2 = query.vars({ DEPARTMENT: 'dep-2' }).build();

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
      global: { test: 'variable' },
      session: {},
    });
    {
      const session = db.withSessionVars({ foo: 'bar' });
      expect(session.systemVars).toEqual({
        global: { test: 'variable' },
        session: { foo: 'bar' },
      });
      expect(db.systemVars).toEqual({
        global: { test: 'variable' },
        session: {},
      });
    }
    {
      const session1 = db.withSessionVars({ foo: 'bar' });

      expect(session1.systemVars).toEqual({
        global: { test: 'variable' },
        session: {
          foo: 'bar',
        },
      });

      const session2 = session1.withSessionVars({ bar: 'baz' });
      expect(session2.systemVars).toEqual({
        global: { test: 'variable' },
        session: {
          bar: 'baz',
        },
      });

      expect(db.systemVars).toEqual({
        global: { test: 'variable' },
        session: {},
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
      .where(['name', '=', '$session.name'], ['visible', '=', true])
      .build();

    {
      expect(await db.fetch(db.query('test').build())).toHaveLength(3);
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
