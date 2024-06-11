import { InMemoryTupleStorage } from '@triplit/tuple-database';
import { describe, expect, it, beforeEach, beforeAll, vi } from 'vitest';
import {
  and,
  Migration,
  DB,
  or,
  Schema as S,
  CollectionQueryBuilder,
  queryResultToJson,
  WriteRuleError,
  InvalidFilterError,
  DBTransaction,
  schemaToJSON,
  DBSerializationError,
  InvalidInternalEntityIdError,
  InvalidEntityIdError,
  EntityNotFoundError,
  InvalidMigrationOperationError,
  InvalidOperationError,
  InvalidCollectionNameError,
  InvalidInsertDocumentError,
  CollectionNotFoundError,
  InvalidSchemaPathError,
  SessionVariableNotFoundError,
  InvalidOrderClauseError,
  InvalidWhereClauseError,
  CollectionQuery,
} from '../src';
import { hashSchemaJSON } from '../src/schema/schema.js';
import { Models } from '../src/schema/types';
import { classes, students, departments } from './sample_data/school.js';
import { MemoryBTreeStorage as MemoryStorage } from '../src/storage/memory-btree.js';
import { testSubscription } from './utils/test-subscription.js';
import {
  appendCollectionToId,
  prepareQuery,
  stripCollectionFromId,
} from '../src/db-helpers.js';
import { TripleRow } from '../dist/types/triple-store-utils.js';
import { triplesToStateVector } from '../src/triple-store-utils.js';
import {
  fetchDeltaTriples,
  initialFetchExecutionContext,
} from '../src/collection-query.js';
import { CollectionQueryInclusion } from '../src/query/builder.js';

const pause = async (ms: number = 100) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// const storage = new InMemoryTupleStorage();
const storage = new MemoryStorage();

export async function testDBAndTransaction<
  M extends Models<any, any> | undefined
>(
  // should return a new instance if you are performing writes in your test
  dbFactory: () => DB<M> | Promise<DB<M>>,
  test: (db: DB<M> | DBTransaction<M>) => void | Promise<void>,
  scope: { db: boolean; tx: boolean } = { db: true, tx: true }
) {
  if (scope.db) await test(await dbFactory());
  if (scope.tx)
    await (
      await dbFactory()
    ).transact(async (tx) => {
      await test(tx);
    });
}

