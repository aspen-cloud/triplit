import { describe, expect, it } from 'vitest';
import { Schema as S } from '../../../src/schema/builder.js';
import { and, or } from '../../../src/query.js';
import DB from '../../../src/db.js';
import { WhereFilter } from '../../../src/query/types';
import CollectionQueryBuilder from '../../../src/collection-query.js';

const characterSchema = {
  collections: {
    characters: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        playedById: S.String(),
        playedBy: S.RelationById('actors', '$playedById'),
        showId: S.String(),
        show: S.RelationById('shows', '$showId'),
      }),
    },
    shows: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        characters: S.RelationMany('characters', {
          where: [['showId', '=', '$id']],
        }),
      }),
    },
    actors: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        characters: S.RelationMany('characters', {
          where: [['playedById', '=', '$id']],
        }),
      }),
    },
  },
};

type ShowFilter = WhereFilter<typeof characterSchema.collections, 'shows'>;

async function seedCharacterSchema(db: DB<typeof characterSchema.collections>) {
  await db.transact(async (tx) => {
    await tx.insert('shows', { id: '1', name: 'Breaking Bad' });
    await tx.insert('shows', { id: '2', name: 'Better Call Saul' });

    await tx.insert('actors', { id: '1', name: 'Bryan Cranston' });
    await tx.insert('actors', { id: '2', name: 'Aaron Paul' });
    await tx.insert('actors', { id: '3', name: 'Bob Odenkirk' });
    await tx.insert('actors', { id: '4', name: 'Jonathan Banks' });
    await tx.insert('actors', { id: '5', name: 'Anna Gunn' });
    await tx.insert('actors', { id: '6', name: 'Rhea Seehorn' });

    // Breaking Bad characters
    await tx.insert('characters', {
      id: '1',
      name: 'Walter White',
      playedById: '1',
      showId: '1',
    });
    await tx.insert('characters', {
      id: '2',
      name: 'Jesse Pinkman',
      playedById: '2',
      showId: '1',
    });
    await tx.insert('characters', {
      id: '3',
      name: 'Saul Goodman',
      playedById: '3',
      showId: '1',
    });
    await tx.insert('characters', {
      id: '4',
      name: 'Mike Ehrmantraut',
      playedById: '4',
      showId: '1',
    });
    await tx.insert('characters', {
      id: '5',
      name: 'Skyler White',
      playedById: '5',
      showId: '1',
    });

    // Better Call Saul characters
    await tx.insert('characters', {
      id: '6',
      name: 'Jimmy McGill',
      playedById: '3',
      showId: '2',
    });
    await tx.insert('characters', {
      id: '7',
      name: 'Mike Ehrmantraut',
      playedById: '4',
      showId: '2',
    });
    await tx.insert('characters', {
      id: '8',
      name: 'Kim Wexler',
      playedById: '6',
      showId: '2',
    });
  });
}

describe('OR queries', () => {
  it('supports OR queries', async () => {
    const db = new DB();
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

  it('applies various filter types properly', async () => {
    const db = new DB({ schema: characterSchema });
    await seedCharacterSchema(db);

    // True for Breaking Bad
    const trueRelationalClause: ShowFilter = [
      'characters.playedBy.name',
      '=',
      'Anna Gunn',
    ];
    const trueBasicClause: ShowFilter = ['name', '=', 'Breaking Bad'];

    // False for Breaking Bad
    const falseRelationalClause: ShowFilter = [
      'characters.playedBy.name',
      '=',
      'Rhea Seehorn',
    ];
    const falseBasicClause: ShowFilter = ['name', '=', 'Better Call Saul'];

    // clauses
    const clauseTT = or([trueRelationalClause, trueBasicClause]);
    const clauseTF = or([trueRelationalClause, falseBasicClause]);
    const clauseFT = or([falseRelationalClause, trueBasicClause]);
    const clauseFF = or([falseRelationalClause, falseBasicClause]);

    {
      const query = db.query('shows').where(clauseTT).build();
      const result = await db.fetch(query);
      expect([...result.keys()]).toContain('1');
    }

    {
      const query = db.query('shows').where(clauseTF).build();
      const result = await db.fetch(query);
      expect([...result.keys()]).toContain('1');
    }

    {
      const query = db.query('shows').where(clauseFT).build();
      const result = await db.fetch(query);
      expect([...result.keys()]).toContain('1');
    }

    {
      const query = db.query('shows').where(clauseFF).build();
      const result = await db.fetch(query);
      expect([...result.keys()]).not.toContain('1');
    }
  });
});
