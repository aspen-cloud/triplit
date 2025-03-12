import { describe, expect, it, beforeEach, vi, beforeAll } from 'vitest';
import { and, or } from '../src/filters.js';
import {
  InvalidFilterError,
  DBSerializationError,
  EntityNotFoundError,
  InvalidOperationError,
  InvalidCollectionNameError,
  InvalidInsertDocumentError,
} from '../src/errors.js';
import { createDB, DB } from '../src';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { classes, students, departments } from './sample_data/school.js';
import { testSubscription } from './utils/test-subscription.js';
import { Schema as S } from '../src/schema/builder.js';

import { testDBAndTransaction } from './utils/db-helpers.js';

const TUPLE_DB_DEFAULT_PAGE_SIZE = 100;

describe('Database API', () => {
  let db: DB;
  beforeEach(async () => {
    db = new DB({});
    for (const student of students) {
      await db.insert('Student', student);
    }
    for (const schoolClass of classes) {
      await db.insert('Class', schoolClass);
    }
    for (const department of departments) {
      await db.insert('Department', department);
    }
    for (const rapper of RAPPERS_AND_PRODUCERS) {
      await db.insert('Rapper', rapper);
    }
  });
  it('can furnish the client id', async () => {
    expect(db.clientId).toBeTruthy();
  });

  it('can lookup entity by Id', async () => {
    const student1 = await db.fetchById('Student', students[0].id);
    expect(student1).not.toBeNull();

    const notAStudent = await db.fetchById('Student', `not_a_real_id`);
    expect(notAStudent).toBeNull();
  });

  describe('Supports basic queries with filters', () => {
    it('supports equality operator', async () => {
      const eq = await db.fetch(db.query('Class').Where([['level', '=', 100]]));
      expect(eq.length).toBe(classes.filter((cls) => cls.level === 100).length);
    });

    it('supports inequality operator', async () => {
      const neq = await db.fetch(
        db.query('Class').Where([['level', '!=', 100]])
      );
      expect(neq.length).toBe(
        classes.filter((cls) => cls.level !== 100).length
      );
    });

    it('supports greater than operator', async () => {
      const gt = await db.fetch(db.query('Class').Where([['level', '>', 100]]));
      expect(gt.length).toBe(classes.filter((cls) => cls.level > 100).length);
    });

    it('supports greater than or equal operator', async () => {
      const gte = await db.fetch(
        db.query('Class').Where([['level', '>=', 100]])
      );
      expect(gte.length).toBe(classes.filter((cls) => cls.level >= 100).length);
    });

    it('supports less than operator', async () => {
      const lt = await db.fetch(db.query('Class').Where([['level', '<', 200]]));
      expect(lt.length).toBe(classes.filter((cls) => cls.level < 200).length);
    });

    it('supports less than or equal operator', async () => {
      const lte = await db.fetch(
        db.query('Class').Where([['level', '<=', 200]])
      );
      expect(lte.length).toBe(classes.filter((cls) => cls.level <= 200).length);
    });

    it('supports "in" operator', async () => {
      const _in = await db.fetch(
        db.query('Class').Where([['level', 'in', [100, 200]]])
      );
      expect(_in.length).toBe(4);
    });

    it('supports "nin" operator', async () => {
      const nin = await db.fetch(
        db.query('Class').Where([['level', 'nin', [100, 200]]])
      );
      expect(nin.length).toBe(1);
    });
  });
  it('treats "in" operations on sets as a defacto "intersects"', async () => {
    const newDb = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              set: S.Set(S.String(), { default: S.Default.Set.empty() }),
            }),
          },
        },
      },
    });
    await newDb.insert('test', { id: '1', set: new Set(['a', 'b', 'c']) });
    await newDb.insert('test', { id: '2', set: new Set(['a']) });
    await newDb.insert('test', { id: '3', set: new Set(['d', 'e']) });
    let results = await newDb.fetch(
      newDb.query('test').Where([['set', 'in', ['a', 'd']]])
    );
    expect(results.length).toBe(3);
    results = await newDb.fetch(
      newDb.query('test').Where([['set', 'in', ['d']]])
    );
    expect(results.length).toBe(1);
    results = await newDb.fetch(
      newDb.query('test').Where([['set', 'in', ['a', 'b']]])
    );
    expect(results.length).toBe(2);
  });

  it('supports basic queries with the "like" operator', async () => {
    const studentsNamedJohn = await db.fetch(
      db.query('Student').Where(['name', 'like', 'John%'])
    );
    expect(studentsNamedJohn.length).toBe(
      students.filter((s) => s.name.startsWith('John')).length
    );

    const studentswithIeIntheirName = await db.fetch(
      db.query('Student').Where([['name', 'like', '%ie%']])
    );
    expect(studentswithIeIntheirName.length).toBe(
      students.filter((s) => s.name.includes('ie')).length
    );

    const calculusClasses = await db.fetch(
      db.query('Class').Where([['name', 'like', 'Calculus _']])
    );
    expect(calculusClasses.length).toBe(
      classes.filter((c) => new RegExp('Calculus *').test(c.name)).length
    );

    const escapeOutRegex = await db.fetch(
      db.query('Class').Where([['name', 'like', 'Calculus*+']])
    );
    expect(escapeOutRegex.length).not.toBe(
      classes.filter((c) => new RegExp('Calculus *').test(c.name)).length
    );
    const departmentsWithSinTheMiddleOfTheirName = await db.fetch(
      db.query('Department').Where([['name', 'like', '%_s_%']])
    );
    expect(departmentsWithSinTheMiddleOfTheirName.length).toBe(2);
    const artistsWithDashInTheirName = await db.fetch(
      db.query('Rapper').Where([['name', 'like', '%-%']])
    );
    expect(artistsWithDashInTheirName.length).toBe(2);
    const artistsWithDollaSignInTheirName = await db.fetch(
      db.query('Rapper').Where([['name', 'like', '%$%']])
    );
    expect(artistsWithDollaSignInTheirName.length).toBe(1);

    const artistsWithQuotesInTheirName = await db.fetch(
      db.query('Rapper').Where([['name', 'like', "%'%'%"]])
    );
    expect(artistsWithQuotesInTheirName.length).toBe(2);

    const Biggie = await db.fetch(
      db.query('Rapper').Where([['name', 'like', '%B.I.G%.']])
    );
    expect(Biggie.length).toBe(1);
  });

  it('support basic queries with the "nlike" operator', async () => {
    const Biggie = await db.fetch(
      db.query('Rapper').Where([['name', 'nlike', '%B.I.G%.']])
    );
    expect(Biggie.length).toBe(RAPPERS_AND_PRODUCERS.length - 1);
    const artistsWithoutQuotesInTheirName = await db.fetch(
      db.query('Rapper').Where([['name', 'nlike', "%'%'%"]])
    );
    expect(artistsWithoutQuotesInTheirName.length).toBe(
      RAPPERS_AND_PRODUCERS.length - 2
    );
  });

  const RAPPERS_AND_PRODUCERS = [
    { name: 'Ty Dolla $ign', id: '1', rank: 1 },
    { name: 'Boi-1da', id: '2', rank: 2 },
    { name: 'Mike Will Made-It', id: '3', rank: 3 },
    { name: "Noah '40' Shebib", id: '4', rank: 4 },
    { name: 'The Notoious B.I.G.', id: '5', rank: 5 },
    { name: "Travis 'LaFlame' Scott", id: '6', rank: 6 },
  ];

  describe('has and !has operators', () => {
    const classes = [
      {
        id: 'class-1',
        name: 'Math 101',
        level: 100,
        department: 'Math',
        enrolled_students: [],
      },
      {
        id: 'class-2',
        name: 'History 201',
        level: 200,
        department: 'History',
        enrolled_students: ['student-1', 'student-2'],
      },
      {
        id: 'class-3',
        name: 'Physics 301',
        level: 300,
        department: 'Physics',
        enrolled_students: ['student-1', 'student-3', 'student-4'],
      },
      {
        id: 'class-4',
        name: 'English 401',
        level: 400,
        department: 'English',
        enrolled_students: [],
      },
      {
        id: 'class-5',
        name: 'Chemistry 501',
        level: 500,
        department: 'Chemistry',
        enrolled_students: [],
      },
    ];
    let db: DB;

    beforeAll(async () => {
      db = new DB({
        schema: {
          collections: {
            Classes: {
              schema: S.Schema({
                id: S.Id(),
                name: S.String(),
                level: S.Number(),
                department: S.String(),
                enrolled_students: S.Set(S.String()),
              }),
            },
          },
        },
      });
      await Promise.all(
        classes.map((cls) =>
          db.insert('Classes', {
            ...cls,
            enrolled_students: new Set(cls.enrolled_students),
          })
        )
      );
    });

    it('should find all positive matches', async () => {
      const results = await db.fetch(
        db.query('Classes').Where([['enrolled_students', 'has', 'student-1']])
      );
      expect(results.map((e) => e.id)).toStrictEqual(['class-2', 'class-3']);
    });

    it('should return nothing with non-existing value', async () => {
      const results2 = await db.fetch(
        db.query('Classes').Where([['enrolled_students', 'has', 'bad-id']])
      );
      expect(results2.length).toBe(0);
    });

    it('can support inverted (not has) matches', async () => {
      const results3 = await db.fetch(
        db.query('Classes').Where([['enrolled_students', '!has', 'student-1']])
      );
      expect(results3.map((e) => e.id)).toStrictEqual([
        'class-1',
        'class-4',
        'class-5',
      ]);
    });

    it('should return all classes inverted non-existing value', async () => {
      const results4 = await db.fetch(
        db.query('Classes').Where([['enrolled_students', '!has', 'bad-id']])
      );
      expect(results4.length).toBe(5);
    });
  });

  it('supports basic queries without filters', async () => {
    const results = await db.fetch(db.query('Student'));
    expect(results.length).toBe(students.length);
  });

  it('throws an error when filtering with an unimplmented operator', async () => {
    await expect(
      db.fetch(
        db.query('Rapper').Where([['name', 'not a real operator', 'Boi-1da']])
      )
    ).rejects.toThrowError(InvalidFilterError);
  });

  it('supports filtering on one attribute with multiple operators (and() helper)', async () => {
    const results = await db.fetch(
      db.query('Rapper').Where([
        and([
          ['rank', '<', 5],
          ['rank', '>=', 2],
        ]),
      ])
    );
    const ranks = [...results.values()].map((r) => r.rank);
    expect(Math.max(...ranks)).toBe(4);
    expect(Math.min(...ranks)).toBe(2);
    expect(results.length).toBe(3);
  });

  it('supports filtering on one attribute with multiple operators (additive)', async () => {
    const results = await db.fetch(
      db
        .query('Rapper')
        .Where([['rank', '<', 5]])
        .Where('rank', '>=', 2)
    );
    const ranks = [...results.values()].map((r) => r.rank);
    expect(Math.max(...ranks)).toBe(4);
    expect(Math.min(...ranks)).toBe(2);
    expect(results.length).toBe(3);
  });

  it('where clause by non leaf will throw error', async () => {
    const db = new DB({
      schema: {
        collections: S.Collections({
          students: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              address: S.Record({ street: S.String(), city: S.String() }),
              dorm_id: S.String(),
            }),
            relationships: {
              dorm: S.RelationById('dorms', '$1.dorm_id'),
            },
          },
          dorms: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
            }),
          },
        }),
      },
    });
    // Access record
    {
      const query = db.query('students').Where('address', '=', 'foo');
      await expect(db.fetch(query)).rejects.toThrow(InvalidFilterError);
    }

    // Access relation
    {
      const query = db.query('students').Where('dorm', '=', 'foo');
      await expect(db.fetch(query)).rejects.toThrow(InvalidFilterError);
    }

    // inside modified clause
    {
      const query = db.query('students').Where(
        or([
          ['name', '=', 'foo'],
          ['dorm', '=', 'foo'],
        ])
      );
      await expect(db.fetch(query)).rejects.toThrow(InvalidFilterError);
    }
  });

  it('can report basic collection stats from the database', async () => {
    const stats = await db.getCollectionStats();
    expect([...stats.keys()]).toEqual([
      'Class',
      'Department',
      'Rapper',
      'Student',
    ]);
    expect(stats.get('Student')).toBe(students.length);
    expect(stats.get('Class')).toBe(classes.length);
    expect(stats.get('Department')).toBe(departments.length);
  });

  it('insert throws an error if no collection name is provided', async () => {
    const db = new DB();
    await expect(
      db.insert(undefined, { name: 'John Doe', id: '1' })
    ).rejects.toThrowError(InvalidCollectionNameError);
    await expect(
      db.insert('', { name: 'John Doe', id: '1' })
    ).rejects.toThrowError(InvalidCollectionNameError);
  });

  it('insert throws an error if no document is provided', async () => {
    const db = new DB();
    await expect(db.insert('Student', undefined)).rejects.toThrowError(
      InvalidInsertDocumentError
    );
  });

  it('insert throws an error if the document is not an object', async () => {
    const db = new DB();
    await expect(db.insert('Student', undefined)).rejects.toThrowError(
      InvalidInsertDocumentError
    );
    await expect(db.insert('Student', 123)).rejects.toThrowError(
      InvalidInsertDocumentError
    );
  });

  it('delete throws an error if no collection name is provided', async () => {
    const db = new DB();
    await expect(db.delete(undefined, '1')).rejects.toThrowError(
      InvalidCollectionNameError
    );
    await expect(db.delete('', '1')).rejects.toThrowError(
      InvalidCollectionNameError
    );
  });

  it('update throws an error if you attempt to mutate the entity id', async () => {
    // Schemaless
    const db = new DB();
    await db.insert('Student', {
      name: 'John Doe',
      id: '1',
      not: { id: 'not_id' },
    });
    await expect(
      db.update('Student', '1', (entity) => {
        entity.id = '2';
      })
    ).rejects.toThrowError(InvalidOperationError);
    await expect(
      db.update('Student', '1', (entity) => {
        delete entity.id;
      })
    ).rejects.toThrowError(InvalidOperationError);
    await expect(
      db.update('Student', '1', (entity) => {
        entity.not.id = 'updated';
      })
    ).resolves.not.toThrow();

    // Schemaful
    const schemaDb = new DB({
      schema: {
        collections: {
          Student: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              not: S.Record({ id: S.String() }),
            }),
          },
        },
      },
    });
    await schemaDb.insert('Student', {
      id: '1',
      name: 'John Doe',
      not: { id: 'not_id' },
    });
    await expect(
      schemaDb.update('Student', '1', (entity) => {
        entity.id = '2';
      })
    ).rejects.toThrowError(InvalidOperationError);
    await expect(
      schemaDb.update('Student', '1', (entity) => {
        delete entity.id;
      })
    ).rejects.toThrowError(InvalidOperationError);
    await expect(
      schemaDb.update('Student', '1', (entity) => {
        entity.not.id = 'updated';
      })
    ).resolves.not.toThrow();
  });

  it('throws an error if a required field is missing on insert', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              age: S.Number(),
              email: S.String({ nullable: true, default: null }),
            }),
          },
        },
      },
    });
    await expect(db.insert('test', { id: '1' })).rejects.toThrowError(
      DBSerializationError
    );
  });

  it('strips out extra fields on insert', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              age: S.Number(),
              email: S.String({ nullable: true, default: null }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: '1',
      name: 'John Doe',
      age: 22,
      extraField: 'extra',
    });
    const result = await db.fetchById('test', '1');
    expect(result).not.toHaveProperty('extraField');
  });

  it('checks that fields have valid types on insert', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              age: S.Number(),
              email: S.String({ nullable: true, default: null }),
            }),
          },
        },
      },
    });
    // fields have valid types
    await expect(
      db.insert('test', {
        id: '1',
        name: 'John Doe',
        age: '22',
      })
    )
      .rejects.toThrowError(DBSerializationError)
      // TODO: maybe setup custom matchers to test messages: https://jestjs.io/docs/expect#expectextendmatchers
      // Ugly but so is setting up try / catch
      .then((assertion) => {
        const error = assertion.__flags.object;
        expect(error.message).toContain(
          'There was an error serializing an input to an acceptable format. Could not transform the data: 22 as type: number'
        );
      });
  });

  it('updater function returns js values on reads', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              string: S.String(),
              number: S.Number(),
              nullable: S.String({ nullable: true }),
              date: S.Date(),
              set: S.Set(S.String(), { default: S.Default.Set.empty() }),
            }),
          },
        },
      },
    });
    const NOW = new Date();
    await db.insert('test', {
      id: '1',
      string: 'string',
      number: 1,
      nullable: null,
      date: NOW,
      set: new Set(['a', 'b', 'c']),
    });
    await db.update('test', '1', (entity) => {
      expect(entity.string).toBe('string');
      expect(entity.number).toBe(1);
      expect(entity.nullable).toBe(null);
      expect(entity.date).toStrictEqual(NOW);
      expect(entity.set).toBeInstanceOf(Set);
      expect([...entity.set.values()]).toEqual(['a', 'b', 'c']);
      // For now just logging
      // TODO: figure out what to do with 'constructor' prop
      // Also figure out how to test without going through proxy
    });
  });
});