describe('Database API', () => {
  let db: DB<any>;
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
    expect(await db.getClientId()).toBeTruthy();
  });

  it('will throw an error if the provided entity id has a # sign in it', async () => {
    expect(
      async () =>
        await db.insert('Student', { name: 'John Doe', id: 'John#Doe' })
    ).rejects.toThrowError(InvalidEntityIdError);
    expect(
      db.transact((tx) =>
        tx.insert('Student', { name: 'John Doe', id: 'John#Doe' })
      )
    ).rejects.toThrowError(InvalidEntityIdError);
  });

  it('wont allow multiple transactions to have same transaction id', async () => {
    const db = new DB();
    const numTransactions = 10;
    const txPromises = Array.from(
      { length: numTransactions },
      async (_, index) => {
        const tx = db.transact(async (tx) => {
          await pause(100 * Math.random());
          await tx.insert('Student', { name: 'John Doe', id: `${index + 1}` });
        });
        return tx;
      }
    );
    const txResults = await Promise.all(txPromises);
    const txIds = txResults.map(({ txId }) => txId);
    expect(new Set(txIds).size).toBe(numTransactions);
  });

  it('will throw an error when it parses an ID with a # in it', async () => {
    expect(() => stripCollectionFromId('Student#john#1')).toThrowError(
      InvalidInternalEntityIdError
    );
  });

  it('can lookup entity by Id', async () => {
    const student1 = await db.fetchById('Student', students[0].id);
    expect(student1).not.toBeNull();

    const notAStudent = await db.fetchById('Student', `not_a_real_id`);
    expect(notAStudent).toBeNull();
  });

  it('supports basic queries with filters', async () => {
    const eq = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', '=', 100]])
        .build()
    );
    expect(eq.size).toBe(classes.filter((cls) => cls.level === 100).length);
    const neq = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', '!=', 100]])
        .build()
    );
    expect(neq.size).toBe(classes.filter((cls) => cls.level !== 100).length);
    const gt = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', '>', 100]])
        .build()
    );
    expect(gt.size).toBe(classes.filter((cls) => cls.level > 100).length);
    const gte = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', '>=', 100]])
        .build()
    );
    expect(gte.size).toBe(classes.filter((cls) => cls.level >= 100).length);
    const lt = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', '<', 200]])
        .build()
    );
    expect(lt.size).toBe(classes.filter((cls) => cls.level < 200).length);
    const lte = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', '<=', 200]])
        .build()
    );
    expect(lte.size).toBe(classes.filter((cls) => cls.level <= 200).length);
    const _in = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', 'in', [100, 200]]])
        .build()
    );
    expect(_in.size).toBe(4);
    const nin = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['level', 'nin', [100, 200]]])
        .build()
    );
    expect(nin.size).toBe(1);
  });
  it('treats "in" operations on sets as a defacto "intersects"', async () => {
    const newDb = new DB({
      schema: {
        collections: {
          test: { schema: S.Schema({ id: S.Id(), set: S.Set(S.String()) }) },
        },
      },
    });
    await newDb.insert('test', { id: '1', set: new Set(['a', 'b', 'c']) });
    await newDb.insert('test', { id: '2', set: new Set(['a']) });
    await newDb.insert('test', { id: '3', set: new Set(['d', 'e']) });
    let results = await newDb.fetch(
      CollectionQueryBuilder('test')
        .where([['set', 'in', ['a', 'd']]])
        .build()
    );
    expect(results.size).toBe(3);
    results = await newDb.fetch(
      CollectionQueryBuilder('test')
        .where([['set', 'in', ['d']]])
        .build()
    );
    expect(results.size).toBe(1);
    results = await newDb.fetch(
      CollectionQueryBuilder('test')
        .where([['set', 'in', ['a', 'b']]])
        .build()
    );
    expect(results.size).toBe(2);
  });

  it('supports basic queries with the "like" operator', async () => {
    const studentsNamedJohn = await db.fetch(
      CollectionQueryBuilder('Student').where(['name', 'like', 'John%']).build()
    );
    expect(studentsNamedJohn.size).toBe(
      students.filter((s) => s.name.startsWith('John')).length
    );

    const studentswithIeIntheirName = await db.fetch(
      CollectionQueryBuilder('Student')
        .where([['name', 'like', '%ie%']])
        .build()
    );
    expect(studentswithIeIntheirName.size).toBe(
      students.filter((s) => s.name.includes('ie')).length
    );

    const calculusClasses = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['name', 'like', 'Calculus _']])
        .build()
    );
    expect(calculusClasses.size).toBe(
      classes.filter((c) => new RegExp('Calculus *').test(c.name)).length
    );

    const escapeOutRegex = await db.fetch(
      CollectionQueryBuilder('Class')
        .where([['name', 'like', 'Calculus*+']])
        .build()
    );
    expect(escapeOutRegex.size).not.toBe(
      classes.filter((c) => new RegExp('Calculus *').test(c.name)).length
    );
    const departmentsWithSinTheMiddleOfTheirName = await db.fetch(
      CollectionQueryBuilder('Department')
        .where([['name', 'like', '%_s_%']])
        .build()
    );
    expect(departmentsWithSinTheMiddleOfTheirName.size).toBe(2);
    const artistsWithDashInTheirName = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['name', 'like', '%-%']])
        .build()
    );
    expect(artistsWithDashInTheirName.size).toBe(2);
    const artistsWithDollaSignInTheirName = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['name', 'like', '%$%']])
        .build()
    );
    expect(artistsWithDollaSignInTheirName.size).toBe(1);

    const artistsWithQuotesInTheirName = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['name', 'like', "%'%'%"]])
        .build()
    );
    expect(artistsWithQuotesInTheirName.size).toBe(2);

    const Biggie = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['name', 'like', '%B.I.G%.']])
        .build()
    );
    expect(Biggie.size).toBe(1);
  });

  it('support basic queries with the "nlike" operator', async () => {
    const Biggie = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['name', 'nlike', '%B.I.G%.']])
        .build()
    );
    expect(Biggie.size).toBe(RAPPERS_AND_PRODUCERS.length - 1);
    const artistsWithoutQuotesInTheirName = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['name', 'nlike', "%'%'%"]])
        .build()
    );
    expect(artistsWithoutQuotesInTheirName.size).toBe(
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

  it('supports basic queries with the has and !has operators', async () => {
    const db = new DB({
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
    const results = await db.fetch(
      CollectionQueryBuilder('Classes')
        .where([['enrolled_students', 'has', 'student-1']])
        .build()
    );
    expect([...results.keys()]).toStrictEqual(['class-2', 'class-3']);
    const results2 = await db.fetch(
      CollectionQueryBuilder('Classes')
        .where([['enrolled_students', 'has', 'bad-id']])
        .build()
    );
    expect(results2.size).toBe(0);
    const results3 = await db.fetch(
      CollectionQueryBuilder('Classes')
        .where([['enrolled_students', '!has', 'student-1']])
        .build()
    );
    expect([...results3.keys()]).toStrictEqual([
      'class-1',
      'class-4',
      'class-5',
    ]);
    const results4 = await db.fetch(
      CollectionQueryBuilder('Classes')
        .where([['enrolled_students', '!has', 'bad-id']])
        .build()
    );
    expect(results4.size).toBe(5);
  });

  it('supports basic queries without filters', async () => {
    const results = await db.fetch(CollectionQueryBuilder('Student').build());
    expect(results.size).toBe(students.length);
  });

  it('throws an error when filtering with an unimplmented operator', async () => {
    await expect(
      db.fetch(
        CollectionQueryBuilder('Rapper')
          .where([['name', 'not a real operator', 'Boi-1da']])
          .build()
      )
    ).rejects.toThrowError(InvalidFilterError);
  });

  it('supports filtering on one attribute with multiple operators (and() helper)', async () => {
    const results = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([
          and([
            ['rank', '<', 5],
            ['rank', '>=', 2],
          ]),
        ])
        .build()
    );
    const ranks = [...results.values()].map((r) => r.rank);
    expect(Math.max(...ranks)).toBe(4);
    expect(Math.min(...ranks)).toBe(2);
    expect(results.size).toBe(3);
  });

  it('supports filtering on one attribute with multiple operators (additive)', async () => {
    const results = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([['rank', '<', 5]])
        .where('rank', '>=', 2)
        .where()
        .build()
    );
    const ranks = [...results.values()].map((r) => r.rank);
    expect(Math.max(...ranks)).toBe(4);
    expect(Math.min(...ranks)).toBe(2);
    expect(results.size).toBe(3);
  });

  it('where clause by non leaf will throw error', async () => {
    const db = new DB({
      schema: {
        collections: {
          students: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              address: S.Record({ street: S.String(), city: S.String() }),
              dorm_id: S.String(),
              dorm: S.RelationById('dorms', '$1.dorm_id'),
            }),
          },
          dorms: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
            }),
          },
        },
      },
    });
    // Access record
    {
      const query = db.query('students').where('address', '=', 'foo').build();
      await expect(db.fetch(query)).rejects.toThrow(InvalidWhereClauseError);
    }

    // Access relation
    {
      const query = db.query('students').where('dorm', '=', 'foo').build();
      await expect(db.fetch(query)).rejects.toThrow(InvalidWhereClauseError);
    }

    // inside modified clause
    {
      const query = db
        .query('students')
        .where(
          or([
            ['name', '=', 'foo'],
            ['dorm', '=', 'foo'],
          ])
        )
        .build();
      await expect(db.fetch(query)).rejects.toThrow(InvalidWhereClauseError);
    }
  });

  it.todo('supports compound queries', async () => {
    const twoHundredLevelClasses = db
      .collection('Class')
      .query()
      .where([['level', '=', 200]])
      .fetch();
    const twoHundredMathClasses = twoHundredLevelClasses
      .query({
        where: [['department>Department.name', '=', 'math']],
      })
      .fetch();
    expect(twoHundredLevelClasses.query()).toHaveLength(2);
    expect(twoHundredMathClasses).toHaveLength(1);
  });

  it('supports basic select statements', async () => {
    const results = await db.fetch(
      CollectionQueryBuilder('Class').select(['name', 'level']).build()
    );
    [...results.values()].forEach((entityObj) => {
      expect(entityObj).toHaveProperty('name');
      expect(entityObj).toHaveProperty('level');
      expect(entityObj).not.toHaveProperty('department');
      expect(entityObj).not.toHaveProperty('enrolled_students');
    });
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
  it('can convert query results to JSON', async () => {
    const results = await db.fetch(
      CollectionQueryBuilder('Class').select(['name', 'level']).build()
    );
    const json = queryResultToJson(results);
    expect(json).toBeTypeOf('object');
  });

  it('transactions return the txId and result of the callback', async () => {
    const db = new DB();
    {
      const result = await db.transact(async (tx) => {
        await tx.insert('Student', { name: 'John Doe', id: '1' });
        return 'hello';
      });
      expect(result.txId).toBeTruthy();
      expect(result.output).toBe('hello');
    }
    {
      const result = await db.transact(async (tx) => {
        await tx.insert('Student', { name: 'Jane Doe', id: '2' });
      });
      expect(result.txId).toBeTruthy();
      expect(result.output).toBe(undefined);
    }
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

  it('checks the schema has proper fields on an insert', async () => {
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
    // TODO: use more specific error, validation function should probably return a string or list of errors as context messages so we can give context to why the failure occurred
    // no missing fields
    await expect(
      db.insert('test', {
        id: '1',
      })
    ).rejects.toThrowError(DBSerializationError);

    // no extra fields
    await expect(
      db.insert('test', {
        id: '1',
        name: 'John Doe',
        age: 22,
        extraField: 'extra',
      })
    ).rejects.toThrowError(DBSerializationError);

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
          'invalid value for age (Expected a number value, but got string instead.)'
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
              set: S.Set(S.String()),
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
      console.log(entity);
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
      const johnQuery = CollectionQueryBuilder('Student')
        .where([['name', 'like', 'John%']])
        .build();
      const ettaQuery = CollectionQueryBuilder('Student')
        .where([['name', 'like', '%Etta%']])
        .build();
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
  let db;
  beforeEach(async () => {
    db = new DB({ source: new InMemoryTupleStorage() });
    await db.insert('employees', { id: 1, name: 'Philip J. Fry' });
    await db.insert('employees', { id: 2, name: 'Turanga Leela' });
    await db.insert('employees', { id: 3, name: 'Amy Wong' });
    await db.insert(
      'employees',
      { id: 4, name: 'Bender Bending Rodriguez' },
      4
    );
    await db.insert('employees', { id: 5, name: 'Hermes Conrad' }, 5);
  });

  it('can set register', async () => {
    const preUpdateQuery = CollectionQueryBuilder('employees')
      .select(['id'])
      .where([['name', '=', 'Philip J. Fry']])
      .build();

    const preUpdateLookup = await db.fetch(preUpdateQuery);
    expect(preUpdateLookup).toHaveLength(1);
    expect(preUpdateLookup.get('1')).toBeTruthy();

    const NEW_NAME = 'Dr. Zoidberg';

    await db.update('employees', '1', async (entity) => {
      entity.name = NEW_NAME;
      expect(entity.name).toBe(NEW_NAME);
    });

    const postUpdateQuery = CollectionQueryBuilder('employees')
      .select(['id', 'name'])
      .where([['name', '=', NEW_NAME]])
      .build();

    const oldQueryResult = await db.fetch(preUpdateQuery);
    const newQueryResult = await db.fetch(postUpdateQuery);
    expect(oldQueryResult).toHaveLength(0);
    expect(newQueryResult).toHaveLength(1);
    expect(newQueryResult.get('1')).toBeTruthy();
    expect(newQueryResult.get('1').name).toBe(NEW_NAME);
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
      const result = await db.fetchOne(db.query('students').build());
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
      const entity = await db.fetchOne(db.query('students').build());
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
      await tx.insert('posts', { id: 'post-1', author_id: 'user-1' });
    });
    const post = await db.fetchById('posts', 'post-1');
    expect(post).toStrictEqual({
      id: 'post-1',
      author_id: 'user-1',
    });
  });

  it('in a transaction, delete an entity and then update the same one', async () => {
    const db = new DB();
    await db.insert('posts', { id: 'post-1', author_id: 'user-1' });
    await db.transact(async (tx) => {
      await tx.delete('posts', 'post-1');
      expect(
        tx.update('posts', 'post-1', (entity) => {
          entity.author_id = 'user-2';
        })
      ).rejects.toThrowError(EntityNotFoundError);
    });
  });
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
  const db = new DB({ source: new InMemoryTupleStorage() });
  const query1 = db
    .query('students')
    .where([['major', '=', 'Computer Science']])
    .order(['name', 'ASC'])
    .limit(2)
    .build();
  const query2 = db
    .query('bands')
    .where([['genre', '=', 'Rock']])
    .order(['founded', 'ASC'])
    .limit(2)
    .build();
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

const TEST_SCORES = [
  {
    score: 80,
    date: '2023-04-16',
  },
  {
    score: 76,
    date: '2023-03-06',
  },
  {
    score: 95,
    date: '2023-04-20',
  },
  {
    score: 87,
    date: '2023-04-21',
  },
  {
    score: 75,
    date: '2023-04-09',
  },
  {
    score: 70,
    date: '2023-05-28',
  },
  {
    score: 80,
    date: '2023-03-16',
  },
  {
    score: 78,
    date: '2023-05-01',
  },
  {
    score: 70,
    date: '2023-04-23',
  },
  {
    score: 76,
    date: '2023-04-06',
  },
  {
    score: 99,
    date: '2023-03-24',
  },
  {
    score: 73,
    date: '2023-03-13',
  },
  {
    score: 87,
    date: '2023-04-12',
  },
  {
    score: 99,
    date: '2023-03-17',
  },
  {
    score: 87,
    date: '2023-04-24',
  },
  {
    score: 96,
    date: '2023-03-26',
  },
  {
    score: 91,
    date: '2023-05-07',
  },
  {
    score: 75,
    date: '2023-04-17',
  },
  {
    score: 98,
    date: '2023-05-28',
  },
  {
    score: 96,
    date: '2023-05-24',
  },
];

describe('ORDER & LIMIT & Pagination', () => {
  const db = new DB({
    source: storage,
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
    storage.wipe();
    for (const result of TEST_SCORES) {
      await db.insert('TestScores', result);
    }
  });

  it('order by DESC', async () => {
    const descendingScoresResults = await db.fetch(
      CollectionQueryBuilder('TestScores').order(['score', 'DESC']).build()
    );
    expect(descendingScoresResults.size).toBe(TEST_SCORES.length);
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
      CollectionQueryBuilder('TestScores').order(['score', 'ASC']).build()
    );
    expect(descendingScoresResults.size).toBe(TEST_SCORES.length);
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
        db.query('test').order(['deep.deeper.deepest.prop', 'ASC']).build()
      );
      const resultsDESC = await db.fetch(
        db.query('test').order(['deep.deeper.deepest.prop', 'DESC']).build()
      );
      expect([...resultsASC.keys()]).toEqual(['2', '1', '3']);
      expect([...resultsDESC.keys()]).toEqual(['3', '1', '2']);
    }
    {
      const resultsASC = await db.fetch(
        db.query('test').order(['deep.prop', 'ASC']).build()
      );
      const resultsDESC = await db.fetch(
        db.query('test').order(['deep.prop', 'DESC']).build()
      );
      expect([...resultsASC.keys()]).toEqual(['1', '2', '3']);
      expect([...resultsDESC.keys()]).toEqual(['3', '2', '1']);
    }
  });
  it('order by multiple properties', async () => {
    const descendingScoresResults = await db.fetch(
      db.query('TestScores').order(['score', 'ASC'], ['date', 'DESC']).build()
    );
    expect(descendingScoresResults.size).toBe(TEST_SCORES.length);
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
      db
        .query('TestScores')
        .order(['score', 'ASC'])
        .order('date', 'DESC')
        .build()
    );
    expect(descendingScoresResults.size).toBe(TEST_SCORES.length);
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
      CollectionQueryBuilder('TestScores').order(['score', 'ASC']).build()
    );
    expect(initialOrdered.size).toBe(TEST_SCORES.length);
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
    await db.update(
      'TestScores',
      [...initialOrdered.keys()][0],
      async (entity) => {
        entity.score = [...initialOrdered.values()][0].score + 1;
      }
    );

    after: {
      const ascendingResults = await db.fetch(
        CollectionQueryBuilder('TestScores').order(['score', 'ASC']).build()
      );
      expect(ascendingResults.size).toBe(TEST_SCORES.length);
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

  it.only('orders correctly with deleted entity', async () => {
    const db = new DB({
      schema: {
        collections: {
          TestScores: {
            schema: S.Schema({
              id: S.Id(),
              score: S.Optional(S.Number()),
              date: S.String(),
            }),
          },
        },
      },
    });
    const scores = [
      { score: 99, date: '2023-04-16' },
      { score: 98, date: '2023-04-16' },
      { score: 97, date: '2023-04-16' },
      { score: 96, date: '2023-04-16' },
      { score: 95, date: '2023-04-16' },
    ];
    let i = 0;
    for (const score of scores) {
      await db.insert('TestScores', { ...score, id: (i++).toString() });
    }
    await db.delete('TestScores', '0');
    // simulate a client syncing a triple to the deleted entity for the optional field
    await db.tripleStore.insertTriple({
      id: appendCollectionToId('TestScores', '0'),
      attribute: ['TestScores', 'score'],
      value: 99,
      timestamp: [1, 'external-client'],
      expired: false,
    });
    const results = await db.fetch(
      CollectionQueryBuilder('TestScores').order(['score', 'ASC']).build()
    );
    expect([...results.values()].map((r) => r.score)).toEqual([95, 96, 97, 98]);
  });

  it('limit', async () => {
    const descendingScoresResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'DESC'])
        .limit(5)
        .build()
    );
    expect(descendingScoresResults.size).toBe(5);
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
    const firstPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'DESC'])
        .limit(5)
        .build()
    );
    expect([...firstPageResults.values()].map((r) => r.score)).toEqual([
      99, 99, 98, 96, 96,
    ]);

    const lastDoc = [...firstPageResults.entries()][4];

    const secondPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'DESC'])
        .limit(5)
        .after([lastDoc[1].score, lastDoc[0]])
        .build()
    );

    expect([...secondPageResults.values()].map((r) => r.score)).toEqual([
      95, 91, 87, 87, 87,
    ]);
  });

  it('can paginate ASC', async () => {
    const firstPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'ASC'])
        .limit(5)
        .build()
    );
    expect([...firstPageResults.values()].map((r) => r.score)).toEqual([
      70, 70, 73, 75, 75,
    ]);

    const lastDoc = [...firstPageResults.entries()][4];

    const secondPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'ASC'])
        .limit(5)
        .after([lastDoc[1].score, lastDoc[0]])
        .build()
    );
    expect([...secondPageResults.values()].map((r) => r.score)).toEqual([
      76, 76, 78, 80, 80,
    ]);
  });
  it('can pull in more results to satisfy limit in subscription when current result no longer satisfies FILTER', async () => {
    const LIMIT = 5;

    await testSubscription(
      db,
      db
        .query('TestScores')
        .where([['score', '>', 10]])
        .order(['score', 'DESC'], ['date', 'DESC'])
        .limit(LIMIT)
        .build(),
      [
        {
          check: (results) => {
            expect(results).toHaveLength(LIMIT);
          },
        },
        {
          action: async (results) => {
            const idFromResults = [...results.keys()][0];
            await db.transact(async (tx) => {
              await tx.update('TestScores', idFromResults, async (entity) => {
                entity.score = 0;
              });
            });
          },
          check: (results) => {
            expect(results.size).toBe(LIMIT);
            expect(
              [...results.values()].map((result) => result.score).includes(0)
            ).toBeFalsy();
          },
        },
        {
          action: async (results) => {
            const firstResult = [...results][0];
            await db.transact(async (tx) => {
              await tx.update('TestScores', firstResult[0], async (entity) => {
                entity.score = firstResult[1].score + 1;
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
        .order(['score', 'DESC'], ['date', 'DESC'])
        .limit(LIMIT)
        .build(),
      [
        {
          check: (results) => {
            expect(results.size).toBe(LIMIT);
          },
        },
        {
          action: async (results) => {
            const idFromResults = [...results.keys()][0];
            await db.transact(async (tx) => {
              await tx.update('TestScores', idFromResults, async (entity) => {
                entity.score = 0;
              });
            });
          },
          check: (results) => {
            expect(results.size).toBe(LIMIT);
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

    const query = db.query('test').order(['name', 'ASC']).limit(3).build();
    const result = await db.fetch(query);
    expect(result.size).toBe(3);
    expect([...result.keys()]).toEqual(['1', '2', '4']);
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
      db.query('cars').order(['make', 'ASC'], ['year', 'DESC']).limit(5).build()
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
      source: new InMemoryTupleStorage(),
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
          .order([prop, sortOrder])
          .limit(PAGE_SIZE)
          .after(lastEntity)
          .build()
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

describe('database transactions', () => {
  // beforeEach(() => {
  //   storage.data = [];
  // });
  it('can implicitly commit a transaction', async () => {
    const db = new DB({
      source: new InMemoryTupleStorage(),
      schema: {
        collections: {
          TestScores: {
            schema: S.Schema({
              id: S.String({ default: { func: 'uuid' } }),
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    await db.transact(async (tx) => {
      await tx.insert('TestScores', {
        score: 80,
        date: '2023-04-16',
      });
      expect(
        (await db.fetch(CollectionQueryBuilder('TestScores').build())).size
      ).toBe(0);
      expect(
        (await tx.fetch(CollectionQueryBuilder('TestScores').build())).size
      ).toBe(1);
    });
    expect(
      (await db.fetch(CollectionQueryBuilder('TestScores').build())).size
    ).toBe(1);
    // expect(() => tx.collection('TestScores').query().fetch()).toThrowError();
  });
  it('can rollback an insert transaction', async () => {
    const db = new DB({
      source: new InMemoryTupleStorage(),
      schema: {
        collections: {
          TestScores: {
            schema: S.Schema({
              id: S.String({ default: { func: 'uuid' } }),
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    await db.transact(async (tx) => {
      await tx.insert('TestScores', {
        score: 80,
        date: '2023-04-16',
      });
      expect(
        (await db.fetch(CollectionQueryBuilder('TestScores').build())).size
      ).toBe(0);
      expect(
        (await tx.fetch(CollectionQueryBuilder('TestScores').build())).size
      ).toBe(1);
      await tx.cancel();
    });
    expect(
      (await db.fetch(CollectionQueryBuilder('TestScores').build())).size
    ).toBe(0);
    // expect(() => tx.collection('TestScores').query().fetch()).toThrowError();
  });
  it('can rollback an update transaction', async () => {
    const db = new DB({
      source: new InMemoryTupleStorage(),
      schema: {
        collections: {
          TestScores: {
            schema: S.Schema({
              id: S.String(),
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    const DOC_ID = 'my-score';
    await db.insert('TestScores', {
      score: 80,
      date: '2023-04-16',
      id: DOC_ID,
    });
    await db.transact(async (tx) => {
      await tx.update('TestScores', DOC_ID, async (entity) => {
        entity.score = 999;
      });
      expect((await db.fetchById('TestScores', DOC_ID))?.score).toBe(80);
      expect((await tx.fetchById('TestScores', DOC_ID))?.score).toBe(999);
      await tx.cancel();
    });
    expect((await db.fetchById('TestScores', DOC_ID))?.score).toBe(80);
  });
  it("can't commit inside the transaction callback", async () => {
    const db = new DB({});
    expect(
      db.transact(async (tx) => {
        tx.commit();
      })
    ).rejects.toThrowError();
  });
  it('can fetch by id in a transaction', async () => {
    const db = new DB({});
    await db.transact(async (tx) => {
      await tx.insert('TestScores', {
        score: 80,
        date: '2023-04-16',
        id: '1',
      });
      const result = await tx.fetchById('TestScores', '1');
      expect(result.score).toBe(80);
    });
    expect((await db.fetchById('TestScores', '1'))?.score).toBe(80);
  });
  it('can update an entity in a transaction', async () => {
    const db = new DB({
      schema: {
        collections: {
          TestScores: {
            schema: S.Schema({
              id: S.String({ default: { func: 'uuid' } }),
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    await db.insert('TestScores', {
      id: 'score-1',
      score: 80,
      date: '2023-04-16',
    });
    await db.transact(async (tx) => {
      expect((await db.fetchById('TestScores', 'score-1'))!.score).toBe(80);
      await tx.update('TestScores', 'score-1', async (entity) => {
        entity.score = 100;
      });
      expect((await tx.fetchById('TestScores', 'score-1'))!.score).toBe(100);
    });
    expect((await db.fetchById('TestScores', 'score-1'))!.score).toBe(100);
  });
  it('awaits firing subscription until transaction is committed', async () => {
    const db = new DB({
      source: new InMemoryTupleStorage(),
      schema: {
        collections: {
          TestScores: {
            schema: S.Schema({
              id: S.String({ default: { func: 'uuid' } }),
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    // Adding this check to ensure the onInsert isn't called with schema/metadata triples
    await db.ready;
    const insertSpy = vi.fn();
    db.tripleStore.onInsert(insertSpy);
    await db.transact(async (tx) => {
      await tx.insert('TestScores', {
        score: 80,
        date: '2023-04-16',
      });
      await tx.insert('TestScores', {
        score: 90,
        date: '2023-04-17',
      });
      expect(insertSpy).not.toHaveBeenCalled();
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('can delete and set the same attribute within a transaction', async () => {
    // set then delete
    {
      const db = new DB();
      await db.insert('test', {
        id: '1',
      });

      await db.transact(async (tx) => {
        await tx.update('test', '1', async (entity) => {
          entity.attr = {
            test: 'obj',
          };
        });
        await tx.update('test', '1', async (entity) => {
          delete entity['attr'];
        });
      });
      const result = await db.fetchById('test', '1');
      expect(result.attr).toBeUndefined();
    }

    // delete then set
    {
      const db = new DB();
      await db.insert('test', {
        id: '1',
        attr: 'foo',
      });

      await db.transact(async (tx) => {
        await tx.update('test', '1', async (entity) => {
          delete entity['attr'];
        });
        await tx.update('test', '1', async (entity) => {
          entity.attr = {
            test: 'obj',
          };
        });
      });
      const result = await db.fetchById('test', '1');
      expect(result.attr).toStrictEqual({ test: 'obj' });
    }
  });
});

describe('schema changes', async () => {
  describe('createCollection', () => {
    it('can create a collection definition', async () => {
      const db = new DB();
      await db.createCollection({
        name: 'students',
        schema: {
          id: { type: 'number', options: {} },
          name: { type: 'string', options: {} },
        },
      });
      const schema = await db.getSchema();
      expect(schema?.collections).toHaveProperty('students');
      expect(schema?.collections.students.schema.properties).toHaveProperty(
        'id'
      );
      expect(schema?.collections.students.schema.properties).toHaveProperty(
        'name'
      );
    });

    it('can add a collection and observe changes in a transaction', async () => {
      const db = new DB();
      let txSchema;
      await db.transact(async (tx) => {
        expect(tx.schema).toBeUndefined();
        const newCollection = {
          name: 'students',
          schema: {
            id: { type: 'number', options: {} },
            name: { type: 'string', options: {} },
          },
        };
        await tx.createCollection(newCollection);
        txSchema = tx.schema;
        expect(tx.schema).not.toBeUndefined();
        expect(tx.schema).toHaveProperty('collections');
        expect(tx.schema?.collections).toHaveProperty(newCollection.name);
      });
      expect(schemaToJSON((await db.getSchema())!)).toEqual(
        schemaToJSON(txSchema)
      );
    });

    it('can create a collection with rules', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            source: new InMemoryTupleStorage(),
          }),
        async (db) => {
          await db.createCollection({
            name: 'students',
            schema: {
              id: { type: 'number', options: {} },
              name: { type: 'string', options: {} },
            },
            rules: {
              read: {
                'only-read-self': {
                  filter: [['id', '=', '$SESSION_USER_ID']],
                  description: 'Can only read your own student record',
                },
              },
            },
          });
          const dbSchema = await db.getSchema();
          expect(
            Object.keys(dbSchema?.collections.students.rules?.read!)
          ).toHaveLength(1);
          const rule =
            dbSchema?.collections.students.rules?.read!['only-read-self']!;
          expect(rule.filter).toEqual([['id', '=', '$SESSION_USER_ID']]);
          expect(rule.description).toEqual(
            'Can only read your own student record'
          );
        }
      );
    });
  });

  describe('dropCollection', () => {
    it('can drop a collection definition from the schema', async () => {
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
      const db = new DB({ schema: schema });
      const dbSchemaBefore = await db.getSchema();
      expect(dbSchemaBefore?.collections).toHaveProperty('students');
      await db.dropCollection({ name: 'students' });
      const dbSchemaAfter = await db.getSchema();
      expect(dbSchemaAfter?.collections).not.toHaveProperty('students');

      // TODO: test data is actually dropped if we decide it should be
    });
  });

  describe('addAttribute', () => {
    const defaultSchema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            address: S.Record({
              street: S.String(),
            }),
          }),
        },
      },
    };

    it('can add an attribute', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.addAttribute({
            collection: 'students',
            path: ['age'],
            attribute: { type: 'number', options: {} },
          });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('age');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('name');
        }
      );
    });

    it('can add an optional attribute', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.addAttribute({
            collection: 'students',
            path: ['age'],
            attribute: { type: 'number', options: {} },
            optional: true,
          });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('age');
          expect(
            dbSchema?.collections.students.schema.optional?.includes('age')
          ).toBe(true);
        }
      );
    });

    it('can add a nested attribute', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.addAttribute({
            collection: 'students',
            path: ['address', 'state'],
            attribute: { type: 'string', options: {} },
          });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('address');
          expect(
            dbSchema?.collections.students.schema.properties.address.properties
          ).toHaveProperty('state');
        }
      );
    });

    it('addAttribute throws if the collection doesnt exist', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.addAttribute({
              collection: 'todos',
              path: ['text'],
              attribute: { type: 'string', options: {} },
            })
          ).rejects.toThrowError(CollectionNotFoundError);
        }
      );
    });

    it('addAttribute throws if the path is not valid', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.addAttribute({
              collection: 'students',
              path: [],
              attribute: { type: 'string', options: {} },
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.addAttribute({
              collection: 'students',
              path: ['addresss', 'state'],
              attribute: { type: 'string', options: {} },
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
        }
      );
    });

    it('addAttribute is idempoent', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.addAttribute({
            collection: 'students',
            path: ['age'],
            attribute: { type: 'number', options: {} },
          });
          const hash1 = hashSchemaJSON(
            schemaToJSON(await db.getSchema())?.collections
          );
          await db.addAttribute({
            collection: 'students',
            path: ['age'],
            attribute: { type: 'number', options: {} },
          });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('age');
          const hash2 = hashSchemaJSON(schemaToJSON(dbSchema)?.collections);

          expect(hash1).toBe(hash2);
        }
      );
    });
  });

  describe('dropAttribute', () => {
    const defaultSchema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            age: S.String(),
            address: S.Record({
              street: S.String(),
              state: S.String(),
            }),
          }),
        },
      },
    };

    it('can drop an attribute', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.dropAttribute({ collection: 'students', path: ['age'] });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).not.toHaveProperty('age');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('name');
        }
      );
    });

    it('Dropping an optional attribute cleans up data', async () => {
      const db = new DB({
        schema: {
          collections: {
            students: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
                age: S.Optional(S.Number()),
              }),
            },
          },
        },
      });
      await db.dropAttribute({ collection: 'students', path: ['age'] });
      const dbSchema = await db.getSchema();

      expect(
        dbSchema?.collections.students.schema.properties
      ).not.toHaveProperty('age');
      expect(dbSchema?.collections.students.schema.optional).not.toContain(
        'age'
      );
    });

    it('can drop a nested attribute', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.dropAttribute({
            collection: 'students',
            path: ['address', 'state'],
          });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).toHaveProperty('address');
          expect(
            dbSchema?.collections.students.schema.properties.address.properties
          ).not.toHaveProperty('state');
        }
      );
    });

    it('dropAttribute throws if the collection doesnt exist', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.dropAttribute({
              collection: 'todos',
              path: ['text'],
            })
          ).rejects.toThrowError(CollectionNotFoundError);
        }
      );
    });

    it('dropAttribute throws if the path is not valid', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.dropAttribute({
              collection: 'students',
              path: [],
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.dropAttribute({
              collection: 'students',
              path: ['addresss', 'state'],
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
        }
      );
    });

    it('dropAttribute is idempoent', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.dropAttribute({ collection: 'students', path: ['age'] });
          const hash1 = hashSchemaJSON(
            schemaToJSON(await db.getSchema())?.collections
          );
          await db.dropAttribute({ collection: 'students', path: ['age'] });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections).toHaveProperty('students');
          expect(
            dbSchema?.collections.students.schema.properties
          ).not.toHaveProperty('age');
          const hash2 = hashSchemaJSON(schemaToJSON(dbSchema)?.collections);

          expect(hash1).toBe(hash2);
        }
      );
    });
  });

  describe('alterAttributeOption', () => {
    const defaultSchema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            address: S.Record({
              street: S.String(),
              zip: S.String(),
            }),
          }),
        },
      },
    };
    it('can update attribute options', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            schema: defaultSchema,
          }),
        async (db) => {
          // new values
          await db.alterAttributeOption({
            collection: 'students',
            path: ['name'],
            options: {
              nullable: true,
              default: "Robert'); DROP TABLE Students;--",
            },
          });

          let dbSchema = await db.getSchema();
          expect(
            dbSchema?.collections.students.schema.properties.name.options
              .nullable
          ).toBe(true);
          expect(
            dbSchema?.collections.students.schema.properties.name.options
              .default
          ).toBe("Robert'); DROP TABLE Students;--");

          // update values
          await db.alterAttributeOption({
            collection: 'students',
            path: ['name'],
            options: {
              nullable: false,
              default: 'Bobby Tables',
            },
          });

          dbSchema = await db.getSchema();
          expect(
            dbSchema?.collections.students.schema.properties.name.options
              .nullable
          ).toBe(false);
          expect(
            dbSchema?.collections.students.schema.properties.name.options
              .default
          ).toBe('Bobby Tables');
        }
      );
    });

    it('alterAttributeOption can update a nested attribute', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            schema: defaultSchema,
          }),
        async (db) => {
          await db.alterAttributeOption({
            collection: 'students',
            path: ['address', 'zip'],
            options: {
              nullable: true,
              default: '12345',
            },
          });

          {
            const dbSchema = await db.getSchema();
            expect(
              dbSchema?.collections.students.schema.properties.address
                .properties.zip.options.nullable
            ).toBe(true);
            expect(
              dbSchema?.collections.students.schema.properties.address
                .properties.zip.options.default
            ).toBe('12345');
          }

          await db.alterAttributeOption({
            collection: 'students',
            path: ['address', 'zip'],
            options: {
              nullable: false,
              default: '54321',
            },
          });

          {
            const dbSchema = await db.getSchema();
            expect(
              dbSchema?.collections.students.schema.properties.address
                .properties.zip.options.nullable
            ).toBe(false);
            expect(
              dbSchema?.collections.students.schema.properties.address
                .properties.zip.options.default
            ).toBe('54321');
          }
        }
      );
    });

    it('alterAttributeOption throws if the collection doesnt exist', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            schema: defaultSchema,
          }),
        async (db) => {
          await expect(
            db.alterAttributeOption({
              collection: 'todos',
              path: ['text'],
              options: { nullable: true },
            })
          ).rejects.toThrowError(CollectionNotFoundError);
        }
      );
    });

    it('alterAttributeOption throws if the path is not valid', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            schema: defaultSchema,
          }),
        async (db) => {
          await expect(
            db.alterAttributeOption({
              collection: 'students',
              path: [],
              options: { nullable: true },
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.alterAttributeOption({
              collection: 'students',
              path: ['addresss', 'state'],
              options: { nullable: true },
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.alterAttributeOption({
              collection: 'students',
              path: ['address', 'foo'],
              options: { nullable: true },
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
        }
      );
    });

    it('alterAttributeOption is idempoent', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            schema: defaultSchema,
          }),
        async (db) => {
          await db.alterAttributeOption({
            collection: 'students',
            path: ['name'],
            options: { nullable: true },
          });
          const hash1 = hashSchemaJSON(
            schemaToJSON(await db.getSchema())?.collections
          );
          await db.alterAttributeOption({
            collection: 'students',
            path: ['name'],
            options: { nullable: true },
          });
          const dbSchema = await db.getSchema();
          expect(
            dbSchema?.collections.students.schema.properties.name.options
              .nullable
          ).toBe(true);
          const hash2 = hashSchemaJSON(schemaToJSON(dbSchema)?.collections);

          expect(hash1).toBe(hash2);
        }
      );
    });
  });

  describe('dropAttributeOption', () => {
    const defaultSchema = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String({
              nullable: true,
              default: 'Bobby Tables',
            }),
            address: S.Record({
              street: S.String(),
              state: S.String(),
              zip: S.String({
                nullable: true,
                default: '54321',
              }),
            }),
          }),
        },
      },
    };
    it('can drop attribute options', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.dropAttributeOption({
            collection: 'students',
            path: ['name'],
            option: 'nullable',
          });
          {
            const dbSchema = await db.getSchema();
            expect(
              dbSchema?.collections.students.schema.properties.name.options
            ).not.toHaveProperty('nullable');
          }
          await db.dropAttributeOption({
            collection: 'students',
            path: ['name'],
            option: 'default',
          });
          {
            const dbSchema = await db.getSchema();
            expect(
              dbSchema?.collections.students.schema.properties.name.options
            ).not.toHaveProperty('default');
          }
        }
      );
    });
    it('dropAttributeOption can drop a nested attribute option', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.dropAttributeOption({
            collection: 'students',
            path: ['address', 'zip'],
            option: 'nullable',
          });
          {
            const dbSchema = await db.getSchema();
            expect(
              dbSchema?.collections.students.schema.properties.address
                .properties.zip.options
            ).not.toHaveProperty('nullable');
          }
          await db.dropAttributeOption({
            collection: 'students',
            path: ['address', 'zip'],
            option: 'default',
          });
          {
            const dbSchema = await db.getSchema();
            expect(
              dbSchema?.collections.students.schema.properties.address
                .properties.zip.options
            ).not.toHaveProperty('default');
          }
        }
      );
    });

    it('dropAttributeOption throws if the collection doesnt exist', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.dropAttributeOption({
              collection: 'todos',
              path: ['text'],
              option: 'nullable',
            })
          ).rejects.toThrowError(CollectionNotFoundError);
        }
      );
    });

    it('dropAttributeOption throws if the path is not valid', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.dropAttributeOption({
              collection: 'students',
              path: [],
              option: 'nullable',
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.dropAttributeOption({
              collection: 'students',
              path: ['addresss', 'zip'],
              option: 'nullable',
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.dropAttributeOption({
              collection: 'students',
              path: ['address', 'foo'],
              option: 'nullable',
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
        }
      );
    });

    it('dropAttributeOption is idempoent', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.dropAttributeOption({
            collection: 'students',
            path: ['name'],
            option: 'nullable',
          });
          const hash1 = hashSchemaJSON(
            schemaToJSON(await db.getSchema())?.collections
          );
          await db.dropAttributeOption({
            collection: 'students',
            path: ['name'],
            option: 'nullable',
          });
          const dbSchema = await db.getSchema();
          expect(
            dbSchema?.collections.students.schema.properties.name.options
          ).not.toHaveProperty('nullable');
          const hash2 = hashSchemaJSON(schemaToJSON(dbSchema)?.collections);

          expect(hash1).toBe(hash2);
        }
      );
    });
  });

  describe('addRule', () => {
    it('can add a rule to a collection', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            source: new InMemoryTupleStorage(),
            schema: {
              collections: {
                students: {
                  schema: S.Schema({
                    id: S.String(),
                    name: S.String(),
                  }),
                },
              },
            },
          }),
        async (db) => {
          {
            const schema = await db.getSchema();
            const rules = schema?.collections.students.rules?.read ?? {};
            expect(Object.keys(rules)).toHaveLength(0);
          }

          await db.addRule({
            scope: 'read',
            collection: 'students',
            id: 'only-read-self',
            rule: {
              filter: [['id', '=', '$SESSION_USER_ID']],
              description: 'Can only read your own student record',
            },
          });

          {
            const schema = await db.getSchema();
            const rules = schema?.collections.students.rules?.read!;
            expect(Object.keys(rules)).toHaveLength(1);
            const rule = rules['only-read-self']!;
            expect(rule.filter).toEqual([['id', '=', '$SESSION_USER_ID']]);
            expect(rule.description).toEqual(
              'Can only read your own student record'
            );
          }
        }
      );
    });
  });

  describe('dropRule', () => {
    it('can drop a rule from a collection', async () => {
      await testDBAndTransaction(
        () =>
          new DB({
            source: new InMemoryTupleStorage(),
            schema: {
              collections: {
                students: {
                  schema: S.Schema({
                    id: S.String(),
                    name: S.String(),
                  }),
                  rules: {
                    read: {
                      'only-read-self': {
                        filter: [['id', '=', '$SESSION_USER_ID']],
                        description: 'Can only read your own student record',
                      },
                    },
                  },
                },
              },
            },
          }),
        async (db) => {
          {
            const schema = await db.getSchema();
            const rules = schema?.collections.students.rules?.read!;
            expect(Object.keys(rules)).toHaveLength(1);
            const rule = rules['only-read-self']!;
            expect(rule.filter).toEqual([['id', '=', '$SESSION_USER_ID']]);
            expect(rule.description).toEqual(
              'Can only read your own student record'
            );
          }

          await db.dropRule({
            scope: 'read',
            collection: 'students',
            id: 'only-read-self',
          });

          {
            const schema = await db.getSchema();
            const rules = schema?.collections.students.rules?.read ?? {};
            expect(Object.keys(rules)).toHaveLength(0);
          }
        }
      );
    });
  });

  describe('setAttributeOptional', () => {
    const defaultSchema = {
      collections: {
        test: {
          schema: S.Schema({
            id: S.String(),
            required: S.String(),
            optional: S.Optional(S.String()),
            record: S.Record({
              required: S.String(),
              optional: S.Optional(S.String()),
            }),
          }),
        },
      },
    };
    it('can set an attribute to optional', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          {
            const schema = await db.getSchema();
            expect(schema?.collections.test.schema.optional?.length).toBe(1);
            expect(
              schema?.collections.test.schema.optional?.includes('optional')
            ).toBe(true);
          }
          await db.setAttributeOptional({
            collection: 'test',
            path: ['required'],
            optional: true,
          });
          {
            const schema = await db.getSchema();
            expect(schema?.collections.test.schema.optional?.length).toBe(2);
            expect(
              schema?.collections.test.schema.optional?.includes('required')
            ).toBe(true);
            expect(
              schema?.collections.test.schema.optional?.includes('optional')
            ).toBe(true);
          }
          await db.setAttributeOptional({
            collection: 'test',
            path: ['optional'],
            optional: false,
          });
          {
            const schema = await db.getSchema();
            expect(schema?.collections.test.schema.optional?.length).toBe(1);
            expect(
              schema?.collections.test.schema.optional?.includes('required')
            ).toBe(true);
          }
        }
      );
    });

    it('setAttributeOptional can set a nested attribute optional', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          {
            const schema = await db.getSchema();
            expect(
              schema?.collections.test.schema.properties.record.optional?.length
            ).toBe(1);
            expect(
              schema?.collections.test.schema.properties.record.optional?.includes(
                'optional'
              )
            ).toBe(true);
          }
          await db.setAttributeOptional({
            collection: 'test',
            path: ['record', 'required'],
            optional: true,
          });
          {
            const schema = await db.getSchema();
            expect(
              schema?.collections.test.schema.properties.record.optional?.length
            ).toBe(2);
            expect(
              schema?.collections.test.schema.properties.record.optional?.includes(
                'required'
              )
            ).toBe(true);
            expect(
              schema?.collections.test.schema.properties.record.optional?.includes(
                'optional'
              )
            ).toBe(true);
          }
          await db.setAttributeOptional({
            collection: 'test',
            path: ['record', 'optional'],
            optional: false,
          });
          {
            const schema = await db.getSchema();
            expect(
              schema?.collections.test.schema.properties.record.optional?.length
            ).toBe(1);
            expect(
              schema?.collections.test.schema.properties.record.optional?.includes(
                'required'
              )
            ).toBe(true);
          }
        }
      );
    });

    it('setAttributeOptional throws if the collection doesnt exist', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.setAttributeOptional({
              collection: 'todos',
              path: ['text'],
              optional: true,
            })
          ).rejects.toThrowError(CollectionNotFoundError);
        }
      );
    });

    it('setAttributeOptional throws if the path is not valid', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await expect(
            db.setAttributeOptional({
              collection: 'test',
              path: [],
              optional: true,
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.setAttributeOptional({
              collection: 'test',
              path: ['recordd', 'required'],
              optional: true,
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
          await expect(
            db.setAttributeOptional({
              collection: 'test',
              path: ['record', 'foo'],
              optional: true,
            })
          ).rejects.toThrowError(InvalidSchemaPathError);
        }
      );
    });

    it('setAttributeOptional is idempoent', async () => {
      await testDBAndTransaction(
        () => new DB({ schema: defaultSchema }),
        async (db) => {
          await db.setAttributeOptional({
            collection: 'test',
            path: ['required'],
            optional: true,
          });
          await db.setAttributeOptional({
            collection: 'test',
            path: ['optional'],
            optional: false,
          });
          const hash1 = hashSchemaJSON(
            schemaToJSON(await db.getSchema())?.collections
          );
          await db.setAttributeOptional({
            collection: 'test',
            path: ['required'],
            optional: true,
          });
          await db.setAttributeOptional({
            collection: 'test',
            path: ['optional'],
            optional: false,
          });
          const dbSchema = await db.getSchema();
          expect(dbSchema?.collections.test.schema.optional?.length).toBe(1);
          expect(
            dbSchema?.collections.test.schema.optional?.includes('required')
          ).toBe(true);

          const hash2 = hashSchemaJSON(schemaToJSON(dbSchema)?.collections);

          expect(hash1).toBe(hash2);
        }
      );
    });
  });

  it('can override an existing schema', async () => {
    const dataSource = new MemoryStorage();
    const schemaOne = {
      collections: {
        students: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
          }),
        },
      },
    };
    const schemaTwo = {
      collections: {
        products: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            price: S.Number(),
          }),
        },
      },
    };
    const dbOne = new DB({ source: dataSource, schema: schemaOne });
    await dbOne.ready;
    const beforeSchema = await dbOne.getSchema();
    expect(beforeSchema).toBeDefined();
    expect(beforeSchema.collections.students).toBeDefined();
  });
});

