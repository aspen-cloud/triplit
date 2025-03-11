import { expect, it } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';
import { exists } from '../../src/filters.js';
import { InvalidFilterError } from '../../src/errors.js';
import { DB } from '../../src/db.js';

const messagingSchema = {
  collections: S.Collections({
    groups: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        member_ids: S.Set(S.String(), { default: S.Default.Set.empty() }),
      }),
      relationships: {
        members: S.RelationMany('members', {
          where: [['group_id', '=', '$id']],
        }),
        messages: S.RelationMany('messages', {
          where: [['group_id', '=', '$id']],
        }),
      },
    },
    members: {
      schema: S.Schema({
        id: S.Id(),
        group_id: S.String(),
        user_id: S.String(),
        role: S.String(),
      }),
      relationships: {
        group: S.RelationById('groups', '$group_id'),
        user: S.RelationById('users', '$user_id'),
      },
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
        author_id: S.String(),
        text: S.String(),
        deleted_at: S.Date({ nullable: true, default: null }),
        liked_by_ids: S.Set(S.String(), { default: S.Default.Set.empty() }),
      }),
      relationships: {
        group: S.RelationById('groups', '$group_id'),
        author: S.RelationById('members', '$author_id'),
        liked_by: S.RelationMany('users', {
          where: [['id', 'in', '$liked_by_ids']],
        }),
      },
    },
  }),
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

it('can filter on existing relationships', async () => {
  const db = new DB({ schema: messagingSchema });
  await seedMessagingSchema(db);

  await db.insert('groups', { id: '3', name: 'Sales' });

  const query = db.query('groups').Where(exists('members'));
  const result = await db.fetch(query);
  const keys = result.map((e) => e.id);
  expect(keys).toHaveLength(2);
  expect(keys).toContain('1');
  expect(keys).toContain('2');
});

it('can filter on existing relationships with additional filters', async () => {
  const db = new DB({ schema: messagingSchema });
  await seedMessagingSchema(db);

  const query = db.query('groups').Where(
    exists('members', {
      where: [['user_id', '=', '2']],
    })
  );
  const result = await db.fetch(query);
  const keys = result.map((e) => e.id);
  expect(keys).toHaveLength(1);
  expect(keys).toContain('1');
});
it('can filter on deep relationships', async () => {
  const db = new DB({ schema: messagingSchema });
  await seedMessagingSchema(db);

  const query = db
    .query('groups')
    .Where(exists('members.user', { where: [['name', '=', 'Bob']] }));
  const result = await db.fetch(query);
  const keys = result.map((e) => e.id);
  expect(keys).toHaveLength(1);
  expect(keys).toContain('1');
});
it('can filter on nested relationships', async () => {
  const db = new DB({ schema: messagingSchema });
  await seedMessagingSchema(db);

  const query = db
    .query('messages')
    .Where({
      exists: {
        collectionName: 'groups',
        where: [
          ['id', '=', '$1.group_id'],
          {
            exists: {
              collectionName: 'members',
              where: [
                ['group_id', '=', '$1.id'],
                ['user_id', '=', '1'],
              ],
            },
          },
        ],
      },
    })
    .Include('group', (rel) => rel('group').Include('members'));
  const result = await db.fetch(query);
  const keys = new Set(result.map((e) => e.id));
  expect(keys).toHaveLength(5);
  expect(keys).toEqual(new Set(['1', '2', '3', '4', '5']));
});
it('will throw error if trying to filter on non-existent relationships', async () => {
  const db = new DB({ schema: messagingSchema });
  await seedMessagingSchema(db);

  // non existent path
  {
    const query = db.query('groups').Where(
      // @ts-expect-error
      exists('nonexistent')
    );
    await expect(() => db.fetch(query)).rejects.toThrowError(
      InvalidFilterError
    );
  }

  // Non relationship path
  {
    const query = db.query('groups').Where(
      // @ts-expect-error
      exists('members.user_id')
    );
    await expect(() => db.fetch(query)).rejects.toThrowError(
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

  const query = db.query('groups').Where(exists('members'));
  await expect(() => db.fetch(query)).rejects.toThrowError(InvalidFilterError);
});
