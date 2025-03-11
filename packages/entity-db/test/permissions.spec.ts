import { beforeAll, describe, expect, it } from 'vitest';
import { DB, DBSchema } from '../src/db.js';
import { Schema as S } from '../src/schema/builder.js';
import { and, exists, or } from '../src/filters.js';
import {
  SessionVariableNotFoundError,
  WritePermissionError,
} from '../src/errors.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';

const messagingSchema = {
  roles: {
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
  },
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
  }),
};

async function seedMessagingData(db: DB<typeof messagingSchema.collections>) {
  await db.transact(
    async (tx) => {
      await tx.insert('users', {
        id: 'user-1',
        name: 'Alice',
      });
      await tx.insert('users', {
        id: 'user-2',
        name: 'Bob',
      });
      await tx.insert('users', {
        id: 'user-3',
        name: 'Charlie',
      });

      await tx.insert('groups', {
        id: 'group-1',
        name: 'Group 1',
        member_ids: new Set(['member-1', 'member-2']),
      });
      await tx.insert('members', {
        id: 'member-1',
        group_id: 'group-1',
        user_id: 'user-1',
        role: 'admin',
      });
      await tx.insert('members', {
        id: 'member-2',
        group_id: 'group-1',
        user_id: 'user-2',
        role: 'member',
      });

      await tx.insert('groups', {
        id: 'group-2',
        name: 'Group 2',
        member_ids: new Set(['member-3', 'member-4']),
      });
      await tx.insert('members', {
        id: 'member-3',
        group_id: 'group-2',
        user_id: 'user-1',
        role: 'admin',
      });
      await tx.insert('members', {
        id: 'member-4',
        group_id: 'group-2',
        user_id: 'user-3',
        role: 'member',
      });

      await tx.insert('groups', {
        id: 'group-3',
        name: 'Group 3',
        member_ids: new Set(['member-5', 'member-6']),
      });
      await tx.insert('members', {
        id: 'member-5',
        group_id: 'group-3',
        user_id: 'user-2',
        role: 'admin',
      });
      await tx.insert('members', {
        id: 'member-6',
        group_id: 'group-3',
        user_id: 'user-3',
        role: 'member',
      });

      // Group 1 messages
      await tx.insert('messages', {
        id: 'message-1',
        group_id: 'group-1',
        author_id: 'member-1',
        text: 'Hello, world!',
      });
      await tx.insert('messages', {
        id: 'message-2',
        group_id: 'group-1',
        author_id: 'member-2',
        text: 'Hello, world!',
      });
      await tx.insert('messages', {
        id: 'message-3',
        group_id: 'group-1',
        author_id: 'member-2',
        text: 'Delete me!',
        deleted_at: new Date(),
      });

      // Group 2 messages
      await tx.insert('messages', {
        id: 'message-4',
        group_id: 'group-2',
        author_id: 'member-3',
        text: 'Hello, world!',
      });
      await tx.insert('messages', {
        id: 'message-5',
        group_id: 'group-2',
        author_id: 'member-4',
        text: 'Hello, world!',
      });
      await tx.insert('messages', {
        id: 'message-6',
        group_id: 'group-2',
        author_id: 'member-4',
        text: 'Delete me!',
        deleted_at: new Date(),
      });

      // Group 3 messages
      await tx.insert('messages', {
        id: 'message-7',
        group_id: 'group-3',
        author_id: 'member-5',
        text: 'Hello, world!',
      });
      await tx.insert('messages', {
        id: 'message-8',
        group_id: 'group-3',
        author_id: 'member-6',
        text: 'Hello, world!',
      });
      await tx.insert('messages', {
        id: 'message-9',
        group_id: 'group-3',
        author_id: 'member-6',
        text: 'Delete me!',
        deleted_at: new Date(),
      });
    },
    { skipRules: true }
  );
}

