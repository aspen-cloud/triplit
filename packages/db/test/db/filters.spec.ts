import { describe, expect, it } from 'vitest';
import {
  and,
  DB,
  or,
  Schema as S,
  CollectionQueryBuilder,
  InvalidFilterError,
  WhereFilter,
} from '../../src';
import { exists } from '../../src/query.ts';

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

const messagingSchema = {
  collections: {
    groups: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        member_ids: S.Set(S.String()),
        members: S.RelationMany('members', {
          where: [['group_id', '=', '$id']],
        }),
        messages: S.RelationMany('messages', {
          where: [['group_id', '=', '$id']],
        }),
      }),
    },
    members: {
      schema: S.Schema({
        id: S.Id(),
        group_id: S.String(),
        group: S.RelationById('groups', '$group_id'),
        user_id: S.String(),
        user: S.RelationById('users', '$user_id'),
        role: S.String(),
      }),
    },
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
    messages: {
      schema: S.Schema({
        id: S.Id(),
        group_id: S.String(),
        group: S.RelationById('groups', '$group_id'),
        author_id: S.String(),
        author: S.RelationById('members', '$author_id'),
        text: S.String(),
        deleted_at: S.Date({ nullable: true, default: null }),
        liked_by_ids: S.Set(S.String()),
        liked_by: S.RelationMany('users', {
          where: [['id', 'in', '$liked_by_ids']],
        }),
      }),
    },
  },
};

async function seedMessagingSchema(db: DB<typeof messagingSchema.collections>) {
  await db.transact(async (tx) => {
    await tx.insert('users', { id: '1', name: 'Alice' });
    await tx.insert('users', { id: '2', name: 'Bob' });
    await tx.insert('users', { id: '3', name: 'Charlie' });

    await tx.insert('groups', {
      id: '1',
      name: 'Engineering',
      member_ids: new Set(['1', '2']),
    });
    await tx.insert('groups', {
      id: '2',
      name: 'Marketing',
      member_ids: new Set(['1', '3']),
    });

    // Seed group 1
    await tx.insert('members', {
      id: '1',
      group_id: '1',
      user_id: '1',
      role: 'admin',
    });
    await tx.insert('members', {
      id: '2',
      group_id: '1',
      user_id: '2',
      role: 'member',
    });

    await tx.insert('messages', {
      id: '1',
      group_id: '1',
      author_id: '1',
      text: 'Hello',
    });
    await tx.insert('messages', {
      id: '2',
      group_id: '1',
      author_id: '2',
      text: 'Hi',
    });
    await tx.insert('messages', {
      id: '3',
      group_id: '2',
      author_id: '3',
      text: 'Hey',
    });

    // seed group 2
    await tx.insert('members', {
      id: '3',
      group_id: '2',
      user_id: '1',
      role: 'member',
    });
    await tx.insert('members', {
      id: '4',
      group_id: '2',
      user_id: '3',
      role: 'admin',
    });

    await tx.insert('messages', {
      id: '4',
      group_id: '2',
      author_id: '1',
      text: 'Hello',
    });
    await tx.insert('messages', {
      id: '5',
      group_id: '2',
      author_id: '3',
      text: 'Hi',
    });
  });
}

describe('exists filters', () => {
  it('can filter on existing relationships', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingSchema(db);

    await db.insert('groups', { id: '3', name: 'Sales' });

    const query = db.query('groups').where(exists('members'));
    const result = await db.fetch(query.build());
    const keys = [...result.keys()];
    expect(keys).toHaveLength(2);
    expect(keys).toContain('1');
    expect(keys).toContain('2');
  });

  it('can filter on existing relationships with additional filters', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingSchema(db);

    const query = db.query('groups').where(
      exists('members', {
        where: [['user_id', '=', '2']],
      })
    );
    const result = await db.fetch(query.build());
    const keys = [...result.keys()];
    expect(keys).toHaveLength(1);
    expect(keys).toContain('1');
  });
  it('can fitler on deep relationships', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingSchema(db);

    const query = db
      .query('groups')
      .where(exists('members.user', { where: [['name', '=', 'Bob']] }));
    const result = await db.fetch(query.build());
    const keys = [...result.keys()];
    expect(keys).toHaveLength(1);
    expect(keys).toContain('1');
  });
  it('will throw error if trying to filter on non-existent relationships', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingSchema(db);

    // non existent path
    {
      const query = db.query('groups').where(
        exists(
          // @ts-expect-error
          'nonexistent'
        )
      );
      await expect(() => db.fetch(query.build())).rejects.toThrowError(
        InvalidFilterError
      );
    }

    // Non relationship path
    {
      const query = db.query('groups').where(
        exists(
          // @ts-expect-error
          'members.user_id'
        )
      );
      await expect(() => db.fetch(query.build())).rejects.toThrowError(
        InvalidFilterError
      );
    }
  });
  it('will throw error if used with schemaless db', async () => {
    const db = new DB();
    await seedMessagingSchema(
      // @ts-expect-error
      db
    );

    const query = db.query('groups').where(exists('members'));
    await expect(() => db.fetch(query.build())).rejects.toThrowError(
      InvalidFilterError
    );
  });
});