it('fetchOne gets first match or null', async () => {
  await testDBAndTransaction(
    () => new DB(),
    async (db) => {
      await db.insert('Student', { name: 'John Doe', id: '1' });
      await db.insert('Student', { name: 'Jane Doe', id: '2' });
      await db.insert('Student', { name: 'John Smith', id: '3' });
      await db.insert('Student', { name: 'Jane Smith', id: '4' });
      const johnQuery = {
        collectionName: 'Student',
        where: [['name', 'like', 'John%']],
      };

      const ettaQuery = {
        collectionName: 'Student',
        where: [['name', 'like', '%Etta%']],
      };
      const john = await db.fetchOne(johnQuery);
      expect(john).toBeDefined();
      expect(john.id).toBe('1');
      expect(john.name).toBe('John Doe');

      const etta = await db.fetchOne(ettaQuery);
      expect(etta).toBeNull();
    }
  );
});

describe('Register operations', () => {
  let db: DB;
  beforeEach(async () => {
    db = new DB();
    await db.insert('employees', { id: '1', name: 'Philip J. Fry' });
    await db.insert('employees', { id: '2', name: 'Turanga Leela' });
    await db.insert('employees', { id: '3', name: 'Amy Wong' });
    await db.insert('employees', { id: '4', name: 'Bender Bending Rodriguez' });
    await db.insert('employees', { id: '5', name: 'Hermes Conrad' });
  });

  it('can set register', async () => {
    const preUpdateQuery = db
      .query('employees')
      .Select(['id'])
      .Where([['name', '=', 'Philip J. Fry']]);

    const preUpdateLookup = await db.fetch(preUpdateQuery);
    expect(preUpdateLookup).toHaveLength(1);
    expect(preUpdateLookup[0]).toBeTruthy();

    const NEW_NAME = 'Dr. Zoidberg';

    await db.update('employees', '1', async (entity) => {
      entity.name = NEW_NAME;
      expect(entity.name).toBe(NEW_NAME);
    });

    const postUpdateQuery = db
      .query('employees')
      .Select(['id', 'name'])
      .Where([['name', '=', NEW_NAME]]);

    const oldQueryResult = await db.fetch(preUpdateQuery);
    const newQueryResult = await db.fetch(postUpdateQuery);
    expect(oldQueryResult).toHaveLength(0);
    expect(newQueryResult).toHaveLength(1);
    expect(newQueryResult[0]).toBeTruthy();
    expect(newQueryResult[0].name).toBe(NEW_NAME);
  });
});