describe('Read', () => {
  it('data cannot be read if you are unauthenticated', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);
    const query = db.query('messages');
    const messages = await db.fetch(query);
    expect(messages.length).toEqual(0);
  });

  it('skipping rules will allow you to read data', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);
    const messages = await db.fetch(db.query('messages'), {
      skipRules: true,
    });
    expect(messages.length).toEqual(9);
  });

  it('authenticated users can read data based on rules', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    const user1Token = {
      role: 'user',
      user_id: 'user-1',
    };
    const user2Token = {
      role: 'user',
      user_id: 'user-2',
    };
    const user3Token = {
      role: 'user',
      user_id: 'user-3',
    };
    const adminToken = {
      role: 'admin',
    };
    const user1DB = db.withSessionVars(user1Token);
    const user2DB = db.withSessionVars(user2Token);
    const user3DB = db.withSessionVars(user3Token);
    const adminDB = db.withSessionVars(adminToken);

    // User 1
    {
      // TODO: need to figure out of the matcher makes more sense as a merge, or first match...basically how do you deal with group
      const query = user1DB.query('messages');
      const messages = await user1DB.fetch(query);
      expect(messages.length).toEqual(6);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-1',
        'message-2',
        'message-3',
        'message-4',
        'message-5',
        'message-6',
      ]);
    }

    // User 2
    {
      const messages = await user2DB.fetch(user2DB.query('messages'));
      expect(messages.length).toEqual(5);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-1',
        'message-2',
        'message-7',
        'message-8',
        'message-9',
      ]);
    }

    // User 3
    {
      const messages = await user3DB.fetch(user3DB.query('messages'));
      expect(messages.length).toEqual(4);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-4',
        'message-5',
        'message-7',
        'message-8',
      ]);
    }

    // Admin
    {
      const messages = await adminDB.fetch(adminDB.query('messages'));
      expect(messages.length).toEqual(9);
    }
  });

  it('permission-less collections can always be read', async () => {
    const schema = {
      collections: {
        permissioned: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [true],
              },
            },
          },
        },
        permissionless: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    } satisfies DBSchema;
    const db = new DB({ schema });
    await db.insert('permissioned', { id: '1' }, { skipRules: true });
    await db.insert('permissionless', { id: '1' }, { skipRules: true });

    {
      const query = db.query('permissioned');
      const results = await db.fetch(query);
      expect(results.length).toEqual(0);
    }

    {
      const query = db.query('permissionless');
      const results = await db.fetch(query);
      expect(results.length).toEqual(1);
    }
  });

  it('can handle union of two roles', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
        admin: {
          match: {
            role: 'admin',
            user_id: '$user_id',
          },
        },
      },
      collections: {
        messages: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            author_id: S.String(),
            recipient_id: S.String(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [
                  or([
                    ['author_id', '=', '$role.user_id'],
                    ['recipient_id', '=', '$role.user_id'],
                  ]),
                ],
              },
            },
            admin: {
              read: {
                filter: [true],
              },
            },
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });

    // insert messages
    await db.transact(
      async (tx) => {
        await tx.insert('messages', {
          id: 'message-1',
          text: 'Hello, world!',
          author_id: 'user-1',
          recipient_id: 'user-2',
        });
        await tx.insert('messages', {
          id: 'message-2',
          text: 'Hello, world!',
          author_id: 'user-2',
          recipient_id: 'user-1',
        });
        await tx.insert('messages', {
          id: 'message-3',
          text: 'Hello, world!',
          author_id: 'user-2',
          recipient_id: 'user-3',
        });
      },
      { skipRules: true }
    );

    const user1Token = {
      user_id: 'user-1',
    };
    const adminToken = {
      role: 'admin',
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);
    const adminDB = db.withSessionVars(adminToken);

    expect(adminDB.session?.roles).toEqual(
      expect.arrayContaining([
        { key: 'authenticated', roleVars: { user_id: 'user-1' } },
        { key: 'admin', roleVars: { user_id: 'user-1' } },
      ])
    );

    // User 1
    {
      const messages = await user1DB.fetch(user1DB.query('messages'));
      expect(messages.length).toEqual(2);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-1',
        'message-2',
      ]);
    }

    // Admin
    {
      const messages = await adminDB.fetch(adminDB.query('messages'));
      expect(messages.length).toEqual(3);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-1',
        'message-2',
        'message-3',
      ]);
    }
  });

  it.todo(
    "will throw an error if you add a permissions with a role variable that doesn't exist",
    async () => {
      const schema = {
        roles: {
          authenticated: {
            match: {
              user_id: '$user_id',
            },
          },
        },
        collections: {
          messages: {
            schema: S.Schema({
              id: S.Id(),
              text: S.String(),
              author_id: S.String(),
              recipient_id: S.String(),
            }),
            permissions: {
              authenticated: {
                read: {
                  filter: [
                    or([
                      ['author_id', '=', '$role.$user_id'],
                      ['recipient_id', '=', '$role.$user_id'],
                    ]),
                  ],
                },
              },
              admin: {
                read: {
                  filter: [true],
                },
              },
            },
          },
        },
      } satisfies DBSchema;
      const db = new DB({ schema });

      const user1Token = {
        user_id: 'user-1',
      };

      const user1DB = db.withSessionVars(user1Token);

      await expect(user1DB.fetch(user1DB.query('messages'))).rejects.toThrow(
        SessionVariableNotFoundError
      );
    }
  );

  it('missing role, rule, filter and empty filter will deny access', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
      },
      collections: {
        testMissingRole: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {},
        },
        testMissingRule: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {},
          },
        },
        testMissingFilter: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              read: {},
            },
          },
        },
        testEmptyFilter: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [],
              },
            },
          },
        },
      },
    } satisfies DBSchema;
    const db = new DB({ schema });
    await db.insert('testMissingRole', { id: '1' }, { skipRules: true });
    await db.insert('testMissingRule', { id: '1' }, { skipRules: true });
    await db.insert('testMissingFilter', { id: '1' }, { skipRules: true });
    await db.insert('testEmptyFilter', { id: '1' }, { skipRules: true });
    const user1DB = db.withSessionVars({ user_id: 'user-1' });

    {
      const query = user1DB.query('testMissingRole');
      const results = await user1DB.fetch(query);
      expect(results.length).toEqual(0);
    }
    {
      const query = user1DB.query('testMissingRule');
      const results = await user1DB.fetch(query);
      expect(results.length).toEqual(0);
    }
    {
      const query = user1DB.query('testMissingFilter');
      const results = await user1DB.fetch(query);
      expect(results.length).toEqual(0);
    }
    {
      const query = user1DB.query('testEmptyFilter');
      const results = await user1DB.fetch(query);
      expect(results.length).toEqual(0);
    }
  });
});

