import { describe, expect, it } from 'vitest';
import DB from '../../src/db.ts';
import { Schema as S } from '../../src/schema/builder.ts';
import { Models, StoreSchema } from '../../src/schema/types';
import { and, exists, or } from '../../src/query.ts';
import { WritePermissionError } from '../../src/errors.ts';
import { InMemoryTupleStorage } from '@triplit/tuple-database';

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
  collections: {
    groups: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        member_ids: S.Set(S.String()),
        members: S.RelationMany('members', {
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
  },
  version: 0,
} satisfies StoreSchema<Models>;

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
    const messages = await db.fetch(db.query('messages').build());
    expect(messages.length).toEqual(0);
  });

  it('skipping rules will allow you to read data', async () => {
    const db = new DB({ schema: messagingSchema });
    await seedMessagingData(db);
    const messages = await db.fetch(db.query('messages').build(), {
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
      const messages = await user1DB.fetch(user1DB.query('messages').build());
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
      const messages = await user2DB.fetch(user2DB.query('messages').build());
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
      const messages = await user3DB.fetch(user3DB.query('messages').build());
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
      const messages = await adminDB.fetch(adminDB.query('messages').build());
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
      version: 0,
    } satisfies StoreSchema<Models>;
    const db = new DB({ schema });
    await db.insert('permissioned', { id: '1' }, { skipRules: true });
    await db.insert('permissionless', { id: '1' }, { skipRules: true });

    {
      const query = db.query('permissioned').build();
      const results = await db.fetch(query);
      expect(results.length).toEqual(0);
    }

    {
      const query = db.query('permissionless').build();
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
      version: 0,
    } satisfies StoreSchema<Models>;

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

    expect(adminDB.sessionRoles).toEqual(
      expect.arrayContaining([
        { key: 'authenticated', roleVars: { user_id: 'user-1' } },
        { key: 'admin', roleVars: { user_id: 'user-1' } },
      ])
    );

    // User 1
    {
      const messages = await user1DB.fetch(user1DB.query('messages').build());
      expect(messages.length).toEqual(2);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-1',
        'message-2',
      ]);
    }

    // Admin
    {
      const messages = await adminDB.fetch(adminDB.query('messages').build());
      expect(messages.length).toEqual(3);
      expect(messages.map((m) => m.id).sort()).toEqual([
        'message-1',
        'message-2',
        'message-3',
      ]);
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
      deleted_at: null,
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
      version: 0,
    } satisfies StoreSchema<Models>;

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
      version: 0,
    } satisfies StoreSchema<Models>;

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

    expect(adminDB.sessionRoles).toEqual(
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
      version: 0,
    } satisfies StoreSchema<Models>;

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
      version: 0,
    } satisfies StoreSchema<Models>;

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
      version: 0,
    } satisfies StoreSchema<Models>;

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

    expect(adminDB.sessionRoles).toEqual(
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
      version: 0,
    } satisfies StoreSchema<Models>;

    const db = new DB({ schema });
    await db.insert('permissioned', { id: '1' }, { skipRules: true });
    await db.insert('permissionless', { id: '1' }, { skipRules: true });

    await expect(db.delete('permissioned', '1')).rejects.toThrow(
      WritePermissionError
    );
    await expect(db.delete('permissionless', '1')).resolves.not.toThrow();
  });
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
  const storage = new InMemoryTupleStorage();
  const db1 = new DB({ schema: rulesSchema, source: storage });
  // Check db1 schema has rules
  {
    const schema = await db1.getSchema();
    expect(schema).toBeDefined();
    expect(schema!.roles).toBeUndefined();
    expect(
      // @ts-expect-error
      schema!.collections.messages.permissions
    ).toBeUndefined();
    expect(schema!.collections.messages.rules).toBeDefined();
  }
  const db2 = new DB({ schema: messagingSchema, source: storage });
  // Check db2 schema has permissions
  {
    const schema = await db2.getSchema();
    expect(schema).toBeDefined();
    expect(schema!.roles).toBeDefined();
    expect(schema!.collections.messages.permissions).toBeDefined();
    expect(
      // @ts-expect-error
      schema!.collections.messages.rules
    ).toBeUndefined();
  }
});