describe('migrations', () => {
  const migrations: Migration[] = [
    {
      parent: 0,
      version: 1,
      up: [
        [
          'create_collection',
          {
            name: 'students',
            schema: {
              id: { type: 'number', options: {} },
              name: { type: 'string', options: {} },
            },
          },
        ],
      ],
      down: [['drop_collection', { name: 'students' }]],
    },
    {
      parent: 1,
      version: 2,
      up: [
        [
          'create_collection',
          {
            name: 'classes',
            schema: {
              id: { type: 'number', options: {} },
              department: { type: 'string', options: {} },
            },
          },
        ],
      ],
      down: [['drop_collection', { name: 'classes' }]],
    },
  ];

  it('initializing a DB with migrations sets the schema and migrations tracker', async () => {
    const db = new DB({ migrations });
    const dbSchema = await db.getSchema();
    expect(dbSchema?.collections).toHaveProperty('students');
    expect(dbSchema?.collections).toHaveProperty('classes');
    expect(dbSchema?.version).toEqual(2);

    const appliedMigrations = Object.values(await db.getAppliedMigrations());
    expect(appliedMigrations.length).toEqual(2);
    expect(appliedMigrations[0].id).toEqual(1);
    expect(appliedMigrations[0].parent).toEqual(0);
    expect(appliedMigrations[1].id).toEqual(2);
    expect(appliedMigrations[1].parent).toEqual(1);
  });

  it('migrating updates migrations tracker', async () => {
    const db = new DB();
    await db.ready;
    {
      const appliedMigrations = Object.values(await db.getAppliedMigrations());
      expect(appliedMigrations.length).toEqual(0);
    }
    await db.migrate([migrations[0]], 'up');
    {
      const appliedMigrations = Object.values(await db.getAppliedMigrations());
      expect(appliedMigrations.length).toEqual(1);
    }
    await db.migrate([migrations[1]], 'up');
    {
      const appliedMigrations = Object.values(await db.getAppliedMigrations());
      expect(appliedMigrations.length).toEqual(2);
    }
    await db.migrate([migrations[1]], 'down');
    {
      const appliedMigrations = Object.values(await db.getAppliedMigrations());
      expect(appliedMigrations.length).toEqual(1);
    }
    await db.migrate([migrations[0]], 'down');
    {
      const appliedMigrations = Object.values(await db.getAppliedMigrations());
      expect(appliedMigrations.length).toEqual(0);
    }
  });

  it('will stop migrating on an error', async () => {
    const migrationsCopy = JSON.parse(
      JSON.stringify(migrations)
    ) as Migration[];
    migrationsCopy[1].up.push([
      'bad_op',
      {
        arg: 'foo',
      },
    ]);
    const db = new DB({ migrations: migrationsCopy });
    await expect(db.ready).rejects.toThrowError(InvalidMigrationOperationError);
    // const db = new DB({ migrations: migrationsCopy });

    // const dbSchema = await db.getSchema();
    // expect(dbSchema?.collections).toHaveProperty('students');
    // expect(dbSchema?.collections).not.toHaveProperty('classes');
    // expect(dbSchema?.version).toEqual(1);
  });

  it('will only run migrations if version and parent pointer match', async () => {
    const migration01 = { parent: 0, version: 1, up: [], down: [] };
    const migration12 = { parent: 1, version: 2, up: [], down: [] };
    const migration13 = { parent: 1, version: 3, up: [], down: [] };
    const migration23 = { parent: 2, version: 3, up: [], down: [] };
    const migration34 = { parent: 3, version: 4, up: [], down: [] };

    // Standard case
    const migrationsLinked = [
      migration01,
      migration12,
      migration23,
      migration34,
    ];
    // Branch at 1->2, 1->3, must apply a migration with parent 2 to continue
    const migrationsUnlinked = [
      migration01,
      migration12,
      migration13,
      migration34,
    ];
    // Skip 1->3, continue with 2->3
    const migrationsAll = [
      migration01,
      migration12,
      migration13,
      migration23,
      migration34,
    ];

    const dbLinked = new DB({ migrations: migrationsLinked });
    const dbUnlinked = new DB({ migrations: migrationsUnlinked });
    const dbAll = new DB({ migrations: migrationsAll });

    const dbLinkedSchema = await dbLinked.getSchema();
    const dbUnlinkedSchema = await dbUnlinked.getSchema();
    const dbAllSchema = await dbAll.getSchema();
    expect(dbLinkedSchema?.version).toEqual(4);
    expect(dbUnlinkedSchema?.version).toEqual(2);
    expect(dbAllSchema?.version).toEqual(4);

    const linkedMigration = { parent: 4, version: 5, up: [], down: [] };
    const unlinkedMigration = { parent: 3, version: 5, up: [], down: [] };

    await dbAll.migrate([unlinkedMigration], 'up');
    const dbAllSchemaAfter = await dbAll.getSchema();
    expect(dbAllSchemaAfter?.version).toEqual(4);

    await dbAll.migrate([linkedMigration], 'up');
    const dbAllSchemaAfter2 = await dbAll.getSchema();
    expect(dbAllSchemaAfter2?.version).toEqual(5);

    // TODO: I think this would fail because migration would be applied since we dont actually store the migrations that were applied
    // dbAll.migrate([unlinkedMigration], 'down');
    // expect(dbAll.tripleStore.schema?.version).toEqual(5);
    await dbAll.migrate([linkedMigration], 'down');
    const dbAllSchemaAfter3 = await dbAll.getSchema();
    expect(dbAllSchemaAfter3?.version).toEqual(4);

    await dbAll.migrate([unlinkedMigration], 'down');
    const dbAllSchemaAfter4 = await dbAll.getSchema();
    expect(dbAllSchemaAfter4?.version).toEqual(4);
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
      const storage = new InMemoryTupleStorage();
      const db = new DB({ source: storage, schema: schema });
      await db.insert('students', { id: '1', name: 'Alice' });

      expect(storage.data.length).not.toBe(0);

      await db.clear();

      expect(storage.data.length).toBe(0);
    });
  });
});