describe('Insert', () => {
  it('data cannot be inserted if you are unauthenticated', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);
    await expect(
      db.insert('messages', {
        id: 'message-10',
        group_id: 'group-1',
        author_id: 'member-1',
        text: 'Hello, world!',
      })
    ).rejects.toThrow(WritePermissionError);
  });

  it('skipping rules will allow you to insert data', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    await db.insert(
      'messages',
      {
        id: 'message-10',
        group_id: 'group-1',
        author_id: 'member-1',
        text: 'Hello, world!',
      },
      { skipRules: true }
    );

    const message = await db.fetchById('messages', 'message-10', {
      skipRules: true,
    });
    expect(message).toEqual({
      id: 'message-10',
      group_id: 'group-1',
      author_id: 'member-1',
      text: 'Hello, world!',
      liked_by_ids: new Set(),
    });
  });

  it('authenticated users can insert data based on rules', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    const user3Token = {
      role: 'user',
      user_id: 'user-3',
    };

    const user3DB = db.withSessionVars(user3Token);
    // Can insert where user author and group member
    await expect(
      user3DB.insert('messages', {
        id: 'message-10',
        group_id: 'group-2',
        author_id: 'member-4',
        text: 'Hello, world!',
      })
    ).resolves.not.toThrow();
    // Cannot insert where user is not a member
    await expect(
      user3DB.insert('messages', {
        id: 'message-11',
        group_id: 'group-1',
        author_id: 'member-4',
        text: 'Hello, world!',
      })
    ).rejects.toThrow(WritePermissionError);
    // Cannot insert where user is not the author
    await expect(
      user3DB.insert('messages', {
        id: 'message-12',
        group_id: 'group-2',
        author_id: 'member-3',
        text: 'Hello, world!',
      })
    ).rejects.toThrow(WritePermissionError);
  });

  it('permission-less collections can always be written to', async () => {
    const schema = {
      collections: {
        permissioned: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              insert: {
                filter: [true],
              },
            },
          },
        },
        permissionless: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });
    await expect(db.insert('permissioned', { id: '1' })).rejects.toThrow(
      WritePermissionError
    );
    await expect(
      db.insert('permissionless', { id: '1' })
    ).resolves.not.toThrow();
  });

  it('can handle union of two roles', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
        admin: {
          match: {
            role: 'admin',
            user_id: '$user_id',
          },
        },
      },
      collections: {
        messages: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            author_id: S.String(),
          }),
          permissions: {
            authenticated: {
              insert: {
                filter: [['author_id', '=', '$role.user_id']],
              },
            },
            admin: {
              insert: {
                filter: [true],
              },
            },
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });

    const user1Token = {
      user_id: 'user-1',
    };
    const adminToken = {
      role: 'admin',
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);
    const adminDB = db.withSessionVars(adminToken);

    await adminDB.ready;

    expect(adminDB.session?.roles).toEqual(
      expect.arrayContaining([
        { key: 'authenticated', roleVars: { user_id: 'user-1' } },
        { key: 'admin', roleVars: { user_id: 'user-1' } },
      ])
    );

    // User 1
    await expect(
      user1DB.insert('messages', {
        id: 'message-1',
        text: 'Hello, world!',
        author_id: 'user-1',
      })
    ).resolves.not.toThrow();

    await expect(
      user1DB.insert('messages', {
        id: 'message-2',
        text: 'Hello, world!',
        author_id: 'user-2',
      })
    ).rejects.toThrow();

    // Admin
    await expect(
      adminDB.insert('messages', {
        id: 'message-3',
        text: 'Hello, world!',
        author_id: 'user-2',
      })
    ).resolves.not.toThrow();
  });
  it('can handle collections where attributes named in the role are undefined/Optional', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
      },
      collections: {
        messages: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            author_id: S.Optional(S.String()),
            recipient_id: S.String(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [['author_id', '=', '$role.user_id']],
              },
              insert: {
                filter: [true],
              },
            },
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });

    const user1Token = {
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);

    await expect(
      user1DB.insert('messages', {
        id: 'message-1',
        text: 'Hello, world!',
        recipient_id: 'user-1',
      })
    ).resolves.not.toThrow();

    await expect(
      user1DB.fetchById('messages', 'message-1')
    ).resolves.toStrictEqual(null);
  });
  it('can handle an insertions in a transaction where the first entity is related to the second by a relational permission', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
      },
      collections: {
        profile: {
          schema: S.Schema({
            id: S.Id(),
            userId: S.String(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [['userId', '=', '$role.user_id']],
              },
              insert: {
                filter: [['userId', '=', '$role.user_id']],
              },
            },
          },
        },
        messages: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            profile_id: S.String(),
          }),
          relationships: {
            sender: S.RelationById('profile', '$profile_id'),
          },
          permissions: {
            authenticated: {
              read: {
                filter: [['sender.userId', '=', '$role.user_id']],
              },
              insert: {
                filter: [['sender.userId', '=', '$role.user_id']],
              },
            },
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });

    const user1Token = {
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);

    await expect(
      user1DB.transact(async (tx) => {
        const { id: profile_id } = await tx.insert('profile', {
          userId: 'user-1',
        });
        await tx.insert('messages', {
          id: 'message-1',
          text: 'Hello, world!',
          profile_id,
        });
      })
    ).resolves.not.toThrow();
  });

  it('missing role, rule, filter and empty filter will deny access', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
      },
      collections: {
        testMissingRole: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {},
        },
        testMissingRule: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {},
          },
        },
        testMissingFilter: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [true],
              },
              insert: {},
            },
          },
        },
        testEmptyFilter: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              read: {
                filter: [true],
              },
              insert: {
                filter: [],
              },
            },
          },
        },
      },
    } satisfies DBSchema;
    const db = new DB({ schema });
    const user1DB = db.withSessionVars({ user_id: 'user-1' });

    await expect(
      user1DB.insert('testMissingRole', { id: '1' })
    ).rejects.toThrow(WritePermissionError);
    await expect(
      user1DB.insert('testMissingRule', { id: '1' })
    ).rejects.toThrow(WritePermissionError);
    await expect(
      user1DB.insert('testMissingFilter', { id: '1' })
    ).rejects.toThrow(WritePermissionError);
    await expect(
      user1DB.insert('testEmptyFilter', { id: '1' })
    ).rejects.toThrow(WritePermissionError);
  });
});