describe.todo('array operations');

describe("Entity Id'ing", () => {
  describe('schemaless', () => {
    it('can insert an entity with an id attribute and retrieve it using the same id', async () => {
      const db = new DB();
      const id = 'myId';
      const entity = { id, name: 'Alice' };
      await db.insert('students', entity);
      const result = await db.fetchById('students', id);
      expect(result).toMatchObject(entity);
    });
    it('can insert an entity without an id attribute and have it generated', async () => {
      const db = new DB();
      const entityDoc = { name: 'Alice' };
      await db.insert('students', entityDoc);
      const result = await db.fetchOne(db.query('students'));
      expect(result).not.toBeNull();
      expect(result.id).toBeDefined();
    });
  });

  describe('with schema', () => {
    it('can define a schema with a required id attribute and fail if its not provided', async () => {
      const db = new DB({
        schema: {
          collections: {
            students: {
              schema: S.Schema({
                id: S.String({ nullable: false }),
                name: S.String(),
              }),
            },
          },
        },
      });
      const entityDoc = { name: 'Alice' };
      await expect(db.insert('students', entityDoc)).rejects.toThrow();
    });

    it('can define a schema with an auto generated id attribute and have it generated', async () => {
      const db = new DB({
        schema: {
          collections: {
            students: {
              schema: S.Schema({
                id: S.String({ default: { func: 'uuid' } }),
                name: S.String(),
              }),
            },
          },
        },
      });
      const entityDoc = { name: 'Alice' };
      await db.insert('students', entityDoc);
      const entity = await db.fetchOne(db.query('students'));
      expect(entity).not.toBeNull();
      expect(entity.id).toBeDefined();
    });
  });

  it.todo("prevent's updating ID's on entities");
});

