import { InMemoryTupleStorage } from '@triplit/tuple-database';
import { describe, expect, it, beforeEach, beforeAll } from 'vitest';
import { DB, Schema as S, WriteRuleError } from '../../src';
import { classes } from '../sample_data/school.js';
import { testDBAndTransaction } from '../db.spec';
import { Models } from '../../src/schema/types';

describe('Rules', () => {
  describe('Read', () => {
    const storage = new InMemoryTupleStorage();
    const USER_ID = 'student-2';
    const db = new DB({
      source: storage,
      variables: {
        user_id: USER_ID,
      },
    });

    beforeAll(async () => {
      await db.createCollection({
        name: 'classes',
        schema: {
          id: { type: 'string', options: {} },
          name: { type: 'string', options: {} },
          level: { type: 'number', options: {} },
          department: { type: 'string', options: {} },
          enrolled_students: {
            type: 'set',
            items: { type: 'string', options: {} },
            options: {},
          },
        },
        rules: {
          read: {
            enrolled_students_read: {
              description: "Students can only view classes they're enrolled in",
              filter: [['enrolled_students', '=', '$user_id']],
            },
          },
        },
      });

      await db.transact(async (tx) => {
        for (const cls of classes) {
          await tx.insert('classes', {
            ...cls,
            enrolled_students: new Set(cls.enrolled_students),
          });
        }
      });
    });

    it('fetch: filters results based on rules', async () => {
      const query = db.query('classes').build();
      await testDBAndTransaction(
        () => db,
        async (db) => {
          const results = await db.fetch(query);
          const classesWithStudent2 = classes.filter((cls) =>
            cls.enrolled_students.includes(USER_ID)
          );
          expect(results).toHaveLength(classesWithStudent2.length);
        }
      );
    });

    it('fetch: doesnt filter rules if skipRules is set', async () => {
      const query = db.query('classes').build();
      await testDBAndTransaction(
        () => db,
        async (db) => {
          const results = await db.fetch(query, { skipRules: true });
          expect(results).toHaveLength(classes.length);
        }
      );
    });

    it('fetchById: filters results based on rules', async () => {
      await testDBAndTransaction(
        () => db,
        async (db) => {
          const nonEnrolledClass = await db.fetchById('classes', 'class-2');
          expect(nonEnrolledClass).toBeNull();
          const enrolledClass = await db.fetchById('classes', 'class-1');
          expect(enrolledClass).not.toBeNull();
        }
      );
    });

    it('fetchById: doesnt filter rules if skipRules is set', async () => {
      await testDBAndTransaction(
        () => db,
        async (db) => {
          const nonEnrolledClass = await db.fetchById('classes', 'class-2', {
            skipRules: true,
          });
          expect(nonEnrolledClass).not.toBeNull();
          const enrolledClass = await db.fetchById('classes', 'class-1', {
            skipRules: true,
          });
          expect(enrolledClass).not.toBeNull();
        }
      );
    });

    it('subscriptions only fire if filter matches', async () => {
      const db = new DB();
      const completedTodosQuery = db
        .query('todos')
        .where('completed', '=', true)
        .build();

      let calls = 0;
      let assertions = [
        (results: Map<string, any>) => {
          expect(results.size).toBe(0);
        },
        (results: Map<string, any>) => {
          expect(results.size).toBe(1);
          expect(results.get('1')).toBeTruthy();
        },
        (results: Map<string, any>) => {
          expect(results.size).toBe(2);
          expect(results.get('1')).toBeTruthy();
          expect(results.get('2')).toBeFalsy();
          expect(results.get('3')).toBeTruthy();
        },
      ];
      db.subscribe(completedTodosQuery, (data) => {
        assertions[calls](data);
        calls++;
      });
      // Insert data over time
      await new Promise<void>((res) =>
        setTimeout(async () => {
          await db.insert('todos', {
            text: 'Buy milk',
            completed: true,
            id: '1',
          });
          res();
        }, 20)
      );
      await new Promise<void>((res) =>
        setTimeout(async () => {
          await db.insert('todos', {
            text: 'Buy eggs',
            completed: false,
            id: '2',
          });
          res();
        }, 20)
      );
      await new Promise<void>((res) =>
        setTimeout(async () => {
          await db.insert('todos', {
            text: 'Buy bread',
            completed: true,
            id: '3',
          });
          res();
        }, 20)
      );

      await new Promise<void>((res) => setTimeout(res, 20));
      expect(calls).toEqual(3);
    });
  });

  describe('Insert', () => {
    let db: DB<undefined>;
    const USER_ID = 'the-user-id';
    beforeAll(async () => {
      db = new DB({
        variables: {
          user_id: USER_ID,
        },
      });

      await db.createCollection({
        name: 'posts',
        schema: {
          id: { type: 'string', options: {} },
          author_id: { type: 'string', options: {} },
        },
        rules: {
          write: {
            'post-author': {
              description: 'Users can only post posts they authored',
              filter: [['author_id', '=', '$user_id']],
            },
          },
        },
      });
    });

    describe('insert single', () => {
      it('can insert an entity that matches the filter', async () => {
        expect(
          db.insert('posts', { id: 'post-1', author_id: USER_ID })
        ).resolves.not.toThrowError();
      });

      it("throws an error when inserting a obj that doesn't match filter", async () => {
        expect(
          db.insert('posts', {
            id: 'post-1',
            author_id: 'Not-the-current-user',
          })
        ).rejects.toThrowError(WriteRuleError);
      });
    });

    describe('insert in transaction', () => {
      it('can insert an entity that matches the filter', async () => {
        expect(
          db.transact(async (tx) => {
            await tx.insert('posts', { id: 'post-1', author_id: USER_ID });
          })
        ).resolves.not.toThrowError();
      });

      it("throws an error when inserting a obj that doesn't match filter", async () => {
        expect(
          db.transact(async (tx) => {
            await tx.insert('posts', {
              id: 'post-1',
              author_id: 'Not-the-current-user',
            });
          })
        ).rejects.toThrowError(WriteRuleError);
      });

      it('ignores rules if skipRules is set', async () => {
        expect(
          db.transact(
            async (tx) => {
              await tx.insert('posts', {
                id: 'post-1',
                author_id: 'Not-the-current-user',
              });
            },
            { skipRules: true }
          )
        ).resolves.not.toThrowError();
      });
    });

    describe('rules with relationships', async () => {
      const collections = {
        posts: {
          schema: S.Schema({
            id: S.Id(),
            text: S.String(),
            author_id: S.String(),
            author: S.RelationById('users', '$author_id'),
          }),
          rules: {
            write: {
              'admin-write': {
                description: 'Only admin users can create posts',
                filter: [
                  ['author.admin', '=', true],
                  ['author_id', '=', '$session.user_id'],
                ],
              },
            },
          },
        },
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            admin: S.Boolean(),
          }),
        },
      } satisfies Models<any, any>;
      const schema = { collections };
      it('insert with relationship in rule', async () => {
        const db = new DB({ schema });

        const aliceDB = db.withSessionVars({ user_id: 'user-1' });
        const bobDB = db.withSessionVars({ user_id: 'user-2' });

        await db.insert('users', { id: 'user-1', name: 'Alice', admin: true });
        await db.insert('users', { id: 'user-2', name: 'Bob', admin: false });

        await expect(
          aliceDB.insert('posts', {
            id: 'post-1',
            text: 'post-1',
            author_id: 'user-1',
          })
        ).resolves.not.toThrowError();
        await expect(
          bobDB.insert('posts', {
            id: 'post-2',
            text: 'post-2',
            author_id: 'user-2',
          })
        ).rejects.toThrowError(WriteRuleError);
      });

      it('update with relationship in rule', async () => {
        const db = new DB({ schema });
        const aliceDB = db.withSessionVars({ user_id: 'user-1' });
        const bobDB = db.withSessionVars({ user_id: 'user-2' });

        await db.insert('users', { id: 'user-1', name: 'Alice', admin: true });
        await db.insert('users', { id: 'user-2', name: 'Bob', admin: false });

        await aliceDB.insert('posts', {
          id: 'post-1',
          text: 'post-1',
          author_id: 'user-1',
        });
        await aliceDB.insert('posts', {
          id: 'post-2',
          text: 'post-2',
          author_id: 'user-1',
        });

        await expect(
          aliceDB.update('posts', 'post-1', async (entity) => {
            entity.text = 'post-1 updated';
          })
        ).resolves.not.toThrowError();
        await expect(
          bobDB.update('posts', 'post-2', async (entity) => {
            entity.text = 'post-2 updated';
          })
        ).rejects.toThrowError(WriteRuleError);
      });

      it('delete with relationship in rule', async () => {
        const db = new DB({ schema });
        const aliceDB = db.withSessionVars({ user_id: 'user-1' });
        const bobDB = db.withSessionVars({ user_id: 'user-2' });

        await db.insert('users', { id: 'user-1', name: 'Alice', admin: true });
        await db.insert('users', { id: 'user-2', name: 'Bob', admin: false });

        await aliceDB.insert('posts', {
          id: 'post-1',
          text: 'post-1',
          author_id: 'user-1',
        });
        await aliceDB.insert('posts', {
          id: 'post-2',
          text: 'post-2',
          author_id: 'user-1',
        });

        await expect(
          aliceDB.delete('posts', 'post-1')
        ).resolves.not.toThrowError();
        await expect(bobDB.delete('posts', 'post-2')).rejects.toThrowError(
          WriteRuleError
        );
      });
    });
  });

  describe('Update', () => {
    let db: DB<any>;
    const USER_ID = 'the-user-id';
    const POST_ID = 'post-1';
    const POST = { id: POST_ID, author_id: USER_ID, content: 'before' };
    beforeEach(async () => {
      db = new DB().withSessionVars({ user_id: USER_ID });

      await db.createCollection({
        name: 'posts',
        schema: {
          id: { type: 'string', options: {} },
          author_id: { type: 'string', options: {} },
          content: { type: 'string', options: {} },
        },
        rules: {
          write: {
            'post-author': {
              description: 'Users can only post posts they authored',
              filter: [['author_id', '=', '$session.user_id']],
            },
          },
        },
      });

      await db.insert('posts', POST);
    });

    describe('update single', () => {
      it('can update an entity that passes filter', async () => {
        await expect(
          db.update('posts', POST_ID, async (entity) => {
            entity.content = 'after';
          })
        ).resolves.not.toThrowError();
      });

      it("throws an error when updating an obj that doesn't match filter", async () => {
        await expect(
          db
            .withSessionVars({ user_id: 'not the user' })
            .update('posts', POST_ID, async (entity) => {
              entity.content = 'hax0r';
            })
        ).rejects.toThrowError(WriteRuleError);
        const post = await db.fetchById('posts', POST_ID);
        expect(post.author_id).not.toBe('not me');
      });

      it('ignores rules if skipRules is set', async () => {
        await expect(
          db.update(
            'posts',
            POST_ID,
            async (entity) => {
              entity.author_id = 'not me';
            },
            { skipRules: true }
          )
        ).resolves.not.toThrowError();
        const post = await db.fetchById('posts', POST_ID);
        expect(post.author_id).toBe('not me');
      });
    });

    describe('update in transaction', () => {
      it('can update an entity that passes the filter', async () => {
        const post = await db.fetchById('posts', POST_ID);
        await expect(
          db.transact(async (tx) => {
            await tx.update('posts', POST_ID, async (entity) => {
              entity.content = 'after';
            });
          })
        ).resolves.not.toThrowError();
      });

      it("throws an error when updating a obj that doesn't match filter", async () => {
        await expect(
          db.transact(async (tx) => {
            await tx.update('posts', POST_ID, async (entity) => {
              entity.author_id = 'not me';
            });
          })
        ).rejects.toThrowError(WriteRuleError);
        const post = await db.fetchById('posts', POST_ID);
        expect(post!.author_id).not.toBe('not me');
      });
    });
  });

  describe('Delete', () => {
    const collections = {
      posts: {
        schema: S.Schema({
          id: S.String(),
          author_id: S.String(),
        }),
        rules: {
          write: {
            'post-author': {
              description: 'Users can only post posts they authored',
              filter: [['author_id', '=', '$user_id']],
            },
          },
        },
      },
    } satisfies Models<any, any>;
    const schema = { collections };

    const user_id = 'user-1';

    it('can delete entity that passes rule', async () => {
      const db = new DB({
        schema,
        variables: {
          user_id,
        },
      });
      await db.insert('posts', { id: 'post-1', author_id: user_id });
      await db.delete('posts', 'post-1');
    });

    it("throws an error when deleting an entity that doesn't pass rule", async () => {
      const storage = new InMemoryTupleStorage();
      const db1 = new DB({
        schema,
        variables: {
          user_id,
        },
        source: storage,
      });
      const db2 = new DB({
        schema,
        variables: {
          user_id: 'user-2',
        },
        source: storage,
      });
      await db1.insert('posts', { id: 'post-1', author_id: user_id });
      await expect(db2.delete('posts', 'post-1')).rejects.toThrowError(
        WriteRuleError
      );
    });

    it('ignores rules if skipRules is set', async () => {
      const storage = new InMemoryTupleStorage();
      const db1 = new DB({
        schema,
        variables: {
          user_id,
        },
        source: storage,
      });
      const db2 = new DB({
        schema,
        variables: {
          user_id: 'user-2',
        },
        source: storage,
      });
      await db1.insert('posts', { id: 'post-1', author_id: user_id });
      await expect(
        db2.delete('posts', 'post-1', { skipRules: true })
      ).resolves.not.toThrowError();
    });
  });
});