// When updating tests, please keep the deep nesting in the test data
describe('Nested Properties', () => {
  describe('Schemaless', () => {
    let db: DB<undefined>;
    const ENTITY_ID = 'business-1';
    beforeEach(async () => {
      db = new DB();
    });

    const defaultData = {
      [ENTITY_ID]: {
        name: 'My Business',
        address: {
          street: {
            number: '123',
            name: 'Main St',
          },
          city: 'San Francisco',
          state: 'CA',
        },
        id: ENTITY_ID,
      },
    };

    it('can insert an entity with nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }

      const query = db.query('Businesses').entityId(ENTITY_ID).build();
      const result = (await db.fetch(query)).get(ENTITY_ID);
      expect(result.address.street.number).toBe('123');
      expect(result.address.street.name).toBe('Main St');
      expect(result.address.city).toBe('San Francisco');
      expect(result.address.state).toBe('CA');
    });

    it('can update nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }

      const query = db.query('Businesses').entityId(ENTITY_ID).build();
      const preUpdateLookup = (await db.fetch(query)).get(ENTITY_ID);
      expect(preUpdateLookup.address.street.number).toBe('123');
      expect(preUpdateLookup.address.street.name).toBe('Main St');

      await db.update('Businesses', ENTITY_ID, async (entity) => {
        entity.address.street.number = '456';
      });

      const postUpdateLookup = (await db.fetch(query)).get(ENTITY_ID);
      expect(postUpdateLookup.address.street.number).toBe('456');
      expect(postUpdateLookup.address.street.name).toBe('Main St');
    });

    it('can query based on nested property', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }
      {
        const positiveResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.city', '=', 'San Francisco']])
            .build()
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.state', '=', 'TX']])
            .build()
        );
        expect(negativeResults).toHaveLength(0);
      }
      {
        const positiveResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.street.number', '=', '123']])
            .build()
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.street.name', '=', 'noExist']])
            .build()
        );
        expect(negativeResults).toHaveLength(0);
      }
    });

    it('can select specific nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }

      const results = await db.fetch(
        db.query('Businesses').select(['address.city', 'address.state']).build()
      );
      expect(results).toHaveLength(1);
      const result = results.get(ENTITY_ID);
      expect(result).toHaveProperty('address.city');
      expect(result).toHaveProperty('address.state');
      expect(result).not.toHaveProperty('address.street');
    });
  });
  describe('Schemafull', async () => {
    const schema = {
      Businesses: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          address: S.Record({
            street: S.Record({
              number: S.String(),
              name: S.String(),
            }),
            city: S.String(),
            state: S.String(),
          }),
        }),
      },
    };
    let db: DB<typeof schema>;
    beforeEach(async () => {
      db = new DB({
        schema: { collections: schema },
      });
    });
    const ENTITY_ID = 'business-1';
    const defaultData = {
      [ENTITY_ID]: {
        name: 'My Business',
        address: {
          street: {
            number: '123',
            name: 'Main St',
          },
          city: 'San Francisco',
          state: 'CA',
        },
      },
    };

    // May be duplicated in 'record operations'
    it('can insert an entity with nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', { ...data, id });
      }

      const query = db.query('Businesses').entityId(ENTITY_ID).build();
      const result = (await db.fetch(query)).get(ENTITY_ID);
      expect(result.address.street.number).toBe('123');
      expect(result.address.street.name).toBe('Main St');
      expect(result.address.city).toBe('San Francisco');
      expect(result.address.state).toBe('CA');
    });

    // May be duplicated in 'record operations'
    it('rejects inserts of malformed objects', async () => {
      await expect(
        db.insert('Businesses', {
          name: 'My Business',
          address: {
            street: 59, // expects record
            city: 'San Francisco',
            state: 'CA',
          },
        })
      ).rejects.toThrowError(DBSerializationError);

      await expect(
        db.insert('Businesses', {
          name: 'My Business',
          address: {
            street: {
              number: 123, // expects string
              name: 'Main St',
            },
            city: 'San Francisco',
            state: 'CA',
          },
        })
      ).rejects.toThrowError(DBSerializationError);
    });

    it('can query based on nested property', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data);
      }
      {
        const positiveResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.city', '=', 'San Francisco']])
            .build()
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.state', '=', 'TX']])
            .build()
        );
        expect(negativeResults).toHaveLength(0);
      }
      {
        const positiveResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.street.number', '=', '123']])
            .build()
        );
        expect(positiveResults).toHaveLength(1);

        const negativeResults = await db.fetch(
          db
            .query('Businesses')
            .where([['address.street.name', '=', 'noExist']])
            .build()
        );
        expect(negativeResults).toHaveLength(0);
      }
    });
  });
});