describe('Update', () => {
  it('data cannot be updated if you are unauthenticated', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);
    await expect(
      db.update('messages', 'message-1', (entity) => {
        entity.text = 'Hello, world!';
      })
    ).rejects.toThrow(WritePermissionError);
  });

  it('skipping rules will allow you to update data', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    await db.update(
      'messages',
      'message-1',
      (entity) => {
        entity.text = 'Hello, world!';
      },
      { skipRules: true }
    );

    const message = await db.fetchById('messages', 'message-1', {
      skipRules: true,
    });
    expect(message?.text).toEqual('Hello, world!');
  });

  it('authenticated users can update data based on rules', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    const user3Token = {
      role: 'user',
      user_id: 'user-3',
    };

    const user3DB = db.withSessionVars(user3Token);

    // TODO: edit this when adding attribute permissions
    // Can update where user is group member
    await expect(
      user3DB.update('messages', 'message-9', (entity) => {
        entity.text = 'Hello, world!';
      })
    ).resolves.not.toThrow();
    // Cannot update where user is not group member
    await expect(
      user3DB.update('messages', 'message-1', (entity) => {
        entity.text = 'Hello, world!';
      })
    ).rejects.toThrow(WritePermissionError);

    // Cannot update where fails postUpdate validation
    await expect(
      user3DB.update('messages', 'message-9', (entity) => {
        entity.text = 'disallowed';
      })
    ).rejects.toThrow(WritePermissionError);
  });

  it('permission-less collections can always be updated', async () => {
    const schema = {
      collections: {
        permissioned: {
          schema: S.Schema({
            id: S.Id(),
            data: S.String(),
          }),
          permissions: {
            authenticated: {
              update: {
                filter: [true],
              },
              postUpdate: {
                filter: [true],
              },
            },
          },
        },
        permissionless: {
          schema: S.Schema({
            id: S.Id(),
            data: S.String(),
          }),
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });
    await db.insert(
      'permissioned',
      { id: '1', data: 'permissioned' },
      { skipRules: true }
    );
    await db.insert(
      'permissionless',
      { id: '1', data: 'permissionless' },
      { skipRules: true }
    );
    await expect(
      db.update('permissioned', '1', (entity) => {
        entity.data = 'updated';
      })
    ).rejects.toThrow(WritePermissionError);
    await expect(
      db.update('permissionless', '1', (entity) => {
        entity.data = 'updated';
      })
    ).resolves.not.toThrow();
  });

  it('update is required, postUpdate is optional for permissions to succeed', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            role: 'user',
            user_id: '$user_id',
          },
        },
      },
      collections: {
        updatePermission: {
          schema: S.Schema({
            id: S.Id(),
            data: S.String(),
          }),
          permissions: {
            authenticated: {
              update: {
                filter: [true],
              },
            },
          },
        },
        postUpdatePermission: {
          schema: S.Schema({
            id: S.Id(),
            data: S.String(),
          }),
          permissions: {
            authenticated: {
              postUpdate: {
                filter: [true],
              },
            },
          },
        },
        noUpdatePermission: {
          schema: S.Schema({
            id: S.Id(),
            data: S.String(),
          }),
          permissions: {
            authenticated: {},
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });
    await db.insert(
      'updatePermission',
      { id: '1', data: 'updatePermission' },
      { skipRules: true }
    );
    await db.insert(
      'postUpdatePermission',
      { id: '1', data: 'postUpdatePermission' },
      { skipRules: true }
    );
    await db.insert(
      'noUpdatePermission',
      { id: '1', data: 'noUpdatePermission' },
      { skipRules: true }
    );

    const user1Token = {
      role: 'user',
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);

    await expect(
      user1DB.update('updatePermission', '1', (entity) => {
        entity.data = 'updated';
      })
    ).resolves.not.toThrow();
    await expect(
      user1DB.update('postUpdatePermission', '1', (entity) => {
        entity.data = 'updated';
      })
    ).rejects.toThrow(WritePermissionError);
    await expect(
      user1DB.update('noUpdatePermission', '1', (entity) => {
        entity.data = 'updated';
      })
    ).rejects.toThrow(WritePermissionError);
  });

  it('can handle union of two roles', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
        admin: {
          match: {
            role: 'admin',
            user_id: '$user_id',
          },
        },
      },
      collections: {
        messages: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            author_id: S.String(),
          }),
          permissions: {
            authenticated: {
              update: {
                filter: [['author_id', '=', '$role.user_id']],
              },
            },
            admin: {
              update: {
                filter: [true],
              },
            },
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });

    // insert messages
    await db.transact(
      async (tx) => {
        await tx.insert('messages', {
          id: 'message-1',
          text: 'Hello, world!',
          author_id: 'user-1',
        });
        await tx.insert('messages', {
          id: 'message-2',
          text: 'Hello, world!',
          author_id: 'user-2',
        });
        await tx.insert('messages', {
          id: 'message-3',
          text: 'Hello, world!',
          author_id: 'user-2',
        });
      },
      { skipRules: true }
    );

    const user1Token = {
      user_id: 'user-1',
    };
    const adminToken = {
      role: 'admin',
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);
    const adminDB = db.withSessionVars(adminToken);

    expect(adminDB.session?.roles).toEqual(
      expect.arrayContaining([
        { key: 'authenticated', roleVars: { user_id: 'user-1' } },
        { key: 'admin', roleVars: { user_id: 'user-1' } },
      ])
    );

    // User 1
    await expect(
      user1DB.update('messages', 'message-1', (entity) => {
        entity.text = 'Hello, world!';
      })
    ).resolves.not.toThrow();

    await expect(
      user1DB.update('messages', 'message-2', (entity) => {
        entity.text = 'Hello, world!';
      })
    ).rejects.toThrow();

    // Admin
    await expect(
      adminDB.update('messages', 'message-2', (entity) => {
        entity.text = 'Hello, world!';
      })
    ).resolves.not.toThrow();
  });
});

