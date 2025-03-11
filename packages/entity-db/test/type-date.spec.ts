import { describe, expect, it, beforeAll } from 'vitest';
import { Schema as S } from '../src/schema/builder.js';
import { DB } from '../src';
import { and, or } from '../src/filters.ts';

describe('date operations', () => {
  const schema = {
    collections: {
      students: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
          birthday: S.Date(),
        }),
      },
    },
  };
  const db = new DB({
    schema,
  });
  const defaultData = [
    { id: '1', name: 'Alice', birthday: new Date(1995, 0, 1) },
    { id: '2', name: 'Bob', birthday: new Date(2000, 0, 31) },
    { id: '3', name: 'Charlie', birthday: new Date(1990, 11, 31) },
  ];

  beforeAll(async () => {
    await Promise.all(defaultData.map((doc) => db.insert('students', doc)));
  });

  it('can fetch dates', async () => {
    const student = await db.fetchById('students', '1');
    expect(student.birthday).toBeInstanceOf(Date);
  });
  it('can filter with equal dates', async () => {
    const query = db
      .query('students')
      .Where([
        or([
          ['birthday', '=', new Date(2000, 0, 31)],
          ['birthday', '=', new Date(1990, 11, 31)],
        ]),
      ])
      .Order(['birthday', 'ASC']);
    const results = await db.fetch(query);
    expect(results.length).toBe(2);
    expect([...results.values()].map((r) => r.id)).toEqual(['3', '2']);
  });
  it('can filter with not equal dates', async () => {
    const query = db
      .query('students')
      .Where([['birthday', '!=', new Date(2000, 0, 31)]])
      .Order(['birthday', 'DESC']);
    const results = await db.fetch(query);
    expect(results.length).toBe(2);
    expect([...results.values()].map((r) => r.id)).toEqual(['1', '3']);
  });
  it('can filter with greater or less than dates', async () => {
    const query = db
      .query('students')
      .Where([
        and([
          ['birthday', '<', new Date(2000, 0, 31)],
          ['birthday', '>', new Date(1990, 11, 31)],
        ]),
      ])
      .Order(['birthday', 'ASC']);
    const results = await db.fetch(query);
    expect(results.length).toBe(1);
    expect([...results.values()].map((r) => r.id)).toEqual(['1']);
  });
  it('can filter with greater/less than or equal to dates', async () => {
    const query = db
      .query('students')
      .Where([
        and([
          ['birthday', '<=', new Date(2000, 0, 31)],
          ['birthday', '>=', new Date(1990, 11, 31)],
        ]),
      ])
      .Order(['birthday', 'ASC']);
    const results = await db.fetch(query);
    expect(results.length).toBe(3);
    expect([...results.values()].map((r) => r.id)).toEqual(['3', '1', '2']);
  });
});
