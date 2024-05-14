import { InMemoryTupleStorage } from '@triplit/tuple-database';
import { describe, expect, it, beforeAll } from 'vitest';
import { and, DB, or, Schema as S } from '../../src';

describe('date operations', () => {
  const storage = new InMemoryTupleStorage();
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
    source: storage,
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
      .where([
        or([
          ['birthday', '=', new Date(2000, 0, 31)],
          ['birthday', '=', new Date(1990, 11, 31)],
        ]),
      ])
      .order(['birthday', 'ASC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(2);
      expect([...results.values()].map((r) => r.id)).toEqual(['3', '2']);
    });
  });
  it('can filter with not equal dates', async () => {
    const query = db
      .query('students')
      .where([['birthday', '!=', new Date(2000, 0, 31)]])
      .order(['birthday', 'DESC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(2);
      expect([...results.values()].map((r) => r.id)).toEqual(['1', '3']);
    });
  });
  it('can filter with greater or less than dates', async () => {
    const query = db
      .query('students')
      .where([
        and([
          ['birthday', '<', new Date(2000, 0, 31)],
          ['birthday', '>', new Date(1990, 11, 31)],
        ]),
      ])
      .order(['birthday', 'ASC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(1);
      expect([...results.values()].map((r) => r.id)).toEqual(['1']);
    });
  });
  it('can filter with greater/less than or equal to dates', async () => {
    const query = db
      .query('students')
      .where([
        and([
          ['birthday', '<=', new Date(2000, 0, 31)],
          ['birthday', '>=', new Date(1990, 11, 31)],
        ]),
      ])
      .order(['birthday', 'ASC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(3);
      expect([...results.values()].map((r) => r.id)).toEqual(['3', '1', '2']);
    });
  });
});