it.skip('throws an error if a register filter is malformed', async () => {
  const db = new DB({
    schema: {
      collections: {
        Classes: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
            students: S.Set(S.String()),
          }),
        },
      },
    },
  });
  const query = db
    .query('Classes')
    .where([['students', '=', 'student-1']])
    .build();
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
              students: S.Set(S.String()),
            }),
          },
        },
      },
    });
    const query = db.query('Classes').build();
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

describe('DB variable index cache view thing', () => {
  it('maintains consistency across inserts', async () => {
    const db = new DB({});
    const query = db
      .query('cars')
      .where(['make', '=', 'Ford'], ['year', '>', '$year'])
      .vars({ year: 2010 })
      .build();

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

describe('relational querying / sub querying', () => {
  const db = new DB({});
  const DATA = [
    [
      'manufacturers',
      {
        name: 'Ford',
        country: 'USA',
        id: 'ford',
      },
    ],
    [
      'manufacturers',
      {
        name: 'Toyota',
        country: 'Japan',
        id: 'toyota',
      },
    ],
    [
      'manufacturers',
      {
        name: 'Honda',
        country: 'Japan',
        id: 'honda',
      },
    ],
    [
      'manufacturers',
      {
        name: 'Volkswagen',
        country: 'Germany',
        id: 'vw',
      },
    ],
    [
      'cars',
      { year: 2021, model: 'F150', manufacturer: 'ford', type: 'truck' },
    ],
    [
      'cars',
      { year: 2022, model: 'Fusion', manufacturer: 'ford', type: 'sedan' },
    ],
    [
      'cars',
      { year: 2022, model: 'Explorer', manufacturer: 'ford', type: 'SUV' },
    ],
    [
      'cars',
      { year: 2022, model: 'Camry', manufacturer: 'toyota', type: 'sedan' },
    ],
    [
      'cars',
      { year: 2021, model: 'Tacoma', manufacturer: 'toyota', type: 'truck' },
    ],
    [
      'cars',
      { year: 2021, model: 'Civic', manufacturer: 'honda', type: 'sedan' },
    ],
    [
      'cars',
      { year: 2022, model: 'Accord', manufacturer: 'honda', type: 'sedan' },
    ],
    ['cars', { year: 2022, model: 'Jetta', manufacturer: 'vw', type: 'sedan' }],
    ['cars', { year: 2023, model: 'Atlas', manufacturer: 'vw', type: 'truck' }],
    ['cars', { year: 2022, model: 'Tiguan', manufacturer: 'vw', type: 'SUV' }],
  ];
  beforeAll(async () => {
    // Insert mock data for Cars and Manufacturers
    // Manufacturer - Contains name and country
    for (const [collection, data] of DATA) {
      await db.insert(collection, data);
    }
  });

  it('can handle sub queries that use variables', async () => {
    const query = db
      .query('manufacturers')
      .where([
        {
          exists: db
            .query('cars')
            .where([
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ])
            .build(),
        },
      ])
      .build();

    const result = await db.fetch(query);
    expect(result).toHaveLength(2);
  });

  it('can handle sub queries that use variables with deletes', async () => {
    const db = new DB({});
    for (const [collection, data] of DATA) {
      await db.insert(collection, data);
    }
    // Add matching data
    await db.insert('manufacturers', {
      name: 'Suburu',
      country: 'USA',
      id: 'suburu',
    });
    await db.insert('cars', {
      year: 2019,
      model: 'Outback',
      manufacturer: 'suburu',
      type: 'SUV',
    });
    // Delete a parent that would inject variables
    await db.delete('manufacturers', 'suburu');

    const query = db
      .query('manufacturers')
      .where([
        {
          exists: db
            .query('cars')
            .where([
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ])
            .build(),
        },
      ])
      .build();

    const result = await db.fetch(query, { noCache: true });
    expect(result).toHaveLength(2);
  });

  it('can handle nested subqueries', async () => {
    const query = db
      .query('cars')
      .where([
        {
          exists: db
            .query('manufacturers')
            .where([
              ['id', '=', '$manufacturer'],
              {
                exists: db
                  .query('cars')
                  .where([
                    ['type', '=', 'SUV'],
                    ['manufacturer', '=', '$id'],
                  ])
                  .build(),
              },
            ])
            .build(),
        },
      ])
      .build();

    const result = await db.fetch(query);
    // console.log('car results result', carResult);
    expect(result).toHaveLength(6);
  });

  it('can return triples with sub-queries', async () => {
    const query = db
      .query('manufacturers')
      .where([
        {
          exists: db
            .query('cars')
            .where([
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ])
            .build(),
        },
      ])
      .build();

    const result = await db.fetchTriples(query);
    const collectionsInTriples = result.reduce(
      (collectionSet, { attribute }) => {
        const collectionName = attribute[0];
        if (collectionName !== '_collection') {
          collectionSet.add(attribute[0]);
        }
        return collectionSet;
      },
      new Set()
    );
    expect(collectionsInTriples).toContain('manufacturers');
    expect(collectionsInTriples).toContain('cars');
  });

  it('can subscribe to queries with sub-queries', async () => {
    const query = db
      .query('manufacturers')
      .where([
        {
          exists: db
            .query('cars')
            .where([
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ])
            .build(),
        },
      ])
      .build();
    await testSubscription(db, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(2);
        },
      },
      {
        action: async () => {
          db.transact(async (tx) => {
            await tx.insert('manufacturers', {
              name: 'Suburu',
              country: 'USA',
              id: 'suburu',
            });
            await tx.insert('cars', {
              year: 2019,
              model: 'Outback',
              manufacturer: 'suburu',
              type: 'SUV',
            });
          });
        },
        check: (results) => {
          expect(results).toHaveLength(3);
        },
      },
      {
        action: async () => {
          await db.insert('cars', {
            year: 2023,
            model: 'CRV',
            manufacturer: 'honda',
            type: 'SUV',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(4);
        },
      },
    ]);
  });
});

describe('Subqueries in schema', () => {
  let db: DB<any>;
  beforeEach(async () => {
    db = new DB({
      schema: {
        collections: {
          departments: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              num_faculty: S.Number(),
              classes: S.RelationMany('classes', {
                where: [['department_id', '=', '$id']],
              }),
              dept_head_id: S.String(),
              dept_head: S.RelationById('faculty', '$dept_head_id'),
            }),
          },
          classes: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              level: S.Number(),
              building: S.String(),
              department_id: S.String(),
              department: S.RelationById('departments', '$department_id'),
            }),
          },
          faculty: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
            }),
          },
        },
      },
    });

    const faculty = [
      { id: '1', name: 'Dr. Smith' },
      { id: '2', name: 'Dr. Johnson' },
      { id: '3', name: 'Dr. Lee' },
      { id: '4', name: 'Dr. Brown' },
    ];
    const departments = [
      { name: 'CS', num_faculty: 5, dept_head_id: '1' },
      { name: 'Math', num_faculty: 10, dept_head_id: '2' },
      { name: 'English', num_faculty: 15, dept_head_id: '3' },
      { name: 'History', num_faculty: 10, dept_head_id: '4' },
    ];
    const classes = [
      {
        name: 'CS 101',
        level: 100,
        building: 'Warner',
        department_id: 'CS',
      },
      {
        name: 'CS 201',
        level: 200,
        building: 'Warner',
        department_id: 'CS',
      },
      {
        name: 'CS 301',
        level: 300,
        building: 'Warner',
        department_id: 'CS',
      },
      {
        name: 'Math 101',
        level: 100,
        building: 'BiHall',
        department_id: 'Math',
      },
      {
        name: 'Math 201',
        level: 200,
        building: 'BiHall',
        department_id: 'Math',
      },
      {
        name: 'Math 301',
        level: 300,
        building: 'BiHall',
        department_id: 'Math',
      },
      {
        name: 'English 101',
        level: 100,
        building: 'Twilight',
        department_id: 'English',
      },
      {
        name: 'English 201',
        level: 200,
        building: 'Twilight',
        department_id: 'English',
      },
      {
        name: 'English 301',
        level: 300,
        building: 'Twilight',
        department_id: 'English',
      },
      {
        name: 'History 101',
        level: 100,
        building: 'Voter',
        department_id: 'History',
      },
      {
        name: 'History 201',
        level: 200,
        building: 'Voter',
        department_id: 'History',
      },
      {
        name: 'History 301',
        level: 300,
        building: 'Voter',
        department_id: 'History',
      },
    ];
    for (const f of faculty) {
      await db.insert('faculty', f);
    }
    for (const department of departments) {
      await db.insert('departments', { id: department.name, ...department });
    }
    for (const cls of classes) {
      await db.insert('classes', cls);
    }
  });

  it('can query a subquery in a schema', async () => {
    // test finding all departments in a Voter
    const results = await db.fetch(
      db
        .query('departments')
        .where([['classes.building', '=', 'Voter']])
        .build()
    );

    expect(results).toHaveLength(1);
  });

  it('can query a subquery in a transaction', async () => {
    // test finding all departments in a Voter
    await db.transact(async (tx) => {
      const results = await tx.fetch(
        db
          .query('departments')
          .where([['classes.building', '=', 'Voter']])
          .build()
      );

      expect(results).toHaveLength(1);
    });
  });

  it('can query a subquery with a set attribute', async () => {
    // find classes in the CS deparment
    const results = await db.fetch(
      db
        .query('classes')
        .where([['department.name', '=', 'CS']])
        .build()
    );

    expect(results).toHaveLength(3);
  });

  it('can query a subquery within a subscription', async () => {
    // find classes in the CS deparment
    const query = db
      .query('classes')
      .where([['department.name', '=', 'CS']])
      .build();

    await testSubscription(db, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(3);
        },
      },
      {
        action: async () => {
          await db.insert('classes', {
            id: 'CS 401',
            name: 'CS 401',
            level: 400,
            building: 'Warner',
            department_id: 'CS',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(4);
        },
      },
    ]);
  });

  it('can order query by a relation', async () => {
    const query = db
      .query('classes')
      .order(['department.name', 'ASC'], ['name', 'ASC'])
      .build();
    const results = await db.fetch(query);
    const classNames = Array.from(results.values()).map(
      (result) => result.name
    );
    expect(classNames).toEqual([
      'CS 101',
      'CS 201',
      'CS 301',
      'English 101',
      'English 201',
      'English 301',
      'History 101',
      'History 201',
      'History 301',
      'Math 101',
      'Math 201',
      'Math 301',
    ]);
  });

  it('can order query by a relation - mulitple related clauses', async () => {
    const query = db
      .query('classes')
      .order(
        ['department.num_faculty', 'ASC'],
        ['department.name', 'ASC'],
        ['name', 'ASC']
      )
      .build();
    const results = await db.fetch(query);
    const classNames = Array.from(results.values()).map(
      (result) => result.name
    );
    expect(classNames).toEqual([
      'CS 101',
      'CS 201',
      'CS 301',
      'History 101',
      'History 201',
      'History 301',
      'Math 101',
      'Math 201',
      'Math 301',
      'English 101',
      'English 201',
      'English 301',
    ]);
  });

  it('can order by deep relation', async () => {
    const query = db
      .query('classes')
      .order(['department.dept_head.name', 'ASC'], ['name', 'ASC'])
      .build();
    const results = await db.fetch(query);
    const classNames = Array.from(results.values()).map(
      (result) => result.name
    );
    expect(classNames).toEqual([
      'History 101',
      'History 201',
      'History 301',
      'Math 101',
      'Math 201',
      'Math 301',
      'English 101',
      'English 201',
      'English 301',
      'CS 101',
      'CS 201',
      'CS 301',
    ]);
  });

  it('order by cardinality many will throw error', async () => {
    const query = db
      .query('departments')
      .order(['classes.name', 'ASC'])
      .build();
    await expect(db.fetch(query)).rejects.toThrow(InvalidOrderClauseError);
  });

  it('order by non leaf will throw error', async () => {
    const query = db.query('classes').order(['department', 'ASC']).build();
    await expect(db.fetch(query)).rejects.toThrow(InvalidOrderClauseError);
  });

  it('order by relation with subscription', async () => {
    const query = db
      .query('classes')
      .order(['department.name', 'ASC'], ['name', 'ASC'])
      .build();

    await testSubscription(db, query, [
      {
        check: (results) => {
          const classNames = Array.from(results.values()).map(
            (result) => result.name
          );
          expect(classNames).toEqual([
            'CS 101',
            'CS 201',
            'CS 301',
            'English 101',
            'English 201',
            'English 301',
            'History 101',
            'History 201',
            'History 301',
            'Math 101',
            'Math 201',
            'Math 301',
          ]);
        },
      },
      {
        action: async () => {
          await db.insert('classes', {
            id: 'CS 401',
            name: 'CS 401',
            level: 400,
            building: 'Warner',
            department_id: 'CS',
          });
        },
        check: (results) => {
          const classNames = Array.from(results.values()).map(
            (result) => result.name
          );
          expect(classNames).toEqual([
            'CS 101',
            'CS 201',

            'CS 301',
            'CS 401',
            'English 101',
            'English 201',
            'English 301',
            'History 101',
            'History 201',
            'History 301',
            'Math 101',
            'Math 201',
            'Math 301',
          ]);
        },
      },
    ]);
  });
});