describe('delete api', () => {
  it('can delete an entity', async () => {
    const db = new DB();
    await db.insert('posts', { id: 'post-1', author_id: 'user-1' });
    {
      const post = await db.fetchById('posts', 'post-1');
      expect(post).toStrictEqual({
        id: 'post-1',
        author_id: 'user-1',
      });
    }
    await db.delete('posts', 'post-1');
    {
      const post = await db.fetchById('posts', 'post-1');
      expect(post).toBeNull();
    }
  });
  it('in a transaction, delete an entity and then insert the same one', async () => {
    const db = new DB();
    await db.insert('posts', { id: 'post-1', author_id: 'user-1' });
    await db.transact(async (tx) => {
      await tx.delete('posts', 'post-1');
      await tx.insert('posts', { id: 'post-1', author_id: 'user-2' });
    });
    const post = await db.fetchById('posts', 'post-1');
    expect(post).toStrictEqual({
      id: 'post-1',
      author_id: 'user-2',
    });
  });

  it('in a transaction, delete an entity and then update the same one', async () => {
    const db = new DB();
    await db.insert('posts', { id: 'post-1', author_id: 'user-1' });
    await db.transact(async (tx) => {
      await tx.delete('posts', 'post-1');
      await expect(
        tx.update('posts', 'post-1', (entity) => {
          entity.author_id = 'user-2';
        })
      ).rejects.toThrowError(EntityNotFoundError);
    });
  });
  // Feels like a schemaless limitation that we should allow
  it('prevents deletes triples from returning when same Entity ID is reused after deleting', async () => {
    const db = new DB();
    // insert a post, delete it, and then insert a new post with the same id but different attribute
    await db.insert('posts', { id: 'post-1', author_id: 'user-1' });
    await db.delete('posts', 'post-1');
    await db.insert('posts', { id: 'post-1', title: 'user-2' });
    const result = await db.fetchById('posts', 'post-1');
    expect(result).not.toHaveProperty('author_id');
    expect(result).toStrictEqual({ id: 'post-1', title: 'user-2' });
  });
  it('tx: can reinsert, delete an entity and then insert the same one without polluting triples', async () => {
    const db = new DB();
    await db.transact(async (tx) => {
      await db.insert('posts', { id: 'post-1', author_id: 'user-1' });
      await db.delete('posts', 'post-1');
      await db.insert('posts', { id: 'post-1', title: 'user-2' });
      const result = await db.fetchById('posts', 'post-1');
      expect(result).not.toHaveProperty('author_id');
      expect(result).toStrictEqual({ id: 'post-1', title: 'user-2' });
    });
  });
});

// the onWrite hook for a subscription runs on EVERY transaction (even if its not relevant), should test subscritions can handle irrelevant transactions
it('safely handles multiple subscriptions', async () => {
  // Should error out if there is a problem (couldnt quite get an assertion that it errors out to work)
  const db = new DB();
  const query1 = db
    .query('students')
    .Where([['major', '=', 'Computer Science']])
    .Order(['name', 'ASC'])
    .Limit(2);
  const query2 = db
    .query('bands')
    .Where([['genre', '=', 'Rock']])
    .Order(['founded', 'ASC'])
    .Limit(2);
  db.subscribe(query1, () => {});
  db.subscribe(query2, () => {});
  await db.insert('students', { name: 'Alice', major: 'Computer Science' });
  await db.insert('students', { name: 'Bill', major: 'Biology' });
  await db.insert('students', { name: 'Cam', major: 'Computer Science' });

  await db.insert('bands', {
    name: 'The Beatles',
    genre: 'Rock',
    founded: 1960,
  });
  await db.insert('bands', { name: 'NWA', genre: 'Hip Hop', founded: 1986 });
  await db.insert('bands', { name: 'The Who', genre: 'Rock', founded: 1964 });
});

function generateTestScores(numScores: number) {
  const scores = [];
  for (let i = 0; i < numScores; i++) {
    const score = Math.floor(Math.random() * 100) + 1;
    const date = generateRandomDate();
    scores.push({ score, date });
  }
  return scores;
}

function generateRandomDate(): string {
  const start = new Date(2022, 0, 1);
  const end = new Date();
  const randomDate = new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
  return randomDate.toISOString().split('T')[0];
}