describe('Delete', () => {
  it('data cannot be deleted if you are unauthenticated', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);
    await expect(db.delete('messages', 'message-1')).rejects.toThrow(
      WritePermissionError
    );
  });

  it('skipping rules will allow you to delete data', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    await db.delete('messages', 'message-1', { skipRules: true });

    const message = await db.fetchById('messages', 'message-1', {
      skipRules: true,
    });
    expect(message).toBeNull();
  });

  it('authenticated users can delete data based on rules', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);

    const adminToken = {
      role: 'admin',
    };
    const user1Token = {
      role: 'user',
      user_id: 'user-1',
    };
    const user3Token = {
      role: 'user',
      user_id: 'user-3',
    };
    const user1DB = db.withSessionVars(user1Token);
    const user3DB = db.withSessionVars(user3Token);
    const adminDB = db.withSessionVars(adminToken);

    // Users cannot delete messages
    await expect(user3DB.delete('messages', 'message-1')).rejects.toThrow(
      WritePermissionError
    );

    // Permitted user can delete messages
    await expect(
      user1DB.delete('messages', 'message-1')
    ).resolves.not.toThrow();

    // Admin can delete any message
    await expect(
      adminDB.delete('messages', 'message-2')
    ).resolves.not.toThrow();
  });

  it('permission-less collections can always be deleted from', async () => {
    const schema = {
      collections: {
        permissioned: {
          schema: S.Schema({
            id: S.Id(),
          }),
          permissions: {
            authenticated: {
              delete: {
                filter: [true],
              },
            },
          },
        },
        permissionless: {
          schema: S.Schema({
            id: S.Id(),
          }),
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });
    await db.insert('permissioned', { id: '1' }, { skipRules: true });
    await db.insert('permissionless', { id: '1' }, { skipRules: true });

    await expect(db.delete('permissioned', '1')).rejects.toThrow(
      WritePermissionError
    );
    await expect(db.delete('permissionless', '1')).resolves.not.toThrow();
  });

  it('can handle union of two roles', async () => {
    const schema = {
      roles: {
        authenticated: {
          match: {
            user_id: '$user_id',
          },
        },
        admin: {
          match: {
            role: 'admin',
            user_id: '$user_id',
          },
        },
      },
      collections: {
        messages: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            author_id: S.String(),
          }),
          permissions: {
            authenticated: {
              delete: {
                filter: [['author_id', '=', '$role.user_id']],
              },
            },
            admin: {
              delete: {
                filter: [true],
              },
            },
          },
        },
      },
    } satisfies DBSchema;

    const db = new DB({ schema });

    // insert messages
    await db.transact(
      async (tx) => {
        await tx.insert('messages', {
          id: 'message-1',
          text: 'Hello, world!',
          author_id: 'user-1',
        });
        await tx.insert('messages', {
          id: 'message-2',
          text: 'Hello, world!',
          author_id: 'user-2',
        });
        await tx.insert('messages', {
          id: 'message-3',
          text: 'Hello, world!',
          author_id: 'user-2',
        });
      },
      { skipRules: true }
    );

    const user1Token = {
      user_id: 'user-1',
    };
    const adminToken = {
      role: 'admin',
      user_id: 'user-1',
    };

    const user1DB = db.withSessionVars(user1Token);
    const adminDB = db.withSessionVars(adminToken);

    expect(adminDB.session?.roles).toEqual(
      expect.arrayContaining([
        { key: 'authenticated', roleVars: { user_id: 'user-1' } },
        { key: 'admin', roleVars: { user_id: 'user-1' } },
      ])
    );

    // User 1
    await expect(
      user1DB.delete('messages', 'message-1')
    ).resolves.not.toThrow();

    await expect(user1DB.delete('messages', 'message-2')).rejects.toThrow();

    // Admin
    await expect(
      adminDB.delete('messages', 'message-2')
    ).resolves.not.toThrow();
  });
});