describe('social network test', () => {
  let db: DB<any>;
  beforeAll(async () => {
    db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              friend_ids: S.Set(S.String()),
              friends: S.Query({
                collectionName: 'users',
                where: [['id', 'in', '$friend_ids']],
              }),
              posts: S.Query({
                collectionName: 'posts',
                where: [['author_id', '=', '$id']],
              }),
            }),
          },
          posts: {
            schema: S.Schema({
              id: S.String(),
              content: S.String(),
              author_id: S.String(),
              author: S.RelationById('users', '$author_id'),
            }),
          },
        },
      },
    });
    // insert sample data
    await db.insert('users', {
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
    });
    await db.insert('users', {
      id: 'user-2',
      name: 'Bob',
      friend_ids: new Set(['user-1', 'user-3']),
    });
    await db.insert('users', {
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
    });
    await db.insert('posts', {
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
    });
    await db.insert('posts', {
      id: 'post-2',
      content: 'Hello World!',
      author_id: 'user-2',
    });
    await db.insert('posts', {
      id: 'post-3',
      content: 'Hello World!',
      author_id: 'user-3',
    });
  });

  it('can query posts from friends', async () => {
    const userDb = db.withSessionVars({ USER_ID: 'user-1' });
    const query = userDb
      .query('posts')
      .where([['author.friend_ids', '=', '$session.USER_ID']])
      .build();
    const results = await userDb.fetch(query);
    expect(results).toHaveLength(2);
  });
});

describe('state vector querying', () => {
  it('respects rules when fetching after some state vector', async () => {
    const db = new DB({
      schema: {
        collections: {
          posts: {
            schema: S.Schema({
              id: S.String(),
              author_id: S.String(),
              content: S.String(),
            }),
            rules: {
              read: {
                'post-author': {
                  description: 'Users can only read posts they authored',
                  filter: [['author_id', '=', '$session.user_id']],
                },
              },
            },
          },
        },
      },
    });
    const user_id = 'user-1';
    const user_id2 = 'user-2';
    const post_id = 'post-1';
    const post_id2 = 'post-2';
    await db.insert('posts', { id: post_id, author_id: user_id, content: '' });
    await db.insert('posts', {
      id: post_id2,
      author_id: user_id2,
      content: '',
    });
    const query = db.query('posts').build();
    const userDB = db.withSessionVars({ user_id });
    const results = await userDB.fetchTriples(query);
    const resultEntities = results.reduce(
      (entitySet: Set<string>, triple: TripleRow) => {
        entitySet.add(stripCollectionFromId(triple.id));
        return entitySet;
      },
      new Set()
    );

    expect(resultEntities).toHaveLength(1);
    expect(resultEntities).toContain(post_id);

    const stateVector = triplesToStateVector(results);
    const { txId } = await db.insert('posts', {
      id: 'post-3',
      author_id: user_id2,
      content: '',
    });
    const clientStates = new Map(
      (stateVector ?? []).map(([sequence, client]) => [client, sequence])
    );
    const callback = vi.fn();
    const unsub = userDB.subscribeTriples(query, callback, () => {}, {
      stateVector: clientStates,
    });
    await pause(10);
    unsub();
    expect(callback).toHaveBeenCalledTimes(1);
    const results2 = callback.mock.calls[0][0];
    const result2Entities = results2.reduce(
      (entitySet: Set<string>, triple: TripleRow) => {
        entitySet.add(stripCollectionFromId(triple.id));
        return entitySet;
      },
      new Set()
    );
    expect(result2Entities).toHaveLength(0);
  });
  it.todo('works with relational querying', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              friend_ids: S.Set(S.String()),
              posts: S.RelationMany('posts', {
                where: [['author_id', '=', '$id']],
              }),
            }),
          },
          posts: {
            schema: S.Schema({
              id: S.String(),
              content: S.String(),
              author_id: S.String(),
            }),
          },
        },
      },
    });
    const user_id = 'user-1';
    const user_id2 = 'user-2';
    const post_id = 'post-1';
    const post_id2 = 'post-2';
    await db.insert('users', { id: user_id, name: 'Alice' });
    await db.insert('users', { id: user_id2, name: 'Bob' });
    await db.insert('posts', { id: post_id, author_id: user_id, content: '' });
    await db.insert('posts', {
      id: post_id2,
      author_id: user_id2,
      content: '',
    });
    const query = db.query('users').include('posts').build();
    const initialTriples = await db.fetchTriples(query);
    const stateVector = triplesToStateVector(initialTriples);
    await db.insert('posts', { id: 'post-3', author_id: user_id, content: '' });
    const queryStateVector = stateVector.reduce(
      (stateVector, [sequence, client]) => {
        stateVector.set(client, sequence);
        return stateVector;
      },
      new Map<string, number>()
    );
    // const afterTriples = await fetchDeltaTriplesFromStateVector(
    //   db.tripleStore,
    //   query,
    //   queryStateVector
    // );
    // TODO add expect / assertions
  });
});

describe('delta querying', async () => {
  describe('simple single collection queries', () => {
    const db = new DB({
      schema: {
        collections: {
          posts: {
            schema: S.Schema({
              id: S.String(),
              author_id: S.String(),
              content: S.String(),
            }),
          },
        },
      },
    });
    const user_id = 'user-1';
    const user_id2 = 'user-2';
    const post_id = 'post-1';
    const post_id2 = 'post-2';
    beforeEach(async () => {
      db.clear();
      await db.insert('posts', {
        id: post_id,
        author_id: user_id,
        content: '',
      });
      await db.insert('posts', {
        id: post_id2,
        author_id: user_id2,
        content: '',
      });
    });

    it('can fetch delta triples', async () => {
      const query = db.query('posts').where('author_id', '=', user_id).build();

      const addedTriples: TripleRow[] = [];
      db.tripleStore.onInsert((newTriples) => {
        addedTriples.push(...[...Object.values(newTriples)].flat());
      });
      await db.insert('posts', {
        id: 'post-3',
        author_id: user_id,
        content: '',
      });
      await db.insert('posts', {
        id: 'post-4',
        author_id: user_id2,
        content: '',
      });

      const deltaTriples = await fetchDeltaTriples(
        db,
        db.tripleStore,
        query,
        addedTriples,
        initialFetchExecutionContext(),
        {
          schema: (await db.getSchema())?.collections,
        }
      );
      expect(deltaTriples.length).toBeGreaterThan(0);
      expect(
        new Set(deltaTriples.map((triple) => stripCollectionFromId(triple.id)))
      ).toEqual(new Set(['post-3']));
    });

    it('captures deletes in delta triples', async () => {
      const query = db.query('posts').where('author_id', '=', user_id).build();

      const addedTriples: TripleRow[] = [];
      db.tripleStore.onInsert((newTriples) => {
        addedTriples.push(...[...Object.values(newTriples)].flat());
      });
      await db.delete('posts', post_id);

      const deltaTriples = await fetchDeltaTriples(
        db,
        db.tripleStore,
        query,
        addedTriples,
        initialFetchExecutionContext(),
        { schema: (await db.getSchema())?.collections }
      );
      expect(deltaTriples.length).toBeGreaterThan(0);
      expect(
        new Set(deltaTriples.map((triple) => stripCollectionFromId(triple.id)))
      ).toEqual(new Set([post_id]));
    });

    it('captures invalidated results in delta triples', async () => {
      const query = db.query('posts').where('author_id', '=', user_id).build();

      const addedTriples: TripleRow[] = [];
      db.tripleStore.onInsert((newTriples) => {
        addedTriples.push(...[...Object.values(newTriples)].flat());
      });

      await db.update('posts', post_id, async (entity) => {
        entity.author_id = user_id2;
      });
      const deltaTriples = await fetchDeltaTriples(
        db,
        db.tripleStore,
        query,
        addedTriples,
        initialFetchExecutionContext(),
        { schema: (await db.getSchema())?.collections }
      );
      expect(deltaTriples.length).toBeGreaterThan(0);
      expect(
        new Set(deltaTriples.map((triple) => stripCollectionFromId(triple.id)))
      ).toEqual(new Set([post_id]));
    });

    it('only returns relevant delta triples', async () => {
      const query = db.query('posts').where('author_id', '=', user_id).build();

      const addedTriples: TripleRow[] = [];
      db.tripleStore.onInsert((newTriples) => {
        addedTriples.push(...[...Object.values(newTriples)].flat());
      });
      await db.insert('posts', {
        id: 'post-4',
        author_id: user_id2,
        content: '',
      });
      const deltaTriples = await fetchDeltaTriples(
        db,
        db.tripleStore,
        query,
        addedTriples,
        initialFetchExecutionContext(),
        { schema: (await db.getSchema())?.collections }
      );
      expect(deltaTriples).toHaveLength(0);
    });
  });

  describe('relational queries', () => {
    const schema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            friend_ids: S.Set(S.String()),
            friends: S.RelationMany('users', {
              where: [['id', 'in', '$friend_ids']],
            }),
            posts: S.RelationMany('posts', {
              where: [['author_id', '=', '$id']],
            }),
          }),
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            content: S.String(),
            created_at: S.Date(),
            author_id: S.String(),
            author: S.RelationById('users', '$author_id'),
          }),
        },
      },
    };

    const insertSampleData = async (db) => {
      // insert some test data
      await db.insert('users', {
        id: 'user-1',
        name: 'Alice',
        friend_ids: new Set(['user-2', 'user-3']),
      });
      await db.insert('users', {
        id: 'user-2',
        name: 'Bob',
        friend_ids: new Set(['user-1', 'user-3']),
      });
      await db.insert('users', {
        id: 'user-3',
        name: 'Charlie',
        friend_ids: new Set(['user-1', 'user-2']),
      });
      await db.insert('posts', {
        id: 'post-1',
        author_id: 'user-1',
        content: '',
        created_at: new Date('2022-06-01'),
      });
      await db.insert('posts', {
        id: 'post-2',
        author_id: 'user-2',
        content: '',
        created_at: new Date('2022-01-01'),
      });
      await db.insert('posts', {
        id: 'post-3',
        author_id: 'user-3',
        content: '',
        created_at: new Date('2022-03-01'),
      });
    };

    it('can fetch delta triples', async () => {
      const db = new DB({ schema });
      await insertSampleData(db);
      const query = db
        .query('users')
        .where('posts.created_at', '>', new Date('2022-05-01'))
        .build();
      const initialTriples = await db.fetchTriples(query);
      expect(initialTriples.length).toBeGreaterThan(0);

      const addedTriples: TripleRow[] = [];
      db.tripleStore.onInsert((newTriples) => {
        addedTriples.push(...[...Object.values(newTriples)].flat());
      });

      // insert another post after the queried date
      await db.insert('posts', {
        id: 'post-4',
        author_id: 'user-2',
        content: '',
        created_at: new Date('2022-06-02'),
      });
      const fetchQuery = prepareQuery(query, schema['collections'], {});
      const deltaTriples = await fetchDeltaTriples(
        db,
        db.tripleStore,
        fetchQuery,
        addedTriples,
        initialFetchExecutionContext(),
        { schema: (await db.getSchema())?.collections }
      );
      expect(deltaTriples.length).toBeGreaterThan(0);
      expect(deltaTriples).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'posts#post-4' }),
        ])
      );
    });
    it('ignores irrelevant delta triples', async () => {
      const db = new DB({ schema });
      await insertSampleData(db);
      const query = db
        .query('users')
        .where('posts.created_at', '>', new Date('2022-05-01'))
        .build();
      const initialTriples = await db.fetchTriples(query);
      expect(initialTriples.length).toBeGreaterThan(0);

      const addedTriples: TripleRow[] = [];
      db.tripleStore.onInsert((newTriples) => {
        addedTriples.push(...[...Object.values(newTriples)].flat());
      });
      // insert another post after the queried date
      await db.insert('posts', {
        id: 'post-4',
        author_id: 'user-2',
        content: '',
        created_at: new Date('2022-01-02'),
      });

      const fetchQuery = prepareQuery(query, schema['collections'], {});
      const deltaTriples = await fetchDeltaTriples(
        db,
        db.tripleStore,
        fetchQuery,
        addedTriples,
        initialFetchExecutionContext(),
        { schema: (await db.getSchema())?.collections }
      );

      expect(deltaTriples.length).toBe(0);
    });
  });

  describe('sync queries', async () => {
    // create two databases with a shared relational schema
    const schema = {
      collections: {
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            friend_ids: S.Set(S.String()),
            friends: S.RelationMany('users', {
              where: [['id', 'in', '$friend_ids']],
            }),
            posts: S.RelationMany('posts', {
              where: [['author_id', '=', '$id']],
            }),
          }),
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            content: S.String(),
            created_at: S.Date(),
            author_id: S.String(),
            author: S.RelationById('users', '$author_id'),
          }),
        },
      },
    };
    const insertSampleData = async (db) => {
      // insert some test data
      await db.insert('users', {
        id: 'user-1',
        name: 'Alice',
        friend_ids: new Set(['user-2', 'user-3']),
      });
      await db.insert('users', {
        id: 'user-2',
        name: 'Bob',
        friend_ids: new Set(['user-1', 'user-3']),
      });
      await db.insert('users', {
        id: 'user-3',
        name: 'Charlie',
        friend_ids: new Set(['user-1', 'user-2']),
      });
      await db.insert('posts', {
        id: 'post-1',
        author_id: 'user-1',
        content: '',
        created_at: new Date('2022-06-01'),
      });
      await db.insert('posts', {
        id: 'post-2',
        author_id: 'user-2',
        content: '',
        created_at: new Date('2022-01-01'),
      });
      await db.insert('posts', {
        id: 'post-3',
        author_id: 'user-3',
        content: '',
        created_at: new Date('2022-03-01'),
      });
    };
    const QUERIES = [
      {
        query: (db) => db.query('users').build(),
        description: 'fetch all users',
      },
      {
        query: (db) =>
          db.query('posts').where('author.name', 'like', 'Alice%').build(),
        description: 'fetch all posts by users with name like Alice',
      },
      {
        description: 'Fetch posts from friends of user-1',
        query: (db) =>
          db.query('posts').where('author.friend_ids', '=', 'user-1').build(),
      },
      {
        description: 'Fetch posts from friends of Alice',
        query: (db) =>
          db
            .query('posts')
            .where('author.friends.name', 'like', 'Alice%')
            .build(),
      },
      {
        description: 'Fetch posts from friends of both Alice and Bob',
        query: (db) =>
          db
            .query('posts')
            .where(
              and([
                ['author.friends.name', 'like', 'Alice%'],
                ['author.friends.name', 'like', 'David%'],
              ])
            )
            .build(),
      },
      {
        description: 'Fetch users and include their posts',
        query: (db) => db.query('users').include('posts').build(),
      },
    ];
    describe.each(QUERIES)('$description', ({ query }) => {
      const MUTATIONS = [
        {
          description: 'insert a new user',
          action: async (db) => {
            await db.insert('users', {
              id: 'user-4',
              name: 'David',
              friend_ids: new Set(['user-1', 'user-2']),
            });
          },
        },
        {
          description: 'insert a new post',
          action: async (db) => {
            await db.insert('posts', {
              id: 'post-4',
              author_id: 'user-4',
              content: '',
              created_at: new Date('2022-06-01'),
            });
          },
        },
        {
          description: 'update a user',
          action: async (db) => {
            await db.update('users', 'user-1', (user) => {
              user.name = 'Alice Smith';
            });
          },
        },
        {
          description: 'delete a user',
          action: async (db) => {
            await db.delete('users', 'user-1');
          },
        },
        {
          description: 'delete a post',
          action: async (db) => {
            await db.delete('posts', 'post-1');
          },
        },
      ];
      it.each(MUTATIONS)('$description', async ({ action, description }) => {
        const serverDB = new DB({ schema });
        const clientDB = new DB({ schema });
        await insertSampleData(serverDB);

        const initialTriples = await serverDB.fetchTriples(query(serverDB));
        await clientDB.tripleStore.insertTriples(initialTriples);

        const addedTriples: TripleRow[] = [];
        serverDB.tripleStore.onInsert((newTriples) => {
          addedTriples.push(...[...Object.values(newTriples)].flat());
        });

        await action(serverDB);

        const fetchQuery = prepareQuery(
          query(clientDB),
          schema['collections'],
          {}
        );
        const deltaTriples = await fetchDeltaTriples(
          serverDB,
          serverDB.tripleStore,
          fetchQuery,
          addedTriples,
          initialFetchExecutionContext(),
          { schema: (await serverDB.getSchema())?.collections }
        );

        await clientDB.tripleStore.insertTriples(deltaTriples);
        const clientResults = await clientDB.fetch(query(clientDB));
        const serverResults = await serverDB.fetch(query(serverDB));
        expect(clientResults).toEqual(serverResults);
      });
    });
  });
});