let TEST_SCORES = generateTestScores(TUPLE_DB_DEFAULT_PAGE_SIZE * 4);

describe('ORDER & LIMIT & Pagination', () => {
  const db = new DB({
    schema: {
      collections: {
        TestScores: {
          schema: S.Schema({
            id: S.Id(),
            score: S.Number(),
            date: S.String(),
          }),
        },
      },
    },
  });
  beforeEach(async () => {
    await db.clear();
    for (const result of TEST_SCORES) {
      await db.insert('TestScores', result);
    }
  });

  it('order by DESC', async () => {
    const descendingScoresResults = await db.fetch(
      db.query('TestScores').Order('score', 'DESC')
    );
    expect(descendingScoresResults.length).toBe(TEST_SCORES.length);
    const areAllScoresDescending = Array.from(
      descendingScoresResults.values()
    ).every((result, i, arr) => {
      if (i === 0) return true;
      const previousScore = arr[i - 1].score;
      const currentScore = result.score;
      return previousScore >= currentScore;
    });
    expect(areAllScoresDescending).toBeTruthy();
  });

  it('order by ASC', async () => {
    const descendingScoresResults = await db.fetch(
      db.query('TestScores').Order(['score', 'ASC'])
    );
    expect(descendingScoresResults.length).toBe(TEST_SCORES.length);
    const areAllScoresDescending = Array.from(
      descendingScoresResults.values()
    ).every((result, i, arr) => {
      if (i === 0) return true;
      const previousScore = arr[i - 1].score;
      const currentScore = result.score;
      return previousScore <= currentScore;
    });
    expect(areAllScoresDescending).toBeTruthy();
  });

  it('order by deep properties', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.Id(),
              deep: S.Record({
                deeper: S.Record({
                  deepest: S.Record({
                    prop: S.Number(),
                  }),
                }),
                prop: S.Number(),
              }),
            }),
          },
        },
      },
    });
    await db.insert('test', {
      id: '1',
      deep: {
        deeper: {
          deepest: {
            prop: 400,
          },
        },
        prop: 299,
      },
    });
    await db.insert('test', {
      id: '2',
      deep: {
        deeper: {
          deepest: {
            prop: 399,
          },
        },
        prop: 300,
      },
    });
    await db.insert('test', {
      id: '3',
      deep: {
        deeper: {
          deepest: {
            prop: 401,
          },
        },
        prop: 301,
      },
    });

    {
      const resultsASC = await db.fetch(
        db.query('test').Order(['deep.deeper.deepest.prop', 'ASC'])
      );
      const resultsDESC = await db.fetch(
        db.query('test').Order(['deep.deeper.deepest.prop', 'DESC'])
      );
      expect(resultsASC.map((e) => e.id)).toEqual(['2', '1', '3']);
      expect(resultsDESC.map((e) => e.id)).toEqual(['3', '1', '2']);
    }
    {
      const resultsASC = await db.fetch(
        db.query('test').Order(['deep.prop', 'ASC'])
      );
      const resultsDESC = await db.fetch(
        db.query('test').Order(['deep.prop', 'DESC'])
      );
      expect(resultsASC.map((e) => e.id)).toEqual(['1', '2', '3']);
      expect(resultsDESC.map((e) => e.id)).toEqual(['3', '2', '1']);
    }
  });
  it('order by multiple properties', async () => {
    const descendingScoresResults = await db.fetch(
      db.query('TestScores').Order(['score', 'ASC'], ['date', 'DESC'])
    );
    expect(descendingScoresResults.length).toBe(TEST_SCORES.length);
    const areAllScoresDescending = Array.from(
      descendingScoresResults.values()
    ).every((result, i, arr) => {
      if (i === 0) return true;
      const previous = arr[i - 1];
      const current = result;
      const hasCorrectOrder =
        previous.score < current.score ||
        (previous.score === current.score && previous.date >= current.date);
      return hasCorrectOrder;
    });
    expect(areAllScoresDescending).toBeTruthy();
  });

  // Note: builder unit test + test above make this test a little repetitive
  it('order by multiple properties (additive)', async () => {
    const descendingScoresResults = await db.fetch(
      db.query('TestScores').Order(['score', 'ASC']).Order('date', 'DESC')
    );
    expect(descendingScoresResults.length).toBe(TEST_SCORES.length);
    const areAllScoresDescending = Array.from(
      descendingScoresResults.values()
    ).every((result, i, arr) => {
      if (i === 0) return true;
      const previous = arr[i - 1];
      const current = result;
      const hasCorrectOrder =
        previous.score < current.score ||
        (previous.score === current.score && previous.date >= current.date);
      return hasCorrectOrder;
    });
    expect(areAllScoresDescending).toBeTruthy();
  });

  it('properly orders after update', async () => {
    const initialOrdered = await db.fetch(
      db.query('TestScores').Order('score', 'ASC')
    );
    expect(initialOrdered.length).toBe(TEST_SCORES.length);
    const areAllScoresDescending = Array.from(initialOrdered.values()).every(
      (result, i, arr) => {
        if (i === 0) return true;
        const previousScore = arr[i - 1].score;
        const currentScore = result.score;
        return previousScore <= currentScore;
      }
    );
    expect(areAllScoresDescending).toBeTruthy();

    // Move first item to the end
    await db.update('TestScores', initialOrdered[0].id, async (entity) => {
      entity.score = [...initialOrdered.values()][0].score + 1;
    });

    after: {
      const ascendingResults = await db.fetch(
        db.query('TestScores').Order(['score', 'ASC'])
      );
      expect(ascendingResults.length).toBe(TEST_SCORES.length);
      const areAllScoresDescending = Array.from(
        ascendingResults.values()
      ).every((result, i, arr) => {
        if (i === 0) return true;
        const previousScore = arr[i - 1].score;
        const currentScore = result.score;
        return previousScore <= currentScore;
      });
      expect(areAllScoresDescending).toBeTruthy();
    }
  });

  it('limit', async () => {
    const descendingScoresResults = await db.fetch(
      db.query('TestScores').Order('score', 'DESC').Limit(5)
    );
    expect(descendingScoresResults.length).toBe(5);
    const areAllScoresDescending = Array.from(
      descendingScoresResults.values()
    ).every((result, i, arr) => {
      if (i === 0) return true;
      const previousScore = arr[i - 1].score;
      const currentScore = result.score;
      return previousScore >= currentScore;
    });
    expect(areAllScoresDescending).toBeTruthy();
  });

  it('can paginate DESC', async () => {
    const PAGE_SIZE = Math.round(TUPLE_DB_DEFAULT_PAGE_SIZE * 1.5);
    const firstPageResults = await db.fetch(
      db.query('TestScores').Order('score', 'DESC').Limit(PAGE_SIZE)
    );
    const sortedScoresDesc = TEST_SCORES.map((r) => r.score).sort(
      (a, b) => b - a
    );
    expect([...firstPageResults.values()].map((r) => r.score)).toEqual(
      sortedScoresDesc.slice(0, PAGE_SIZE)
    );

    const lastDoc = firstPageResults.at(-1);

    const secondPageResults = await db.fetch(
      db
        .query('TestScores')
        .Order(['score', 'DESC'], ['id', 'ASC'])
        .Limit(PAGE_SIZE)
        .After([lastDoc.score, lastDoc?.id])
    );

    expect([...secondPageResults.values()].map((r) => r.score)).toEqual(
      sortedScoresDesc.slice(PAGE_SIZE, PAGE_SIZE * 2)
    );
  });

  it('can paginate ASC', async () => {
    const PAGE_SIZE = Math.round(TUPLE_DB_DEFAULT_PAGE_SIZE * 1.5);
    const firstPageResults = await db.fetch(
      db.query('TestScores').Order('score', 'ASC').Limit(PAGE_SIZE)
    );
    const sortedScoresAsc = TEST_SCORES.map((r) => r.score).sort(
      (a, b) => a - b
    );
    expect([...firstPageResults.values()].map((r) => r.score)).toEqual(
      sortedScoresAsc.slice(0, PAGE_SIZE)
    );

    const lastDoc = firstPageResults.at(-1);

    const secondPageResults = await db.fetch(
      db
        .query('TestScores')
        .Order(['score', 'ASC'], ['id', 'ASC'])
        .Limit(PAGE_SIZE)
        .After([lastDoc.score, lastDoc?.id])
    );
    expect([...secondPageResults.values()].map((r) => r.score)).toEqual(
      sortedScoresAsc.slice(PAGE_SIZE, PAGE_SIZE * 2)
    );
  });

  it('can paginate multiple properties', async () => {
    const PAGE_SIZE = Math.round(TUPLE_DB_DEFAULT_PAGE_SIZE * 1.5);
    const firstPageResults = await db.fetch(
      db
        .query('TestScores')
        .Order(['score', 'ASC'], ['date', 'DESC'], ['id', 'ASC'])
        .Limit(PAGE_SIZE)
    );
    const sortedScoresAsc = TEST_SCORES.map((r) => [r.score, r.date]).sort(
      (a, b) => {
        if (a[0] === b[0]) {
          return b[1].localeCompare(a[1]);
        }
        return a[0] - b[0];
      }
    );
    expect(
      [...firstPageResults.values()].map((r) => [r.score, r.date])
    ).toEqual(sortedScoresAsc.slice(0, PAGE_SIZE));

    const lastDoc = firstPageResults.at(-1);

    const secondPageResults = await db.fetch(
      db
        .query('TestScores')
        .Order(['score', 'ASC'], ['date', 'DESC'], ['id', 'ASC'])
        .Limit(PAGE_SIZE)
        .After([lastDoc.score, lastDoc?.date, lastDoc?.id])
    );
    expect(
      [...secondPageResults.values()].map((r) => [r.score, r.date])
    ).toEqual(sortedScoresAsc.slice(PAGE_SIZE, PAGE_SIZE * 2));
  });

  it('can paginate a nested property', async () => {
    const db = new DB({
      schema: {
        collections: {
          test: {
            schema: S.Schema({
              id: S.String(),
              nested: S.Record({
                a: S.Number(),
                b: S.Number(),
              }),
            }),
          },
        },
      },
    });
    await db.insert('test', { id: '5', nested: { a: 1, b: 1 } });
    await db.insert('test', { id: '9', nested: { a: 1, b: 2 } });
    await db.insert('test', { id: '2', nested: { a: 1, b: 3 } });
    await db.insert('test', { id: '7', nested: { a: 2, b: 1 } });
    await db.insert('test', { id: '1', nested: { a: 2, b: 2 } });
    await db.insert('test', { id: '3', nested: { a: 2, b: 3 } });
    await db.insert('test', { id: '4', nested: { a: 3, b: 1 } });
    await db.insert('test', { id: '8', nested: { a: 3, b: 2 } });
    await db.insert('test', { id: '6', nested: { a: 3, b: 3 } });

    const PAGE_SIZE = 2;
    {
      const firstPageResults = await db.fetch(
        db
          .query('test')
          .Order(['nested.a', 'ASC'], ['nested.b', 'ASC'], ['id', 'ASC'])
          .Limit(PAGE_SIZE)
      );
      expect(firstPageResults.map((r) => r.id)).toEqual(['5', '9']);
      const lastDoc = firstPageResults.at(-1);
      const secondPageResults = await db.fetch(
        db
          .query('test')
          .Order(['nested.a', 'ASC'], ['nested.b', 'ASC'], ['id', 'ASC'])
          .Limit(PAGE_SIZE)
          .After([lastDoc.nested.a, lastDoc.nested.b, lastDoc.id])
      );
      expect(secondPageResults.map((r) => r.id)).toEqual(['2', '7']);
    }

    {
      const firstPageResults = await db.fetch(
        db
          .query('test')
          .Order(['nested.a', 'DESC'], ['nested.b', 'ASC'], ['id', 'ASC'])
          .Limit(PAGE_SIZE)
      );
      expect(firstPageResults.map((r) => r.id)).toEqual(['4', '8']);
      const lastDoc = firstPageResults.at(-1);
      const secondPageResults = await db.fetch(
        db
          .query('test')
          .Order(['nested.a', 'DESC'], ['nested.b', 'ASC'], ['id', 'ASC'])
          .Limit(PAGE_SIZE)
          .After([lastDoc.nested.a, lastDoc.nested.b, lastDoc.id])
      );
      expect(secondPageResults.map((r) => r.id)).toEqual(['6', '7']);
    }
  });

  it('can pull in more results to satisfy limit in subscription when current result no longer satisfies FILTER', async () => {
    const LIMIT = 5;

    await testSubscription(
      db,
      db
        .query('TestScores')
        .Where([['score', '>', 10]])
        .Order(['score', 'DESC'], ['date', 'DESC'])
        .Limit(LIMIT),
      [
        {
          check: (results) => {
            expect(results).toHaveLength(LIMIT);
          },
        },
        {
          action: async (results) => {
            const idFromResults = results[0].id;
            await db.transact(async (tx) => {
              await tx.update('TestScores', idFromResults, async (entity) => {
                entity.score = 0;
              });
            });
          },
          check: (results) => {
            expect(results.length).toBe(LIMIT);
            expect(
              [...results.values()].map((result) => result.score).includes(0)
            ).toBeFalsy();
          },
        },
        {
          action: async (results) => {
            const firstResult = results[0];
            await db.transact(async (tx) => {
              await tx.update('TestScores', firstResult.id, async (entity) => {
                entity.score = firstResult.score + 1;
              });
            });
          },
          check: (results) => {
            expect(results).toHaveLength(LIMIT);
            expect(
              [...results.values()].every((result, i, resultValues) => {
                if (i === 0) return true;
                const previous = resultValues[i - 1];
                const current = result;
                const hasCorrectOrder =
                  previous.score > current.score ||
                  (previous.score === current.score &&
                    previous.date >= current.date);
                return hasCorrectOrder;
              })
            ).toBeTruthy();
          },
        },
      ]
    );
  });

  it('can pull in more results to satisfy limit in subscription when current result no longer satisfies ORDER', async () => {
    const LIMIT = 5;

    await testSubscription(
      db,
      db
        .query('TestScores')
        .Order(['score', 'DESC'], ['date', 'DESC'])
        .Limit(LIMIT),
      [
        {
          check: (results) => {
            expect(results.length).toBe(LIMIT);
          },
        },
        {
          action: async (results) => {
            const idFromResults = results[0].id;
            await db.transact(async (tx) => {
              await tx.update('TestScores', idFromResults, async (entity) => {
                entity.score = 0;
              });
            });
          },
          check: (results) => {
            expect(results.length).toBe(LIMIT);
            expect(
              [...results.values()].map((result) => result.score).includes(0)
            ).toBeFalsy();
          },
        },
      ]
    );
  });

  it('limit ignores deleted entities', async () => {
    const db = new DB();
    await db.insert('test', { id: '1', name: 'alice' });
    await db.insert('test', { id: '4', name: 'david' });
    await db.insert('test', { id: '3', name: 'charlie' });
    await db.insert('test', { id: '5', name: 'eve' });
    await db.insert('test', { id: '2', name: 'bob' });

    await db.delete('test', '3');

    const query = db.query('test').Order(['name', 'ASC']).Limit(3);
    const result = await db.fetch(query);
    expect(result.length).toBe(3);
    expect(result.map((e) => e.id)).toEqual(['1', '2', '4']);
  });

  it('can handle secondary sorts on values with runs of equal primary values', async () => {
    const db = new DB();
    for (let i = 0; i < 20; i++) {
      await db.insert(
        'cars',
        {
          year: 2000 + i,
          make: 'Volvo',
        },
        i.toString()
      );
    }

    const results = await db.fetch(
      db.query('cars').Order(['make', 'ASC'], ['year', 'DESC']).Limit(5)
    );

    expect(results).toHaveLength(5);
    expect([...results.values()].map((r) => r.year)).toEqual([
      2019, 2018, 2017, 2016, 2015,
    ]);
  });
});