it('write permissions are not recursively applied', async () => {
  const schema = {
    roles: {
      authenticated: {
        match: {
          user_id: '$user_id',
        },
      },
    },
    collections: {
      test1: {
        schema: S.Schema({
          id: S.Id(),
          test2_id: S.String(),
        }),
        relationships: {
          test2: S.RelationById('test2', '$test2_id'),
        },
        permissions: {
          authenticated: {
            insert: {
              // test2
              filter: [['test2.author_id', '=', '$role.user_id']],
            },
          },
        },
      },
      test2: {
        schema: S.Schema({
          id: S.Id(),
          author_id: S.String(),
          can_read: S.Boolean(),
        }),
        permissions: {
          authenticated: {
            read: {
              filter: [['can_read', '=', true]],
            },
            insert: {
              // If write rules are applied recursively, the test1 insert will fail
              filter: [false],
            },
          },
        },
      },
    },
  } satisfies DBSchema;

  const db = new DB({ schema });

  // Insert a test2 entity to match test1 rule
  await db.transact(
    async (tx) => {
      await tx.insert('test2', {
        id: 'test2-1',
        author_id: 'user-1',
        can_read: true,
      });
      await tx.insert('test2', {
        id: 'test2-2',
        author_id: 'user-1',
        can_read: false,
      });
    },
    { skipRules: true }
  );

  const user1Token = {
    user_id: 'user-1',
  };
  const user1DB = db.withSessionVars(user1Token);

  // Attempt to insert a test1 entity with info that doesnt pass the test2 entity insert permissions for a user
  // This should NOT throw because test2 write rules should not interfere with test1 write rules
  await expect(
    user1DB.insert('test1', {
      id: 'test1-1',
      test2_id: 'test2-1',
    })
  ).resolves.not.toThrow();

  // However they should recursively respect read rules!
  // Fails because test2-2 cannot be read by user
  await expect(
    user1DB.insert('test1', {
      id: 'test1-1',
      test2_id: 'test2-2',
    })
  ).rejects.toThrow(WritePermissionError);
});