/**
 * This tests the power of the query engine to handle complex relational queries
 * This test focuses on the classic graph example of aviation routes
 */
describe('Graph-like queries', () => {
  const db = new DB();
  beforeAll(async () => {
    // Insert a bunch of airplane, airport, and flights mock data
    // Airplanes - Contains a make, model, and capacity
    const airplanes = [
      { make: 'Boeing', model: '737', capacity: 200 },
      { make: 'Boeing', model: '747', capacity: 400 },
      { make: 'Airbus', model: 'A320', capacity: 200 },
      { make: 'Airbus', model: 'A380', capacity: 400 },
    ];
    for (const airplane of airplanes) {
      await db.insert('airplanes', {
        ...airplane,
        id: `${airplane.make}-${airplane.model}`,
      });
    }
    // Airports - Contains a name and location
    const airports = [
      { name: 'SFO', location: 'San Francisco, CA' },
      { name: 'LAX', location: 'Los Angeles, CA' },
      { name: 'JFK', location: 'New York, NY' },
      { name: 'ORD', location: 'Chicago, IL' },
    ];
    for (const airport of airports) {
      await db.insert('airports', airport);
    }
    // Flights - Contains a flight number, airplane, origin, and destination
    const flights = [
      {
        flight_number: 'UA-1',
        airplane: 'Boeing-737',
        origin: 'SFO',
        destination: 'JFK',
      },
      {
        flight_number: 'UA-2',
        airplane: 'Boeing-737',
        origin: 'JFK',
        destination: 'SFO',
      },
      {
        flight_number: 'UA-3',
        airplane: 'Boeing-747',
        origin: 'SFO',
        destination: 'ORD',
      },
      {
        flight_number: 'UA-4',
        airplane: 'Boeing-747',
        origin: 'ORD',
        destination: 'SFO',
      },
      {
        flight_number: 'UA-5',
        airplane: 'Airbus-A320',
        origin: 'SFO',
        destination: 'LAX',
      },
      {
        flight_number: 'UA-6',
        airplane: 'Airbus-A320',
        origin: 'LAX',
        destination: 'SFO',
      },
      {
        flight_number: 'UA-7',
        airplane: 'Airbus-A380',
        origin: 'SFO',
        destination: 'JFK',
      },
      {
        flight_number: 'UA-8',
        airplane: 'Airbus-A380',
        origin: 'JFK',
        destination: 'SFO',
      },
    ];
    for (const flight of flights) {
      await db.insert('flights', flight);
    }
  });

  it('can handle a deeply nested subquery', async () => {
    // Find all plane models that have flown to 'San Francisco, CA' from non-CA airports
    const query = db
      .query('airplanes')
      .where([
        {
          exists: db
            .query('flights')
            .where([
              ['airplane', '=', '$id'],
              {
                exists: db
                  .query('airports')
                  .where([
                    ['name', '=', '$origin'],
                    ['location', 'nlike', '%, CA'],
                    {
                      exists: db
                        .query('airports')
                        .where([
                          ['name', '=', '$destination'],
                          ['location', '=', 'San Francisco, CA'],
                        ])
                        .build(),
                    },
                  ])
                  .build(),
              },
            ])
            .build(),
        },
      ])
      .build();

    const result = await db.fetch(query);
    expect(Array.from(result.keys())).toEqual([
      'Airbus-A380',
      'Boeing-737',
      'Boeing-747',
    ]);
  });
});

