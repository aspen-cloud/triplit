import { expect, it, vi } from 'vitest';
import {
  DB,
  Schema as S,
  and,
  exists,
  or,
  prepareQuery,
} from '../src/index.js';
import {
  createQueryWithExistsAddedToIncludes,
  createQueryWithRelationalOrderAddedToIncludes,
} from '../src/ivm/index.js';

const roles = {
  authenticated: {
    match: {
      role: 'user',
      user_id: '$user_id',
    },
  },
  admin: {
    match: {
      role: 'admin',
    },
  },
};
const schema = S.Collections({
  groups: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
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
      created_at: S.Date({
        default: S.Default.now(), // default to now when created
      }),
    }),
    relationships: {
      group: S.RelationById('groups', '$group_id'),
      author: S.RelationById('members', '$author_id'),
      liked_by: S.RelationMany('users', {
        where: [['id', 'in', '$liked_by_ids']],
      }),
    },
    permissions: {
      authenticated: {
        read: {
          filter: [
            or([
              and([
                exists('group.members', {
                  where: [
                    ['user_id', '=', '$role.user_id'],
                    ['role', '=', 'member'],
                  ],
                }),
                ['deleted_at', '=', null],
              ]),
              exists('group.members', {
                where: [
                  ['user_id', '=', '$role.user_id'],
                  ['role', '=', 'admin'],
                ],
              }),
            ]),
          ],
        },
        insert: {
          filter: [
            // can only author your own messages
            ['author.user_id', '=', '$role.user_id'],
            // must be a group member
            ['group.members.user_id', '=', '$role.user_id'],
          ],
        },
        update: {
          filter: [['group.members.user_id', '=', '$role.user_id']],
        },
        postUpdate: {
          // non-sense rule just to test that it runs
          filter: [['text', '!=', 'disallowed']],
        },
        delete: {
          filter: [['author.user_id', '=', '$role.user_id']],
        },
      },
      admin: {
        read: {
          filter: [true],
        },
        insert: {
          filter: [true],
        },
        update: {
          filter: [true],
        },
        postUpdate: {
          filter: [true],
        },
        delete: {
          filter: [true],
        },
      },
    },
  },
});

const db = new DB({ schema: { collections: schema, roles } });

// seed the database with users, groups and members
const users = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'charlie', name: 'Charlie' },
];
const groups = [
  { id: 'home', name: 'Home' },
  { id: 'work', name: 'Work' },
  { id: 'soccer', name: 'Soccer' },
];
const members = [
  { id: '1', group_id: 'soccer', user_id: 'alice', role: 'admin' },
  { id: '2', group_id: 'soccer', user_id: 'bob', role: 'member' },
  { id: '3', group_id: 'soccer', user_id: 'charlie', role: 'member' },
  { id: '4', group_id: 'work', user_id: 'bob', role: 'admin' },
  { id: '5', group_id: 'work', user_id: 'charlie', role: 'member' },
  { id: '6', group_id: 'home', user_id: 'alice', role: 'member' },
  { id: '7', group_id: 'home', user_id: 'charlie', role: 'admin' },
];

for (const user of users) {
  await db.insert('users', user);
}
for (const group of groups) {
  await db.insert('groups', group);
}
for (const member of members) {
  await db.insert('members', member);
}

const aliceDb = db.withSessionVars({
  role: 'user',
  user_id: 'alice',
});

const bobDb = db.withSessionVars({
  role: 'user',
  user_id: 'bob',
});

it('can subscribe to messages', async () => {
  const spy = vi.fn();
  const spy2 = vi.fn();

  const aliceQuery = createQueryWithRelationalOrderAddedToIncludes(
    createQueryWithExistsAddedToIncludes(
      prepareQuery(
        aliceDb.query('messages'),
        aliceDb.schema?.collections,
        aliceDb.systemVars,
        aliceDb.session,
        {
          applyPermission: 'read',
        }
      )
    )
  );

  const bobQuery = createQueryWithRelationalOrderAddedToIncludes(
    createQueryWithExistsAddedToIncludes(
      prepareQuery(
        bobDb.query('messages'),
        bobDb.schema?.collections,
        bobDb.systemVars,
        bobDb.session,
        {
          applyPermission: 'read',
        }
      )
    )
  );
  aliceDb.subscribeRaw(aliceQuery, spy, console.error);
  bobDb.subscribeRaw(bobQuery, spy2, console.error);

  await db.updateQueryViews();
  db.broadcastToQuerySubscribers();
  expect(spy).toHaveBeenCalled();
  expect(spy2).toHaveBeenCalled();
  await db.insert(
    'messages',
    {
      group_id: 'soccer',
      author_id: 'bob',
      text: 'Hello world',
    },
    { skipRules: true }
  );
  await aliceDb.updateQueryViews();
  aliceDb.broadcastToQuerySubscribers();
  expect(spy2).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledTimes(2);
  await db.insert(
    'messages',
    {
      group_id: 'work',
      author_id: 'bob',
      text: 'Hello world',
    },
    { skipRules: true }
  );
  await aliceDb.updateQueryViews();
  aliceDb.broadcastToQuerySubscribers();
  expect(spy2).toHaveBeenCalledTimes(3);
  expect(spy).toHaveBeenCalledTimes(2);
  await db.delete('members', '1');
  await aliceDb.updateQueryViews();
  aliceDb.broadcastToQuerySubscribers();
  expect(spy).toHaveBeenCalledTimes(3);
});