it('can migrate from a schema with rules to a schema with permissions', async () => {
  const groupsCollection = messagingSchema.collections.groups.schema;
  const membersCollection = messagingSchema.collections.members.schema;
  const usersCollection = messagingSchema.collections.users.schema;
  const messagesCollection = messagingSchema.collections.messages.schema;

  const rulesSchema = {
    collections: {
      groups: {
        schema: groupsCollection,
      },
      members: {
        schema: membersCollection,
      },
      users: {
        schema: usersCollection,
      },
      messages: {
        schema: messagesCollection,
        rules: {
          read: {
            'can read': {
              filter: [true],
            },
          },
          write: {
            'can write': {
              filter: [true],
            },
          },
        },
      },
    } satisfies Models,
  };
  const kv = new BTreeKVStore();
  const db1 = new DB({ schema: rulesSchema, kv });
  // Check db1 schema has rules
  {
    const schema = await db1.getSchema();
    expect(schema).toBeDefined();
    expect(schema!.roles).toBeUndefined();
    expect(schema!.collections.messages.permissions).toBeUndefined();
    expect(schema!.collections.messages.rules).toBeDefined();
  }
  const db2 = new DB({ schema: messagingSchema, kv });
  // Check db2 schema has permissions
  {
    const schema = await db2.getSchema();
    expect(schema).toBeDefined();
    expect(schema!.roles).toBeDefined();
    expect(schema!.collections.messages.permissions).toBeDefined();
    expect(schema!.collections.messages.rules).toBeUndefined();
  }
});