describe.each(['ASC', 'DESC'])('pagination stress test: %s', (sortOrder) => {
  const schema = {
    collections: {
      students: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
          graduated: S.Boolean(),
          expected_graduation_date: S.Date(),
        }),
      },
    },
  };

  // TODO: add "stress"
  const PAGE_SIZE = 2;
  const entities = [
    {
      id: '5',
      name: 'Bob',
      graduated: false,
      expected_graduation_date: new Date('2023-04-16'),
    },
    {
      id: '3',
      name: 'Alice',
      graduated: false,
      expected_graduation_date: new Date('2022-01-02'),
    },
    {
      id: '2',
      name: 'David',
      graduated: false,
      expected_graduation_date: new Date('2021-05-02'),
    },
    {
      id: '1',
      name: 'Charlie',
      graduated: true,
      expected_graduation_date: new Date('2021-05-10'),
    },
    {
      id: '4',
      name: 'Emily',
      graduated: true,
      expected_graduation_date: new Date('2026-05-02'),
    },
  ];
  it.each(
    Object.keys(schema.collections.students.schema.properties).map((prop) => ({
      prop,
      type: schema.collections.students.schema.properties[prop].type,
    }))
  )('can sort and paginate by $prop ($type)', async ({ prop }) => {
    const db = new DB({
      schema,
    });
    await Promise.all(entities.map((doc) => db.insert('students', doc)));
    const correctOrder = entities
      .sort((a, b) => {
        if (a[prop] < b[prop]) return sortOrder === 'ASC' ? -1 : 1;
        if (a[prop] > b[prop]) return sortOrder === 'ASC' ? 1 : -1;
        return 0;
      })
      .map((e) => e[prop]);
    const correctPages = [];
    for (let i = 0; i < correctOrder.length; i += PAGE_SIZE) {
      correctPages.push(correctOrder.slice(i, i + PAGE_SIZE));
    }
    let lastEntity: (typeof entities)[number] | undefined = undefined;
    for (let i = 0; i < correctPages.length; i++) {
      const results = await db.fetch(
        db
          .query('students')
          .Order([
            [prop, sortOrder],
            ['id', 'ASC'],
          ])
          .Limit(PAGE_SIZE)
          .After(lastEntity)
      );
      lastEntity = Array.from(
        results.values()
      ).pop() as (typeof entities)[number];

      expect(Array.from(results.values()).map((e) => e[prop])).toEqual(
        correctPages[i]
      );
    }
  });
});

