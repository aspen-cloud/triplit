import { InMemoryTupleStorage } from '@triplit/tuple-database';
import { describe, expect, it } from 'vitest';
import { and, DB, or, Schema as S, CollectionQueryBuilder } from '../../src';

describe('OR queries', () => {
  it('supports OR queries', async () => {
    const db = new DB({ source: new InMemoryTupleStorage() });
    // storage.data = [];
    await db.insert('roster', { id: '1', name: 'Alice', age: 22 });

    await db.insert('roster', { id: '2', name: 'Bob', age: 23, team: 'blue' });
    await db.insert('roster', {
      id: '3',
      name: 'Charlie',
      age: 22,
      team: 'blue',
    });
    await db.insert('roster', {
      id: '4',
      name: 'Dennis',
      age: 24,
      team: 'blue',
    });
    await db.insert('roster', { id: '5', name: 'Ella', age: 23, team: 'red' });
    const redOr22 = await db.fetch(
      CollectionQueryBuilder('roster')
        .where([
          or([
            ['team', '=', 'red'],
            ['age', '=', 22],
          ]),
        ])
        .build()
    );
    expect(redOr22).toHaveLength(3);
    expect([...redOr22.keys()]).toEqual(
      expect.arrayContaining(
        ['1', '3', '5'].map((id) => expect.stringContaining(id.toString()))
      )
    );

    const blue23Or22 = await db.fetch(
      CollectionQueryBuilder('roster')
        .where([
          or([
            and([
              ['team', '=', 'blue'],
              ['age', '=', 23],
            ]),
            ['age', '=', 22],
          ]),
        ])
        .build()
    );
    expect(blue23Or22).toHaveLength(3);
    expect([...blue23Or22.keys()]).toEqual(
      expect.arrayContaining(
        [1, 2, 3].map((id) => expect.stringContaining(id.toString()))
      )
    );
  });

  it('can use Sets in or queries', async () => {
    const db = new DB({
      schema: {
        collections: {
          characters: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              playedBy: S.Set(S.String()),
            }),
          },
        },
      },
    });
    await db.insert('characters', {
      id: '1',
      name: 'Jon Snow',
      playedBy: new Set(['Kit Harington']),
    });
    await db.insert('characters', {
      id: '2',
      name: 'Arya Stark',
      playedBy: new Set(['Maisie Williams']),
    });
    await db.insert('characters', {
      id: '3',
      name: 'Sansa Stark',
      playedBy: new Set(['Sophie Turner']),
    });
    await db.insert('characters', {
      id: '4',
      name: 'Daenerys Targaryen',
      playedBy: new Set(['Emilia Clarke']),
    });
    await db.insert('characters', {
      id: '5',
      name: 'Tyrion Lannister',
      playedBy: new Set(['Peter Dinklage']),
    });
    const result = await db.fetch(
      db
        .query('characters')
        .where(
          or([
            ['name', 'like', '%Stark'],
            ['playedBy', 'has', 'Peter Dinklage'],
          ])
        )
        .build()
    );
    expect(result.size).toBe(3);
  });
});