describe('cyclical permissions', () => {
  const schema = S.Collections({
    users: {
      schema: S.Schema({
        id: S.Id(),
      }),
    },
    events: {
      schema: S.Schema({
        id: S.Id(),
      }),
      relationships: {
        attendees: S.RelationMany('eventAttendees', {
          where: [['eventId', '=', '$id']],
        }),
      },
      permissions: {
        user: {
          read: {
            // Can see events that they are attending
            filter: [['attendees.userId', '=', '$role.user_id']],
          },
        },
      },
    },
    eventAttendees: {
      schema: S.Schema({
        id: S.Id(),
        eventId: S.String(),
        userId: S.String(),
      }),
      relationships: {
        event: S.RelationById('events', '$eventId'),
        user: S.RelationById('users', '$userId'),
      },
      permissions: {
        user: {
          read: {
            // Can see event attendees of events that they are attending
            filter: [['event.attendees.userId', '=', '$role.user_id']],
          },
        },
      },
    },
  });

  const db = new DB({
    schema: {
      roles: {
        user: {
          match: {
            role: 'user',
            userId: '$user_id',
          },
        },
      },
      collections: schema,
    },
  });

  beforeAll(async () => {
    await db.insert('users', { id: '1' }, { skipRules: true });
    await db.insert('users', { id: '2' }, { skipRules: true });
    await db.insert('users', { id: '3' }, { skipRules: true });
    await db.insert('users', { id: '4' }, { skipRules: true });
    await db.insert('events', { id: '1' }, { skipRules: true });
    await db.insert('events', { id: '2' }, { skipRules: true });
    await db.insert(
      'eventAttendees',
      { id: '1', eventId: '1', userId: '1' },
      { skipRules: true }
    );
    await db.insert(
      'eventAttendees',
      { id: '2', eventId: '1', userId: '2' },
      { skipRules: true }
    );
    await db.insert(
      'eventAttendees',
      { id: '3', eventId: '2', userId: '1' },
      { skipRules: true }
    );
    await db.insert(
      'eventAttendees',
      { id: '4', eventId: '2', userId: '3' },
      { skipRules: true }
    );
    await db.insert(
      'eventAttendees',
      { id: '5', eventId: '2', userId: '4' },
      { skipRules: true }
    );
  });
  const user1Session = db.withSessionVars({
    role: 'user',
    userId: '1',
  });
  const user2Session = db.withSessionVars({
    role: 'user',
    userId: '2',
  });

  it('can query events that a user is attending', async () => {
    {
      const result = await user1Session.fetch(db.query('events'));
      expect(result.length).toBe(2);
      expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    }
    {
      const result = await user2Session.fetch(db.query('events'));
      expect(result.length).toBe(1);
      expect(result).toEqual([{ id: '1' }]);
    }
  });
  it('can query mutual attendees', async () => {
    {
      const result = await user1Session.fetch(db.query('eventAttendees'));
      expect(result.length).toBe(5);
    }
    {
      const result = await user2Session.fetch(db.query('eventAttendees'));
      expect(result.length).toBe(2);
    }
  });

  const SELF_READ_SCHEMA = {
    roles: {
      user: {
        match: {
          role: 'user',
          userId: '$user_id',
        },
      },
    },
    collections: S.Collections({
      users: {
        schema: S.Schema({
          id: S.Id(),
          friend_ids: S.Set(S.String(), { default: S.Default.Set.empty() }),
        }),
        relationships: {
          friends: S.RelationMany('users', {
            where: [['id', 'in', '$friend_ids']],
          }),
        },
        permissions: {
          user: {
            // Can only read self
            read: {
              filter: [['id', '=', '$role.user_id']],
            },
          },
        },
      },
    }),
  };

  it('Permissions are applied to an exists subquery from user query with collection re-use', async () => {
    const db = new DB({
      schema: SELF_READ_SCHEMA,
    });
    await db.transact(
      async (tx) => {
        await tx.insert('users', {
          id: '1',
          friend_ids: new Set(['1', '2']),
        });
        await tx.insert('users', {
          id: '2',
          friend_ids: new Set(['1', '2']),
        });
      },
      { skipRules: true }
    );
    const user1Session = db.withSessionVars({
      role: 'user',
      userId: '1',
    });
    // Should not read user 2
    const result1 = await user1Session.fetch({
      collectionName: 'users',
      where: [['id', '=', '2']],
    });
    const result2 = await user1Session.fetch({
      collectionName: 'users',
      where: [
        {
          exists: {
            collectionName: 'users',
            where: [
              ['id', 'in', '$friend_ids'],
              // Should not read user 2 --> exists should fail for user 1 (ie exists subquery result should be empty)
              ['id', '=', '2'],
              // Permission application will block this
            ],
          },
        },
      ],
    });
    expect(result1).toStrictEqual([]);
    expect(result2).toStrictEqual([]);
  });

  it('Permissions are applied to includes subquery from user query with collection re-use', async () => {
    const db = new DB({
      schema: SELF_READ_SCHEMA,
    });
    await db.transact(
      async (tx) => {
        await tx.insert('users', {
          id: '1',
          friend_ids: new Set(['1', '2']),
        });
        await tx.insert('users', {
          id: '2',
          friend_ids: new Set(['1', '2']),
        });
      },
      { skipRules: true }
    );
    const user1Session = db.withSessionVars({
      role: 'user',
      userId: '1',
    });
    // Should not read user 2
    const result1 = await user1Session.fetch({
      collectionName: 'users',
      include: {
        user2: {
          subquery: {
            collectionName: 'users',
            where: [['id', '=', '2']],
          },
          cardinality: 'one',
        },
      },
    });
    const result2 = await user1Session.fetch({
      collectionName: 'users',
      include: {
        friends: {
          _extends: 'friends',
          include: {
            user2: {
              subquery: {
                collectionName: 'users',
                where: [['id', '=', '2']],
              },
              cardinality: 'one',
            },
          },
        },
      },
    });
    expect(result1).toStrictEqual([
      {
        id: '1',
        friend_ids: new Set(['1', '2']),
        // cant read user2
        user2: null,
      },
    ]);
    expect(result2).toStrictEqual([
      {
        id: '1',
        friend_ids: new Set(['1', '2']),
        friends: [
          {
            id: '1',
            friend_ids: new Set(['1', '2']),
            // cant read user2
            user2: null,
          },
        ],
      },
    ]);
  });

  /**
   * These examples are all a touch contrived, but attempting to re-use a collection inside a rule in a way where the inner use should also have rules (like is_private respected)
   */
  it.todo(
    're applying permissions to a collection re-referencig the colleciton',
    async () => {
      // Start with single friend, then do multiple
      const schema = S.Collections({
        users: {
          schema: S.Schema({
            id: S.Id(),
            friend_id: S.Optional(S.String()),
            is_private: S.Boolean(),
          }),
          relationships: {
            friend: S.RelationById('users', '$friend_id'),
          },
          permissions: {
            user: {
              read: {
                filter: [
                  or([
                    // read any profile thats public
                    ['is_private', '=', false],
                    // read self
                    ['id', '=', '$role.user_id'],
                    // ready any profile where their friend can be read
                    exists('friend'),
                  ]),
                ],
              },
            },
          },
        },
      });

      const db = new DB({
        schema: {
          roles: {
            user: {
              match: {
                role: 'user',
                userId: '$user_id',
              },
            },
          },
          collections: schema,
        },
      });

      // Read self
      await db.insert(
        'users',
        { id: '1', friend_id: '2', is_private: true },
        { skipRules: true }
      );
      // Cant be read, no friend, private
      await db.insert(
        'users',
        { id: '2', is_private: true },
        { skipRules: true }
      );
      // Cant be read, private and friend cannot be read
      await db.insert(
        'users',
        { id: '3', friend_id: '4', is_private: true },
        { skipRules: true }
      );
      // private, cannot be read
      await db.insert(
        'users',
        { id: '4', is_private: true },
        { skipRules: true }
      );
      // private, but friend can be read
      await db.insert(
        'users',
        { id: '5', friend_id: '5', is_private: true },
        { skipRules: true }
      );
      // public, can be read
      await db.insert(
        'users',
        { id: '6', is_private: false },
        { skipRules: true }
      );

      // user 1
      {
        const session = db.withSessionVars({
          role: 'user',
          userId: '1',
        });
        const result = await session.fetch(db.query('users'));
        console.dir(result, { depth: null });
        // expect 1, 5, 6
      }
    }
  );
});