describe('Data deletion', () => {
  it('clear() removes all data from the database', async () => {
    // Schema provides us with metadata to delete
    const schema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
          }),
        },
      },
    };
    const storage = new BTreeKVStore();
    const db = new DB({ kv: storage, schema: schema });
    await db.insert('students', { id: '1', name: 'Alice' });

    {
      const kvData = await Array.fromAsync(storage.scan({ prefix: [] }));
      expect(kvData.length).toBeGreaterThan(0);
    }
    await db.clear({ full: true });
    {
      const kvData = await Array.fromAsync(storage.scan({ prefix: [] }));
      expect(kvData.length).toBe(0);
    }
  });
});

// When updating tests, please keep the deep nesting in the test data

it.skip('throws an error if a register filter is malformed', async () => {
  const db = new DB({
    schema: {
      collections: {
        Classes: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            students: S.Set(S.String(), { default: S.Default.Set.empty() }),
          }),
        },
      },
    },
  });
  const query = db.query('Classes').Where([['students', '=', 'student-1']]);
  await db.insert('Classes', {
    name: 'Class 1',
    students: new Set(['student-1', 'student-2']),
  });
  await expect(db.fetch(query)).resolves.not.toThrowError();
  // Delete schema to allow malformed filter
  await db.tripleStore.deleteTriples(
    await db.tripleStore.findByEAT([
      appendCollectionToId('_metadata', '_schema'),
    ])
  );
  await expect(db.fetch(query)).rejects.toThrowError(InvalidFilterError);
});