describe('selecting subqueries', () => {
  const db = new DB({
    schema: {
      collections: {
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            friend_ids: S.Set(S.String()),
            liked_post_ids: S.Set(S.String()),
          }),
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            content: S.String(),
            author_id: S.String(),
            topics: S.Set(S.String()),
          }),
        },
      },
    },
  });
  beforeAll(async () => {
    await db.insert('users', {
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
      liked_post_ids: new Set(['post-1']),
    });
    await db.insert('users', {
      id: 'user-2',
      name: 'Bob',
      friend_ids: new Set(['user-1', 'user-3']),
      liked_post_ids: new Set(['post-1']),
    });
    await db.insert('users', {
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
      liked_post_ids: new Set(['post-1']),
    });
    await db.insert('posts', {
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
    await db.insert('posts', {
      id: 'post-2',
      content: 'Hello World!',
      author_id: 'user-2',
    });
    await db.insert('posts', {
      id: 'post-3',
      content: 'Hello World!',
      author_id: 'user-3',
    });
  });
  it('can select subqueries', async () => {
    const query = db
      .query('users')
      .select([
        'id',
        // {
        //   attributeName: 'posts',
        //   subquery: db
        //     .query('posts', {
        //       where: [['author_id', '=', '$id']],
        //     })
        //     .build(),
        //   cardinality: 'many',
        // },
      ])
      .include('posts', {
        subquery: db.query('posts').where('author_id', '=', '$id').build(),
        cardinality: 'many',
      })
      .build();
    const result = await db.fetch(query);
    expect(result.get('user-1')).toHaveProperty('posts');
    expect(result.get('user-1')!.posts).toHaveLength(1);
    expect(result.get('user-1')!.posts.get('post-1')).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
  });

  it('can select nested subqueries', async () => {
    const query = db
      .query('users')
      .select([
        'id',
        // {
        //   attributeName: 'posts',
        //   subquery: db
        //     .query('posts', {
        //       where: [['author_id', '=', '$id']],
        //     })
        //     .select([
        //       'id',
        //       {
        //         attributeName: 'likedBy',
        //         subquery: db
        //           .query('users', {
        //             where: [['liked_post_ids', '=', '$id']],
        //           })
        //           .build(),
        //         cardinality: 'many',
        //       },
        //     ])
        //     .build(),
        //   cardinality: 'many',
        // },
      ])
      .include('posts', {
        subquery: db
          .query('posts')
          .where('author_id', '=', '$id')
          .select(['id'])
          .include('likedBy', {
            subquery: db
              .query('users')
              .where('liked_post_ids', '=', '$id')
              .build(),
            cardinality: 'many',
          })
          .build(),
        cardinality: 'many',
      })
      .build();
    const result = await db.fetch(query);
    expect(result.get('user-1')).toHaveProperty('posts');
    expect(result.get('user-1')!.posts).toHaveLength(1);
    expect(result.get('user-1')!.posts.get('post-1')!.likedBy).toBeDefined();
    expect(result.get('user-1')!.posts.get('post-1')!.likedBy).toHaveLength(3);
  });

  it('can subscribe with subqueries', async () => {
    const query = db
      .query('users')
      .select([
        'id',
        // {
        //   attributeName: 'posts',
        //   subquery: db
        //     .query('posts', {
        //       where: [['author_id', '=', '$id']],
        //     })
        //     .build(),
        //   cardinality: 'many',
        // },
      ])
      .include('posts', {
        subquery: db.query('posts').where('author_id', '=', '$id').build(),
        cardinality: 'many',
      })
      .build();
    await testSubscription(db, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(3);
          expect(results.get('user-1')).toHaveProperty('posts');
          expect(results.get('user-1')!.posts).toHaveLength(1);
          expect(results.get('user-1')!.posts.get('post-1')).toMatchObject({
            id: 'post-1',
            content: 'Hello World!',
            author_id: 'user-1',
            topics: new Set(['comedy', 'sports']),
          });
        },
      },
      {
        action: async () => {
          await db.insert('posts', {
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(3);
          expect(results.get('user-1')).toHaveProperty('posts');
          expect(results.get('user-1')!.posts).toHaveLength(2);
          expect(results.get('user-1')!.posts.get('post-4')).toMatchObject({
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
      },
    ]);
  });

  it('can select a singleton via a subquery', async () => {
    const query = db
      .query('users')
      .select([
        'id',
        // {
        //   attributeName: 'favoritePost',
        //   subquery: db
        //     .query('posts', {
        //       where: [['author_id', '=', '$id']],
        //     })
        //     .build(),
        //   cardinality: 'one',
        // },
      ])
      .include('favoritePost', {
        subquery: db.query('posts').where('author_id', '=', '$id').build(),
        cardinality: 'one',
      })
      .build();
    const result = await db.fetch(query);
    expect(result.get('user-1')).toHaveProperty('favoritePost');
    expect(result.get('user-1')!.favoritePost).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
  });
  it('should return null or undefined if a singleton subquery has no results', async () => {
    const query = db
      .query('users')
      .select([
        'id',
        // {
        //   attributeName: 'favoritePost',
        //   subquery: db
        //     .query('posts', {
        //       where: [['author_id', '=', 'george']],
        //     })
        //     .build(),
        //   cardinality: 'one',
        // },
      ])
      .include('favoritePost', {
        subquery: db.query('posts').where('author_id', '=', 'george').build(),
        cardinality: 'one',
      })
      .build();
    const result = await db.fetch(query);
    expect(result.get('user-1')).toHaveProperty('favoritePost');
    expect(result.get('user-1')!.favoritePost).toEqual(null);
  });
});

describe('selecting subqueries from schema', () => {
  const db = new DB({
    schema: {
      collections: {
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            friend_ids: S.Set(S.String()),
            posts: S.Query({
              collectionName: 'posts' as const,
              where: [['author_id', '=', '$id']],
            }),
            friends: S.Query({
              collectionName: 'users' as const,
              where: [['id', 'in', '$friend_ids']],
            }),
            likes: S.Query({
              collectionName: 'likes' as const,
              where: [['user_id', '=', '$id']],
            }),
          }),
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            content: S.String(),
            author_id: S.String(),
            author: S.RelationById('users', '$author_id'),
            topics: S.Set(S.String()),
            likes: S.Query({
              collectionName: 'likes' as const,
              where: [['post_id', '=', '$id']],
            }),
          }),
          rules: {
            read: {
              'read your own posts': {
                filter: [['author_id', '=', '$session.USER_ID']],
              },
            },
          },
        },
        likes: {
          schema: S.Schema({
            id: S.Id(),
            user_id: S.String(),
            post_id: S.String(),
          }),
        },
      },
    },
  });

  beforeAll(async () => {
    await db.insert('users', {
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
    });
    await db.insert('users', {
      id: 'user-2',
      name: 'Bob',
      friend_ids: new Set(['user-1', 'user-3']),
    });
    await db.insert('users', {
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
    });
    await db.insert('posts', {
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
    await db.insert('posts', {
      id: 'post-2',
      content: 'Hello World!',
      author_id: 'user-2',
    });
    await db.insert('posts', {
      id: 'post-3',
      content: 'Hello World!',
      author_id: 'user-3',
    });
    await db.insert('likes', {
      id: 'like-1',
      user_id: 'user-1',
      post_id: 'post-1',
    });
    await db.insert('likes', {
      id: 'like-2',
      user_id: 'user-2',
      post_id: 'post-1',
    });
    await db.insert('likes', {
      id: 'like-3',
      user_id: 'user-3',
      post_id: 'post-1',
    });
  });

  const user1DB = db.withSessionVars({ USER_ID: 'user-1' });

  it('can select subqueries', async () => {
    const query = user1DB
      .query('users')
      .include('posts')
      .include('friends', { where: [['name', 'like', '%e']] })
      .build();

    const result = await user1DB.fetch(query);

    // Other fields are included in the selection
    expect(result.get('user-1')).toHaveProperty('name');

    expect(result.get('user-1')).toHaveProperty('posts');
    expect(result.get('user-1')!.posts).toHaveLength(1);
    expect(result.get('user-1')!.posts.get('post-1')).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
    expect(result.get('user-1')!.friends).toHaveLength(1);
    expect(result.get('user-1')!.friends.get('user-3')).toMatchObject({
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
    });
  });

  it('must use include to select subqueries', async () => {
    const query = user1DB.query('users').build();

    const result = await user1DB.fetch(query);
    expect(result.get('user-1')).not.toHaveProperty('posts');
    expect(result.get('user-1')).not.toHaveProperty('friends');
  });

  // TODO: determine if we want to support this
  it.skip('can include subqueries in fetch by id', async () => {
    const result = (await user1DB.fetchById('users', 'user-1', {
      include: { posts: null },
    }))!;
    expect(result).toHaveProperty('posts');
    expect(result.posts).toHaveLength(1);
    expect(result.posts.get('post-1')).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
  });
  it('can select subsubqueries', async () => {
    const query = user1DB
      .query('users')
      .include('posts', { include: { likes: null } })
      .build();
    const result = await user1DB.fetch(query);
    // Other fields are included in the selection
    expect(result.get('user-1')).toHaveProperty('name');
    expect(result.get('user-1')).toHaveProperty('posts');
    expect(result.get('user-1')!.posts).toHaveLength(1);
    expect(result.get('user-1')!.posts.get('post-1')).toBeDefined();
    // fails
    expect(result.get('user-1')!.posts.get('post-1')?.likes).toBeDefined();
  });
  it('should throw an error if you try to update a subquery', async () => {
    expect(
      async () =>
        await user1DB.update('users', 'user-1', async (entity) => {
          entity.likes = new Set(['like-1', 'like-2']);
        })
    ).rejects.toThrowError();
    expect(
      async () =>
        await user1DB.update('users', 'user-1', async (entity) => {
          entity.posts = { hello: 'world' };
        })
    ).rejects.toThrowError();
  });

  it('correctly applies rules to subqueries', async () => {
    {
      const result = await user1DB.fetch(user1DB.query('posts').build());
      expect(result).toHaveLength(1);
    }
    {
      const result = await user1DB.fetch(
        user1DB.query('users').include('posts').build()
      );
      expect(result).toHaveLength(3);
      expect(result.get('user-1')).toHaveProperty('posts');
      expect(result.get('user-1')!.posts).toHaveLength(1);

      expect(result.get('user-2')).toHaveProperty('posts');
      expect(result.get('user-2')!.posts).toHaveLength(0);

      expect(result.get('user-3')).toHaveProperty('posts');
      expect(result.get('user-3')!.posts).toHaveLength(0);
    }
  });

  it('skipRules option should skip rules for subqueries', async () => {
    const query = db.query('users').include('posts').build();
    {
      const results = await db.fetch(query, { skipRules: false });
      expect([...results.values()].map((user) => user.posts)).toMatchObject([
        new Map(),
        new Map(),
        new Map(),
      ]);
    }

    const results = await db.fetch(query, {
      skipRules: true,
    });
    expect(results).toHaveLength(3);
    expect(results.get('user-1')).toHaveProperty('posts');
    expect(results.get('user-1')!.posts).toHaveLength(1);
    expect(results.get('user-2')).toHaveProperty('posts');
    expect(results.get('user-2')!.posts).toHaveLength(1);
    expect(results.get('user-3')).toHaveProperty('posts');
    expect(results.get('user-3')!.posts).toHaveLength(1);
  });

  it('can select a singleton via a subquery', async () => {
    const query = user1DB.query('posts').include('author').build();
    const result = await user1DB.fetch(query);
    expect(result.get('post-1')).toHaveProperty('author');
    expect(result.get('post-1').author).toMatchObject({
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
    });
  });

  it('will return null if a singleton subquery has no results', async () => {
    const query = user1DB
      .query('posts')
      .include('author', { where: [['id', '=', 'george']] })
      .build();
    const result = await user1DB.fetch(query);
    expect(result.get('post-1')).toHaveProperty('author');
    expect(result.get('post-1').author).toEqual(null);
  });
  it('subscribe to subqueries when using entityId in query', async () => {
    const query = user1DB
      .query('users')
      .entityId('user-1')
      .include('posts')
      .build();
    await testSubscription(user1DB, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(1);
          expect(results.get('user-1')).toHaveProperty('posts');
          expect(results.get('user-1')!.posts).toHaveLength(1);
        },
      },
      {
        action: async () => {
          await user1DB.insert('posts', {
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(1);
          expect(results.get('user-1')).toHaveProperty('posts');
          expect(results.get('user-1')!.posts).toHaveLength(2);
          expect(results.get('user-1')!.posts.get('post-4')).toMatchObject({
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
      },
    ]);
  });
});

it('clearing a database resets the schema', async () => {
  const schema = {
    collections: {
      test: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
        }),
      },
    },
    version: 0,
  };
  const db = new DB({ schema });
  await db.ready;

  // Should load schema into cache
  const resultSchema = await db.getSchema();
  const cacheSchema = db.schema!;
  expect(schemaToJSON(resultSchema)).toEqual(schemaToJSON(schema));
  expect(schemaToJSON(cacheSchema)).toEqual(schemaToJSON(schema));

  await db.clear();

  // Should reset schema cache
  const schemaAfterClear = await db.getSchema();
  expect(schemaAfterClear).toEqual(undefined);
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

describe('variable conflicts', () => {
  const baseDB = new DB({
    variables: {
      name: 'CS101',
    },
    schema: {
      collections: {
        classes: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            department_id: S.String(),
            department: S.RelationById('departments', '$1.department_id'),
          }),
        },
        departments: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            head_id: S.String(),
            head: S.RelationById('faculty', '$1.head_id'),
            faculty: S.RelationMany('faculty', {
              where: [['department_id', '=', '$1.id']],
            }),
          }),
          rules: {
            write: {
              head_in_department: {
                description: 'Head must be in the department',
                filter: [['head.department_id', '=', '$0.id']],
              },
            },
          },
        },
        faculty: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            department_id: S.String(),
            department: S.RelationById('departments', '$1.department_id'),
          }),
        },
      },
    },
  });

  it('handles conflicting variable names', async () => {
    const db = baseDB.withSessionVars({ name: 'MATH101' });
    await db.insert('faculty', { id: '1', name: 'Alice', department_id: 'CS' });
    await db.insert('faculty', { id: '2', name: 'Bob', department_id: 'MATH' });
    await db.insert('faculty', {
      id: '3',
      name: 'Charlie',
      department_id: 'CS',
    });
    await db.insert('faculty', {
      id: '4',
      name: 'David',
      department_id: 'MATH',
    });
    await db.insert('departments', {
      id: 'CS',
      name: 'Computer Science',
      head_id: '1',
    });
    await db.insert('departments', {
      id: 'MATH',
      name: 'Mathematics',
      head_id: '2',
    });
    await db.insert('classes', { id: '1', name: 'CS101', department_id: 'CS' });
    await db.insert('classes', {
      id: '2',
      name: 'MATH101',
      department_id: 'MATH',
    });
    await db.insert('classes', { id: '3', name: 'CS102', department_id: 'CS' });
    await db.insert('classes', {
      id: '4',
      name: 'MATH102',
      department_id: 'MATH',
    });

    // Can query with global variables
    {
      const query = db
        .query('classes')
        .where(['name', '=', '$global.name'])
        .build();
      const result = await db.fetch(query);
      expect(result.size).toBe(1);
      expect(Array.from(result.keys())).toStrictEqual(['1']);
    }

    // Can query with session variables
    {
      const query = db
        .query('classes')
        .where(['name', '=', '$session.name'])
        .build();
      const result = await db.fetch(query);
      expect(result.size).toBe(1);
      expect(Array.from(result.keys())).toStrictEqual(['2']);
    }

    // Can query with query variables
    {
      const query = db
        .query('classes')
        .vars({ name: 'CS102' })
        .where(['name', '=', '$query.name'])
        .build();
      const result = await db.fetch(query);
      expect(result.size).toBe(1);
      expect(Array.from(result.keys())).toStrictEqual(['3']);
    }

    // Can query with subquery variables (each colletion has a 'name' field)
    {
      await db.insert('faculty', {
        id: '5',
        name: 'Eve',
        department_id: 'EVE',
      });
      await db.insert('departments', {
        id: 'EVE',
        name: 'Eve',
        head_id: '5',
      });
      await db.insert('classes', {
        id: '5',
        name: 'Eve',
        department_id: 'EVE',
      });
      await db.insert('classes', {
        id: '6',
        name: 'EVE101',
        department_id: 'EVE',
      });
      await db.insert('classes', {
        id: '7',
        name: 'EVE102',
        department_id: 'EVE',
      });

      // These are odd queries to be clear
      {
        // Classes where name of the class matches the name of the department head
        const query = db
          .query('classes')
          .where(['department.head.name', '=', '$0.name'])
          .build();
        const result = await db.fetch(query);
        expect(result.size).toBe(1);
        expect(Array.from(result.keys())).toStrictEqual(['5']);
      }

      {
        // Classes where name of the department matches the name of the department head
        const query = db
          .query('classes')
          .where(['department.head.name', '=', '$0.department.name'])
          .build();
        const result = await db.fetch(query);
        expect(result.size).toBe(3);
        expect(Array.from(result.keys())).toStrictEqual(['5', '6', '7']);
      }

      // TODO: support nested relationship paths
      {
        // Classes where name of the department head matches the name of the department head
        const query = db
          .query('classes')
          .where(['department.head.name', '=', '$0.department.head.name'])
          .build();
        console.log('\n\n RUNNING QUERY \n\n');
        const result = await db.fetch(query);
        expect(result.size).toBe(7);
      }
    }
  });

  it('can access a nested data and record types via a variable', async () => {
    const db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              address: S.Record({
                street: S.String(),
                city_id: S.String(),
              }),
              city: S.RelationById('cities', '$1.address.city_id'),
            }),
          },
          cities: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              state: S.String(),
            }),
          },
        },
      },
    });
    await db.insert('cities', { id: '1', name: 'Springfield', state: 'IL' });
    await db.insert('cities', { id: '2', name: 'Chicago', state: 'IL' });
    await db.insert('users', {
      id: '1',
      name: 'Alice',
      address: {
        street: '123 Main St',
        city_id: '1',
      },
    });
    await db.insert('users', {
      id: '2',
      name: 'Bob',
      address: {
        street: '456 Elm St',
        city_id: '2',
      },
    });

    // Access nested paths in subqueries
    {
      const query = db.query('users').select(['id']).include('city').build();
      const result = await db.fetch(query);
      expect(result.get('1')).toMatchObject({
        id: '1',
        city: { id: '1', name: 'Springfield', state: 'IL' },
      });
      expect(result.get('2')).toMatchObject({
        id: '2',
        city: { id: '2', name: 'Chicago', state: 'IL' },
      });
    }

    // Access nested paths in variables
    {
      const sessionDB = db.withSessionVars({ city: { id: '2' } });
      const query = sessionDB
        .query('users')
        .where(['address.city_id', '=', '$session.city.id'])
        .build();
      const result = await sessionDB.fetch(query);
      expect(result.size).toBe(1);
      expect(result.get('2')).toMatchObject({
        id: '2',
        name: 'Bob',
        address: {
          street: '456 Elm St',
          city_id: '2',
        },
      });
    }
  });

  describe('backwards compatibility', () => {
    it('$SESSION_USER_ID is translated to $session.SESSION_USER_ID', async () => {
      const db = new DB({
        schema: {
          collections: {
            users: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
              }),
              rules: {
                read: {
                  self_read: {
                    filter: [['id', '=', '$SESSION_USER_ID']],
                  },
                },
              },
            },
          },
        },
      });
      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });

      const aliceDB = db.withSessionVars({ SESSION_USER_ID: '1' });
      const bobDB = db.withSessionVars({ SESSION_USER_ID: '2' });
      {
        const result = await aliceDB.fetch(aliceDB.query('users').build());
        expect(result.size).toBe(1);
        expect(result.get('1')).toMatchObject({ id: '1', name: 'Alice' });
      }

      {
        const result = await bobDB.fetch(db.query('users').build());
        expect(result.size).toBe(1);
        expect(result.get('2')).toMatchObject({ id: '2', name: 'Bob' });
      }
    });
    it('rules properly reference current entity', async () => {
      const db = new DB({
        schema: {
          collections: {
            departments: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
                head_id: S.String(),
                head: S.RelationById('faculty', '$head_id'),
              }),
              rules: {
                write: {
                  head_in_department: {
                    description: 'Head must be in the department',
                    filter: [['head.department_id', '=', '$id']],
                  },
                },
              },
            },
            faculty: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
                department_id: S.String(),
              }),
            },
            posts: {
              schema: S.Schema({
                id: S.String(),
                content: S.String(),
                author_id: S.String(),
                author: S.RelationById('faculty', '$author_id'),
              }),
              rules: {
                write: {
                  current_user_posts: {
                    filter: [['author_id', '=', '$SESSION_USER_ID']],
                  },
                },
              },
            },
          },
        },
      });

      await db.insert('faculty', {
        id: '1',
        name: 'Alice',
        department_id: 'CS',
      });
      await db.insert('faculty', {
        id: '2',
        name: 'Bob',
        department_id: 'MATH',
      });

      await expect(
        db.insert('departments', {
          id: 'CS',
          name: 'Computer Science',
          head_id: '1',
        })
      ).resolves.not.toThrow();
      await expect(
        db.insert('departments', {
          id: 'MATH',
          name: 'Mathematics',
          head_id: '1',
        })
      ).rejects.toThrow(WriteRuleError);
      await expect(
        db.insert('departments', {
          id: 'MATH',
          name: 'Mathematics',
          head_id: '2',
        })
      ).resolves.not.toThrow();

      const aliceDB = db.withSessionVars({ SESSION_USER_ID: '1' });
      {
        await expect(
          aliceDB.insert('posts', { id: '1', content: 'Hello', author_id: '1' })
        ).resolves.not.toThrow();
        await expect(
          aliceDB.insert('posts', { id: '2', content: 'Hello', author_id: '2' })
        ).rejects.toThrow(WriteRuleError);
      }
    });
    it('Subqueries properly reference parent entity', async () => {
      const db = new DB({
        schema: {
          collections: {
            users: {
              schema: S.Schema({
                id: S.String(),
                name: S.String(),
                posts: S.RelationMany('posts', {
                  where: [['author_id', '=', '$id']],
                }),
              }),
            },
            posts: {
              schema: S.Schema({
                id: S.String(),
                content: S.String(),
                author_id: S.String(),
                author: S.RelationById('users', '$author_id'),
              }),
            },
          },
        },
      });

      await db.insert('users', { id: '1', name: 'Alice' });
      await db.insert('users', { id: '2', name: 'Bob' });
      await db.insert('posts', { id: '1', content: 'Hello1', author_id: '1' });
      await db.insert('posts', { id: '2', content: 'Hello2', author_id: '1' });
      await db.insert('posts', { id: '3', content: 'Hello3', author_id: '2' });
      await db.insert('posts', { id: '4', content: 'Hello4', author_id: '2' });

      {
        const result = await db.fetch(
          db.query('users').include('posts').build()
        );
        expect(result.get('1')?.posts).toStrictEqual(
          new Map([
            ['1', { id: '1', content: 'Hello1', author_id: '1' }],
            ['2', { id: '2', content: 'Hello2', author_id: '1' }],
          ])
        );
        expect(result.get('2')?.posts).toStrictEqual(
          new Map([
            ['3', { id: '3', content: 'Hello3', author_id: '2' }],
            ['4', { id: '4', content: 'Hello4', author_id: '2' }],
          ])
        );
      }

      {
        const result = await db.fetch(
          db.query('posts').include('author').build()
        );
        expect(result.get('1')?.author).toStrictEqual({
          id: '1',
          name: 'Alice',
        });
        expect(result.get('2')?.author).toStrictEqual({
          id: '1',
          name: 'Alice',
        });
        expect(result.get('3')?.author).toStrictEqual({
          id: '2',
          name: 'Bob',
        });
        expect(result.get('4')?.author).toStrictEqual({
          id: '2',
          name: 'Bob',
        });
      }
    });
  });
});