describe('default values in a schema', () => {
  const schema = {
    collections: {
      Todos: {
        schema: S.Schema({
          id: S.String(),
          text: S.String(),
          created_at: S.Date(),
          completed: S.Boolean({ default: false }),
        }),
      },
    },
  };
  it('can create a database with a schema with default values', async () => {
    expect(
      () =>
        new DB({
          schema,
        })
    ).not.toThrowError();
  });
  it('can insert an entity with default values', async () => {
    await testDBAndTransaction(
      () =>
        new DB({
          schema,
        }),
      async (db) => {
        await db.insert('Todos', {
          id: 'todo-1',
          text: 'Do something',
          created_at: new Date(),
        });
        const result = await db.fetchById('Todos', 'todo-1');
        expect(result).toHaveProperty('completed');
        expect(result.completed).toBe(false);
      }
    );
  });
  it('can use function aliases in schemas as default values', async () => {
    await testDBAndTransaction(
      () =>
        new DB({
          schema: {
            collections: {
              Todos: {
                schema: S.Schema({
                  id: S.Id(),
                  todoId: S.String({
                    default: S.Default.now(),
                  }),
                  text: S.String(),
                  created_at: S.Date({
                    default: S.Default.now(),
                  }),
                }),
              },
            },
          },
        }),
      async (db) => {
        await db.insert('Todos', {
          id: 'todo-1',
          text: 'Do something',
        });
        const result = await db.fetchById('Todos', 'todo-1');
        expect(result).toHaveProperty('todoId');
        expect(result.todoId).toBeTypeOf('string');
        expect(result).toHaveProperty('created_at');
        expect(result.created_at instanceof Date).toBeTruthy();
      }
    );
  });
  //TODO: also should add the error type
  it.todo(
    'should reject schemas that pass invalid default values',
    async () => {
      expect(() =>
        S.Schema({ id: S.Id(), foo: S.String({ default: {} }) })
      ).toThrowError();
      expect(() =>
        S.Schema({ id: S.Id(), foo: S.String({ default: ['array'] }) })
      ).toThrowError();
    }
  );
});

describe('subscription errors', () => {
  it.todo('passes query errors to the callback', async () => {});
  it('handles errors in callback', () => {
    const db = new DB({
      schema: {
        collections: {
          Classes: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              students: S.Set(S.String(), { default: S.Default.Set.empty() }),
            }),
          },
        },
      },
    });
    const query = db.query('Classes');
    db.subscribe(
      query,
      (data) => {
        throw new Error('Test Error');
      },
      (error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Test Error');
      }
    );
  });
});

describe.skip('DB variable index cache view thing', () => {
  it('maintains consistency across inserts', async () => {
    const db = new DB({});
    const query = db
      .query('cars')
      .Where(['make', '=', 'Ford'], ['year', '>', '$year'])
      .Vars({ year: 2010 });

    let results;

    results = await db.fetch(query);
    expect(results).toHaveLength(0);

    await db.insert('cars', { make: 'Ford', year: 2011 });
    results = await db.fetch(query);
    expect(results).toHaveLength(1);

    await db.insert('cars', { make: 'Ford', year: 2009 });
    results = await db.fetch(query);
    expect(results).toHaveLength(1);

    await db.insert('cars', { make: 'Ford', year: 2010 });
    results = await db.fetch(query);
    expect(results).toHaveLength(1);

    await db.insert('cars', { make: 'Ford', year: 2020 });
    results = await db.fetch(query);
    expect(results).toHaveLength(2);
  });
});

describe('db.clear()', () => {
  it('full clear deletes all data and metadata and resets state', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
          }),
        },
      },
    };
    const db = await createDB({ schema });
    await db.insert('test', { id: '1', name: 'alice' });
    await db.insert('test', { id: '2', name: 'bob' });

    const originalMetadata = await db.fetch({ collectionName: '_metadata' });

    // State is defined
    {
      const result = await db.fetch({ collectionName: 'test' });
      expect(result.length).toBe(2);

      const schema = await db.getSchema();
      expect(schema).not.toEqual(undefined);
    }

    await db.clear({ full: true });

    {
      const result = await db.fetch({ collectionName: 'test' });
      expect(result.length).toBe(0);

      const schema = await db.getSchema();
      expect(schema).toEqual(undefined);

      const metadata = await db.fetch({ collectionName: '_metadata' });

      expect(metadata).not.toEqual(originalMetadata);
    }
  });
  it('partial clear deletes all data, but retains metadata and state', async () => {
    const schema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
          }),
        },
      },
    };
    const db = await createDB({ schema });
    await db.insert('test', { id: '1', name: 'alice' });
    await db.insert('test', { id: '2', name: 'bob' });

    const originalMetadata = await db.fetch({ collectionName: '_metadata' });

    // State is defined
    {
      const result = await db.fetch({ collectionName: 'test' });
      expect(result.length).toBe(2);

      const schema = await db.getSchema();
      expect(schema).not.toEqual(undefined);
    }

    await db.clear();

    {
      const result = await db.fetch({ collectionName: 'test' });
      expect(result.length).toBe(0);

      const schema = await db.getSchema();
      expect(schema).not.toEqual(undefined);

      const metadataTuples = await db.fetch({ collectionName: '_metadata' });
      expect(metadataTuples).toEqual(originalMetadata);
    }
  });
});

it('can upsert data with optional properties', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.String(),
          name: S.Optional(S.String()),
          age: S.Optional(S.Number()),
        }),
      },
    },
  };
  const db = new DB({ schema });

  await db.insert('test', { id: '1', name: 'alice' });
  await db.insert('test', { id: '1', age: 30 });

  const result = await db.fetchById('test', '1');
  expect(result).toStrictEqual({ id: '1', name: 'alice', age: 30 });
});
