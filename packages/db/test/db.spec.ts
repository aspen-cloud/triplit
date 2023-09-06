import { InMemoryTupleStorage } from 'tuple-database';
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
  ValueSchemaMismatchError,
  InvalidFilterError,
  DBTransaction,
  InvalidSchemaPathError,
} from '../src';
import { classes, students, departments } from './sample_data/school';
import MemoryBTree from '../src/storage/memory-btree';
import { stripCollectionFromId } from '../src/db';
import { testSubscription } from './utils/test-subscription';
import { everyFilterStatement, mapFilterStatements } from '../src/db-helpers';

// const storage = new InMemoryTupleStorage();
const storage = new MemoryBTree();

async function testDBAndTransaction(
  db: DB<any>,
  test: (db: DB<any> | DBTransaction<any>) => void | Promise<void>,
  scope: { db: boolean; tx: boolean } = { db: true, tx: true }
) {
  if (scope.db) await test(db);
  if (scope.tx)
    await db.transact(async (tx) => {
      await test(tx);
    });
}

describe('Database API', () => {
  let db: DB<any>;
  beforeEach(async () => {
    db = new DB({});
    for (const student of students) {
      await db.insert('Student', student, student.id);
    }
    for (const schoolClass of classes) {
      await db.insert('Class', schoolClass, schoolClass.id);
    }
    for (const department of departments) {
      await db.insert('Department', department, department.id);
    }
    for (const rapper of RAPPERS_AND_PRODUCERS) {
      await db.insert('Rapper', rapper, rapper.id);
    }
  });
  it('can furnish the client id', async () => {
    expect(await db.getClientId()).toBeTruthy();
  });

  it('will throw an error if the provided entity id has a # sign in it', async () => {
    expect(
      async () => await db.insert('Student', { name: 'John Doe' }, 'John#Doe')
    ).rejects.toThrowError();
    expect(
      db.transact((tx) =>
        tx.insert('Student', { name: 'John Doe' }, 'John#Doe')
      )
    ).rejects.toThrowError();
  });

  it('will throw an error when it parses an ID with a # in it', async () => {
    expect(() => stripCollectionFromId('Student#john#1')).toThrowError();
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
    { name: 'Ty Dolla $ign', id: 1 },
    { name: 'Boi-1da', id: 2 },
    { name: 'Mike Will Made-It', id: 3 },
    { name: "Noah '40' Shebib", id: 4 },
    { name: 'The Notoious B.I.G.', id: 5 },
    { name: "Travis 'LaFlame' Scott", id: 6 },
  ];

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
    ).rejects.toThrowError();
  });

  it('supports filtering on one attribute with multiple operators', async () => {
    const results = await db.fetch(
      CollectionQueryBuilder('Rapper')
        .where([
          and([
            ['id', '<', 5],
            ['id', '>=', 2],
          ]),
        ])
        .build()
    );
    const ids = [...results.values()].map((r) => r.id);
    expect(Math.max(...ids)).toBe(4);
    expect(Math.min(...ids)).toBe(2);
    expect(results.size).toBe(3);
  });

  it('throws an error when a non-terminal object path is provided', async () => {
    await db.insert('Rapper', {
      id: 7,
      name: 'Jay-Z',
      album: { name: 'The Blueprint', released: '2001' },
    });
    await expect(
      db.fetch(
        CollectionQueryBuilder('Rapper')
          .where([['album', '=', 'The Blueprint']])
          .build()
      )
    ).rejects.toThrowError();
    await expect(
      db.fetch(
        CollectionQueryBuilder('Rapper')
          .where([['album.name', '=', 'The Blueprint']])
          .build()
      )
    ).resolves.not.toThrowError();
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
});

describe('OR queries', () => {
  const db = new DB({ source: new InMemoryTupleStorage() });
  it('supports OR queries', async () => {
    // storage.data = [];
    await db.insert(
      'roster',
      { id: 1, name: 'Alice', age: 22, team: 'red' },
      1
    );
    await db.insert('roster', { id: 2, name: 'Bob', age: 23, team: 'blue' }, 2);
    await db.insert(
      'roster',
      { id: 3, name: 'Charlie', age: 22, team: 'blue' },
      3
    );
    await db.insert(
      'roster',
      { id: 4, name: 'Dennis', age: 24, team: 'blue' },
      4
    );
    await db.insert('roster', { id: 5, name: 'Ella', age: 23, team: 'red' }, 5);
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
});

describe('Register operations', () => {
  let db;
  beforeEach(async () => {
    db = new DB({ source: new InMemoryTupleStorage() });
    await db.insert('employees', { id: 1, name: 'Philip J. Fry' }, 1);
    await db.insert('employees', { id: 2, name: 'Turanga Leela' }, 2);
    await db.insert('employees', { id: 3, name: 'Amy Wong' }, 3);
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

describe('Set operations', () => {
  const schema = {
    companies: {
      attributes: S.Schema({
        id: S.Number(),
        name: S.String(),
        employees: S.Set(S.Number()),
      }),
    },
  };
  let db: DB<typeof schema>;
  beforeEach(async () => {
    storage.data = [];
    db = new DB({
      source: new InMemoryTupleStorage(),
      schema: { collections: schema },
    });
    await db.insert(
      'companies',
      { id: 1, name: 'Planet Express', employees: new Set([1, 2, 3]) },
      1
    );
    await db.insert(
      'companies',
      { id: 2, name: 'MomCorp', employees: new Set([4, 5, 6]) },
      2
    );
  });

  it('can add to set', async () => {
    const setQuery = db
      .query('companies')
      .select(['id'])
      .where('employees', '=', 7)
      .build();

    const preUpdateLookup = await db.fetch(setQuery);
    expect(preUpdateLookup).toHaveLength(0);

    await db.update('companies', 1, async (entity) => {
      await entity.employees.add(7);
    });
    const postUpdateLookup = await db.fetch(setQuery);

    expect(postUpdateLookup).toHaveLength(1);
    expect(postUpdateLookup.get('1')).toBeTruthy();
  });

  it('can remove from set', async () => {
    const setQuery = CollectionQueryBuilder(
      'companies',
      schema.companies.attributes
    )
      .select(['id'])
      .where([['employees', '=', 2]])
      .build();

    const preUpdateLookup = await db.fetch(setQuery);
    expect(preUpdateLookup).toHaveLength(1);
    expect(preUpdateLookup.get('1')).toBeTruthy();

    await db.update('companies', 1, async (entity) => {
      await entity.employees.remove(2);
      expect(entity.employees.has(2)).toBeFalsy();
    });

    const postUpdateLookup = await db.fetch(setQuery);

    expect(postUpdateLookup).toHaveLength(0);
  });
});

describe('date operations', () => {
  const storage = new InMemoryTupleStorage();
  const schema = {
    collections: {
      students: {
        attributes: S.Schema({
          id: S.String(),
          name: S.String(),
          birthday: S.Date(),
        }),
      },
    },
  };
  const db = new DB({
    source: storage,
    schema,
  });
  const defaultData = [
    { id: '1', name: 'Alice', birthday: new Date(1995, 0, 1) },
    { id: '2', name: 'Bob', birthday: new Date(2000, 0, 31) },
    { id: '3', name: 'Charlie', birthday: new Date(1990, 11, 31) },
  ];

  beforeAll(async () => {
    await Promise.all(
      defaultData.map((doc) => db.insert('students', doc, doc.id))
    );
  });

  it('can fetch dates', async () => {
    const student = await db.fetchById('students', '1');
    expect(student.birthday).toBeInstanceOf(Date);
  });
  it('can filter with equal dates', async () => {
    const query = db
      .query('students')
      .where([
        or([
          ['birthday', '=', new Date(2000, 0, 31)],
          ['birthday', '=', new Date(1990, 11, 31)],
        ]),
      ])
      .order(['birthday', 'ASC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(2);
      expect([...results.values()].map((r) => r.id)).toEqual(['3', '2']);
    });
  });
  it('can filter with not equal dates', async () => {
    const query = db
      .query('students')
      .where([['birthday', '!=', new Date(2000, 0, 31)]])
      .order(['birthday', 'DESC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(2);
      expect([...results.values()].map((r) => r.id)).toEqual(['1', '3']);
    });
  });
  it('can filter with greater or less than dates', async () => {
    const query = db
      .query('students')
      .where([
        and([
          ['birthday', '<', new Date(2000, 0, 31)],
          ['birthday', '>', new Date(1990, 11, 31)],
        ]),
      ])
      .order(['birthday', 'ASC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(1);
      expect([...results.values()].map((r) => r.id)).toEqual(['1']);
    });
  });
  it('can filter with greater/less than or equal to dates', async () => {
    const query = db
      .query('students')
      .where([
        and([
          ['birthday', '<=', new Date(2000, 0, 31)],
          ['birthday', '>=', new Date(1990, 11, 31)],
        ]),
      ])
      .order(['birthday', 'ASC'])
      .build();
    db.fetch(query).then((results) => {
      expect(results.size).toBe(3);
      expect([...results.values()].map((r) => r.id)).toEqual(['3', '1', '2']);
    });
  });
});

describe.todo('array operations');

describe('subscriptions', () => {
  let db: DB<any>;
  beforeEach(async () => {
    db = new DB({ source: new InMemoryTupleStorage() });
    const docs = [
      { id: 1, name: 'Alice', major: 'Computer Science', dorm: 'Allen' },
      { id: 2, name: 'Bob', major: 'Biology', dorm: 'Battell' },
      { id: 3, name: 'Charlie', major: 'Computer Science', dorm: 'Battell' },
      { id: 4, name: 'David', major: 'Math', dorm: 'Allen' },
      { id: 5, name: 'Emily', major: 'Biology', dorm: 'Allen' },
    ];
    await Promise.all(docs.map((doc) => db.insert('students', doc, doc.id)));
  });

  it('handles selection updates', async (done) => {
    return new Promise<void>(async (resolve, reject) => {
      let i = 0;
      const assertions = [
        (data) => expect(data.get('1').major).toBe('Computer Science'),
        (data) => {
          try {
            expect(data.get('1').major).toBe('Math');
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      ];

      const unsubscribe = db.subscribe(
        CollectionQueryBuilder('students')
          .select(['major'])
          .where([['name', '=', 'Alice']])
          .build(),
        async (students) => {
          assertions[i](students);
          i++;
        }
      );
      setTimeout(async () => {
        await db.update('students', 1, async (entity) => {
          entity.major = 'Math';
        });
        await unsubscribe();
      }, 20);
    });
  });

  it('handles data entering query', async () => {
    let i = 0;
    const assertions = [
      (data) => expect(data.size).toBe(2),
      (data) => expect(data.size).toBe(3),
    ];
    const unsubscribe = db.subscribe(
      CollectionQueryBuilder('students')
        .select(['name', 'major'])
        .where([['dorm', '=', 'Battell']])
        .build(),
      (students) => {
        assertions[i](students);
        i++;
      }
    );

    await db.update('students', '1', async (entity) => {
      entity.dorm = 'Battell';
    });

    await unsubscribe();
  });

  it('can subscribe to Triples', async () => {
    let i = 0;
    const assertions = [
      (data) => expect(data.length).toBe(10),
      (data) => expect(data.length).toBe(5),
    ];
    const unsubscribe = db.subscribeTriples(
      CollectionQueryBuilder('students')
        .select(['name', 'major'])
        .where([['dorm', '=', 'Battell']])
        .build(),
      (students) => {
        assertions[i](students);
        i++;
      }
    );

    await db.update('students', '1', async (entity) => {
      entity.dorm = 'Battell';
    });

    await unsubscribe();
  });

  it('handles data leaving query', async () => {
    return new Promise<void>(async (resolve, reject) => {
      let i = 0;
      const assertions = [
        (data) => expect(data.size).toBe(3),
        (data) => {
          try {
            expect(data.size).toBe(2);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      ];

      const unsubscribe = db.subscribe(
        CollectionQueryBuilder('students')
          .select(['name', 'dorm'])
          .where([['dorm', '=', 'Allen']])
          .build(),
        (students) => {
          assertions[i](students);
          i++;
        }
      );

      await db.update('students', '1', async (entity) => {
        entity.dorm = 'Battell';
      });

      await unsubscribe();
    });
  });

  it('data properly backfills with order and limit', () => {
    return new Promise<void>(async (resolve, reject) => {
      let i = 0;
      const assertions = [
        (data) => expect(data.size).toBe(2), // initial data
        (data) => expect(data.size).toBe(2), // backfills after delete
        (data) => expect(data.size).toBe(1), // cant backfill, no more matching data
        (data) => {
          try {
            expect(data.size).toBe(0); // handles down to zero
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      ];

      const unsubscribe = db.subscribe(
        CollectionQueryBuilder('students')
          .limit(2)
          // .order(['major', 'ASC'])
          .order('major', 'ASCasdf')
          .where([['dorm', '=', 'Allen']])
          .build(),
        (students) => {
          assertions[i](students);
          i++;
        }
      );

      await db.update('students', '1', async (entity) => {
        entity.dorm = 'Battell';
      });

      await db.update('students', '4', async (entity) => {
        entity.dorm = 'Battell';
      });

      await db.update('students', '5', async (entity) => {
        entity.dorm = 'Battell';
      });

      await unsubscribe();
    });
  });

  it('handles order and limit', async () => {
    return new Promise<void>(async (resolve, reject) => {
      let i = 0;
      let LIMIT = 2;
      const assertions = [
        (data) => {
          expect(data.size).toBe(LIMIT);
          expect([...data.values()].map((r) => r.major)).toEqual([
            'Biology',
            'Biology',
          ]);
        },
        (data) => {
          try {
            expect(data.size).toBe(LIMIT);
            expect([...data.values()].map((r) => r.major)).toEqual([
              'Astronomy',
              'Biology',
            ]);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      ];

      const unsubscribe = db.subscribe(
        CollectionQueryBuilder('students')
          .limit(2)
          .order(['major', 'ASC'])
          .build(),
        (students) => {
          assertions[i](students);
          i++;
        }
      );

      await db.insert(
        'students',
        { id: 6, name: 'Frank', major: 'Astronomy', dorm: 'Allen' },
        '6'
      );

      await unsubscribe();
    });
  });

  it('maintains order in subscription', async () => {
    const db = new DB({ source: new InMemoryTupleStorage() });
    return new Promise<void>(async (resolve, reject) => {
      let i = 0;
      const assertions = [
        (data) => expect(Array.from(data.keys())).toEqual([]),
        (data) => expect(Array.from(data.keys())).toEqual(['1']),
        (data) => expect(Array.from(data.keys())).toEqual(['2', '1']),
        (data) => expect(Array.from(data.keys())).toEqual(['2', '1', '3']),
        (data) => expect(Array.from(data.keys())).toEqual(['2', '1', '4', '3']),
        (data) => expect(Array.from(data.keys())).toEqual(['2', '4', '1', '3']),
        (data) => expect(Array.from(data.keys())).toEqual(['2', '1', '3']),
        (data) => expect(Array.from(data.keys())).toEqual(['2', '1']),
        (data) => expect(Array.from(data.keys())).toEqual(['1']),
        (data) => expect(Array.from(data.keys())).toEqual([]),
      ];

      const unsubscribe = db.subscribe(
        CollectionQueryBuilder('students')
          .where([['deleted', '=', false]])
          .order(['age', 'ASC'])
          .build(),
        (students) => {
          try {
            assertions[i](students);
            i++;
            if (i === assertions.length) {
              resolve();
            }
          } catch (e) {
            reject(e);
          }
        }
      );

      // Add to result set (at beginning, end, inbetween)
      await db.insert(
        'students',
        { id: 1, name: 'Alice', age: 30, deleted: false },
        '1'
      );
      await db.insert(
        'students',
        { id: 2, name: 'Bob', age: 21, deleted: false },
        '2'
      );
      await db.insert(
        'students',
        { id: 3, name: 'Charlie', age: 35, deleted: false },
        '3'
      );
      await db.insert(
        'students',
        { id: 4, name: 'Alice', age: 32, deleted: false },
        '4'
      );

      // reorder
      await db.update('students', '4', async (entity) => {
        entity.age = 29;
      });

      // remove from result set (at beginning, end, inbetween)
      await db.update('students', '4', async (entity) => {
        entity.deleted = true;
      });
      await db.update('students', '3', async (entity) => {
        entity.deleted = true;
      });
      await db.update('students', '2', async (entity) => {
        entity.deleted = true;
      });
      await db.update('students', '1', async (entity) => {
        entity.deleted = true;
      });

      await unsubscribe();
    });
  });

  it('can subscribe to just triples', async () => {
    return new Promise<void>(async (resolve, reject) => {
      let i = 0;
      let LIMIT = 2;
      const assertions = [
        (data) => {
          expect(data).toHaveLength(LIMIT * 5);
        },
        (data) => {
          try {
            expect(data).toHaveLength(5);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      ];

      const unsubscribe = db.subscribeTriples(
        CollectionQueryBuilder('students')
          .limit(2)
          .order(['major', 'ASC'])
          .build(),
        (students) => {
          assertions[i](students);
          i++;
        }
      );

      await db.insert(
        'students',
        { id: 6, name: 'Frank', major: 'Astronomy', dorm: 'Allen' },
        '6'
      );

      await unsubscribe();
    });
  });
});

describe('single entity subscriptions', async () => {
  const storage = new InMemoryTupleStorage();
  const db = new DB({
    source: storage,
    schema: {
      collections: {
        students: {
          attributes: S.Schema({
            id: S.String(),
            name: S.String(),
            major: S.String(),
            dorm: S.String(),
          }),
        },
      },
    },
  });
  const defaultData = [
    { id: '1', name: 'Alice', major: 'Computer Science', dorm: 'Allen' },
    { id: '2', name: 'Bob', major: 'Biology', dorm: 'Battell' },
    { id: '3', name: 'Charlie', major: 'Computer Science', dorm: 'Battell' },
    { id: '4', name: 'David', major: 'Math', dorm: 'Allen' },
    { id: '5', name: 'Emily', major: 'Biology', dorm: 'Allen' },
  ];
  beforeEach(async () => {
    await db.clear();
  });
  // 3) update other entities and not have it fire

  it('can subscribe to an entity', async () => {
    await Promise.all(
      defaultData.map((doc) => db.insert('students', doc, doc.id))
    );
    await testSubscription(db, db.query('students').entityId('3').build(), [
      {
        check: (results) => {
          const entity = results.get('3');
          expect(entity).toBeDefined();
          expect(results.size).toBe(1);
          expect(entity.id).toBe('3');
        },
      },
      {
        action: async (results) => {
          await db.transact(async (tx) => {
            await tx.update('students', '3', async (entity) => {
              entity.major = 'sociology';
            });
          });
        },
        check: (results) => {
          expect(results.get('3').major).toBe('sociology');
        },
      },
    ]);
  });
  it("can should return nothing if the entity doesn't exist, and then update when it is inserted and deleted", async () => {
    await Promise.all(
      defaultData.map((doc) => db.insert('students', doc, doc.id))
    );
    await testSubscription(db, db.query('students').entityId('6').build(), [
      {
        check: (results) => {
          const entity = results.get('6');
          expect(entity).not.toBeDefined();
          expect(results.size).toBe(0);
        },
      },
      {
        action: async (results) => {
          await db.transact(async (tx) => {
            await tx.insert(
              'students',
              {
                id: '6',
                name: 'Helen',
                major: 'Virtual Reality',
                dorm: 'Painter',
              },
              '6'
            );
          });
        },
        check: (results) => {
          const entity = results.get('6');
          expect(entity).toBeDefined();
          expect(results.size).toBe(1);
          expect(entity.id).toBe('6');
        },
      },
      {
        action: async () => {
          const allTriples = await db.tripleStore.findByEntity();
          await db.tripleStore.deleteTriples(allTriples);
        },
        check: (results) => {
          const entity = results.get('6');
          expect(entity).not.toBeDefined();
        },
      },
    ]);
  });
  it('should only fire updates when the entity in question is affected', async () => {
    await Promise.all(
      defaultData.map((doc) => db.insert('students', doc, doc.id))
    );
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').entityId('3').build(), spy);
      setTimeout(() => {
        expect(spy).toHaveBeenCalledOnce();
        resolve();
      }, 50);
    });
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').entityId('3').build(), spy);
      await db.transact(async (tx) => {
        await tx.update('students', '1', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.transact(async (tx) => {
        await tx.update('students', '2', async (entity) => {
          entity.major = 'sociology';
        });
      });
      setTimeout(() => {
        expect(spy).toHaveBeenCalledOnce();
        resolve();
      }, 50);
    });
    await new Promise<void>(async (resolve) => {
      const spy = vi.fn();
      db.subscribe(db.query('students').entityId('3').build(), spy);
      await db.transact(async (tx) => {
        await tx.update('students', '1', async (entity) => {
          entity.major = 'sociology';
        });
      });
      await db.transact(async (tx) => {
        await tx.update('students', '3', async (entity) => {
          entity.major = 'sociology';
        });
      });
      setTimeout(() => {
        expect(spy).toHaveBeenCalledTimes(2);
        resolve();
      }, 50);
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
  await db.insert('students', { name: 'Alice', major: 'Computer Science' }, 1);
  await db.insert('students', { name: 'Bill', major: 'Biology' }, 2);
  await db.insert('students', { name: 'Cam', major: 'Computer Science' }, 3);

  await db.insert(
    'bands',
    { name: 'The Beatles', genre: 'Rock', founded: 1960 },
    1
  );
  await db.insert('bands', { name: 'NWA', genre: 'Hip Hop', founded: 1986 }, 2);
  await db.insert(
    'bands',
    { name: 'The Who', genre: 'Rock', founded: 1964 },
    3
  );
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
          attributes: S.Schema({
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

  it('order by multiple properties', async () => {
    const descendingScoresResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'ASC'], ['date', 'DESC'])
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
    expect(firstPageResults.size).toBe(5);
    const areAllScoresDescending = Array.from(firstPageResults.values()).every(
      (result, i, arr) => {
        if (i === 0) return true;
        const previousScore = arr[i - 1].score;
        const currentScore = result.score;
        return previousScore >= currentScore;
      }
    );
    expect(areAllScoresDescending).toBeTruthy();

    const lastDoc = [...firstPageResults.entries()][4];

    const secondPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'DESC'])
        .limit(5)
        .after([lastDoc[1].score, lastDoc])
        .build()
    );

    const areAllScoresDescendingAfterSecondPage = [
      ...firstPageResults.values(),
      ...secondPageResults.values(),
    ].every((result, i, arr) => {
      if (i === 0) return true;
      const previousScore = arr[i - 1].score;
      const currentScore = result.score;
      return previousScore >= currentScore;
    });

    expect(secondPageResults.size).toBe(5);
    expect(areAllScoresDescendingAfterSecondPage).toBeTruthy();
  });

  it('can paginate ASC', async () => {
    const firstPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'ASC'])
        .limit(5)
        .build()
    );
    expect(firstPageResults.size).toBe(5);
    const areAllScoresAscending = Array.from(firstPageResults.values()).every(
      (result, i, arr) => {
        if (i === 0) return true;
        const previousScore = arr[i - 1].score;
        const currentScore = result.score;
        return previousScore <= currentScore;
      }
    );
    expect(areAllScoresAscending).toBeTruthy();

    const lastDoc = [...firstPageResults.entries()][4];

    const secondPageResults = await db.fetch(
      CollectionQueryBuilder('TestScores')
        .order(['score', 'ASC'])
        .limit(5)
        .after([lastDoc[1].score, lastDoc])
        .build()
    );

    const areAllScoresAscendingAfterSecondPage = [
      ...firstPageResults.values(),
      ...secondPageResults.values(),
    ].every((result, i, arr) => {
      if (i === 0) return true;
      const previousScore = arr[i - 1].score;
      const currentScore = result.score;
      return previousScore <= currentScore;
    });

    expect(secondPageResults.size).toBe(5);
    expect(areAllScoresAscendingAfterSecondPage).toBeTruthy();
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
            attributes: S.Schema({
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
            attributes: S.Schema({
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
            attributes: S.Schema({
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    const DOC_ID = 'my-score';
    await db.insert(
      'TestScores',
      {
        score: 80,
        date: '2023-04-16',
      },
      DOC_ID
    );
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
      await tx.insert(
        'TestScores',
        {
          score: 80,
          date: '2023-04-16',
        },
        '1'
      );
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
            attributes: S.Schema({
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
    await db.insert(
      'TestScores',
      {
        score: 80,
        date: '2023-04-16',
      },
      'score-1'
    );
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
            attributes: S.Schema({
              score: S.Number(),
              date: S.String(),
            }),
          },
        },
      },
    });
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
});

describe('schema changes', async () => {
  it('can add a collection definition to the schema', async () => {
    // const schema = {};
    const db = new DB({ source: new InMemoryTupleStorage() });
    await db.createCollection({
      name: 'students',
      attributes: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
    });
    const schema = await db.getSchema();
    expect(schema?.collections).toHaveProperty('students');
    expect(schema?.collections.students.attributes.properties).toHaveProperty(
      'id'
    );
    expect(schema?.collections.students.attributes.properties).toHaveProperty(
      'name'
    );
  });

  it('can drop a collection definition from the schema', async () => {
    const schema = {
      collections: {
        students: {
          attributes: S.Schema({
            id: S.Number(),
            name: S.String(),
          }),
        },
      },
    };
    const db = new DB({ source: new InMemoryTupleStorage(), schema: schema });
    const dbSchemaBefore = await db.getSchema();
    expect(dbSchemaBefore?.collections).toHaveProperty('students');
    await db.dropCollection({ name: 'students' });
    const dbSchemaAfter = await db.getSchema();
    expect(dbSchemaAfter?.collections).not.toHaveProperty('students');

    // TODO: test data is actually dropped if we decide it should be
  });

  it('can rename an attribute', async () => {
    const schema = {
      collections: {
        students: {
          attributes: S.Schema({
            id: S.Number(),
            name: S.String(),
          }),
        },
      },
    };
    const db = new DB({ source: new InMemoryTupleStorage(), schema: schema });
    await db.insert('students', { id: 1, name: 'Alice' }, 1);
    await db.renameAttribute({
      collection: 'students',
      path: 'id',
      newPath: 'studentId',
    });
    const dbSchema = await db.getSchema();
    expect(dbSchema?.collections).toHaveProperty('students');
    expect(dbSchema?.collections.students.attributes.properties).toHaveProperty(
      'studentId'
    );
    expect(dbSchema?.collections.students.attributes.properties).toHaveProperty(
      'name'
    );
    const query = db
      .query('students')
      .where([['studentId', '=', 1]])
      .build();
    const result = await db.fetch(query);
    expect(result).toHaveLength(1);
    expect(result.get('1').studentId).toEqual(1);
  });

  it('can add an attribute', async () => {
    const schema = {
      collections: {
        students: {
          attributes: S.Schema({
            id: S.Number(),
            name: S.String(),
          }),
        },
      },
    };
    const db = new DB({ source: new InMemoryTupleStorage(), schema: schema });
    await db.insert('students', { id: 1, name: 'Alice' }, 1);
    await db.addAttribute({
      collection: 'students',
      path: 'age',
      attribute: { type: 'number' },
    });
    const dbSchema = await db.getSchema();
    expect(dbSchema?.collections).toHaveProperty('students');
    expect(dbSchema?.collections.students.attributes.properties).toHaveProperty(
      'age'
    );
    expect(dbSchema?.collections.students.attributes.properties).toHaveProperty(
      'name'
    );
  });

  it('can drop an attribute', async () => {
    const schema = {
      collections: {
        students: {
          attributes: S.Schema({
            id: S.Number(),
            name: S.String(),
          }),
        },
      },
    };
    const db = new DB({ source: new InMemoryTupleStorage(), schema: schema });
    await db.insert('students', { id: 1, name: 'Alice' }, 1);
    await db.dropAttribute({ collection: 'students', path: 'id' });
    const dbSchema = await db.getSchema();
    expect(dbSchema?.collections).toHaveProperty('students');
    expect(
      dbSchema?.collections.students.attributes.properties
    ).not.toHaveProperty('id');
    expect(dbSchema?.collections.students.attributes.properties).toHaveProperty(
      'name'
    );

    // TODO: test data is actually dropped if we decide it should be
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
            attributes: {
              id: { type: 'number' },
              name: { type: 'string' },
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
            attributes: {
              id: { type: 'number' },
              department: { type: 'string' },
            },
          },
        ],
      ],
      down: [['drop_collection', { name: 'classes' }]],
    },
  ];
  it('initializing a DB with migrations sets the schema', async () => {
    const db = new DB({ migrations });
    const dbSchema = await db.getSchema();
    expect(dbSchema?.collections).toHaveProperty('students');
    expect(dbSchema?.collections).toHaveProperty('classes');
    expect(dbSchema?.version).toEqual(2);
  });
  it('will stop migrating on an error and rollback changes', async () => {
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
    const dbSchema = await db.getSchema();
    expect(dbSchema?.collections).toHaveProperty('students');
    expect(dbSchema?.collections).not.toHaveProperty('classes');
    expect(dbSchema?.version).toEqual(1);
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
            attributes: S.Schema({
              id: S.Number(),
              name: S.String(),
            }),
          },
        },
      };
      const storage = new InMemoryTupleStorage();
      const db = new DB({ source: storage, schema: schema });
      await db.insert('students', { id: 1, name: 'Alice' }, 1);

      expect(storage.data.length).not.toBe(0);

      await db.clear();

      expect(storage.data.length).toBe(0);
    });
  });
});

describe('DB Variables', () => {
  const storage = new InMemoryTupleStorage();
  const DEPARTMENT = 'dep-1';
  const db = new DB({
    source: storage,
    variables: {
      DEPARTMENT,
    },
  });

  const classesInDep = classes.filter((c) => c.department === DEPARTMENT);

  beforeAll(async () => {
    await db.transact(async (tx) => {
      for (const cls of classes) {
        await tx.insert('classes', cls);
      }
    });
  });

  it('can use variables in simple query', async () => {
    const query = db
      .query('classes')
      .where([['department', '=', '$DEPARTMENT']])
      .build();
    const result = await db.fetch(query);
    expect(result).toHaveLength(classesInDep.length);
    expect(
      [...result.values()].every((r) => r.department === DEPARTMENT)
    ).toBeTruthy();
  });

  it('can use variables in query with simple grouped filter', async () => {
    const query = db
      .query('classes')
      .where([{ mod: 'and', filters: [['department', '=', '$DEPARTMENT']] }])
      .build();
    const result = await db.fetch(query);
    expect(result).toHaveLength(classesInDep.length);
    expect(
      [...result.values()].every((r) => r.department === DEPARTMENT)
    ).toBeTruthy();
  });

  it('can use variables in query deeply nested grouped filter', async () => {
    const query = db
      .query('classes')
      .where([
        {
          mod: 'and',
          filters: [
            {
              mod: 'and',
              filters: [
                { mod: 'and', filters: [['department', '=', '$DEPARTMENT']] },
              ],
            },
          ],
        },
      ])
      .build();
    const result = await db.fetch(query);
    expect(result).toHaveLength(classesInDep.length);
    expect(
      [...result.values()].every((r) => r.department === DEPARTMENT)
    ).toBeTruthy();
  });

  it('works in a transaction', async () => {
    const query = db
      .query('classes')
      .where([{ mod: 'and', filters: [['department', '=', '$DEPARTMENT']] }])
      .build();
    await db.transact(async (tx) => {
      const result = await tx.fetch(query);
      expect(result).toHaveLength(classesInDep.length);
      expect(
        [...result.values()].every((r) => r.department === DEPARTMENT)
      ).toBeTruthy();
    });
  });

  it('can update global variables', async () => {
    const query = db
      .query('classes')
      .where([['department', '=', '$DEPARTMENT']])
      .build();
    const preUpdateResult = await db.fetch(query);
    expect(preUpdateResult.size).toBe(3);

    db.updateVariables({ DEPARTMENT: 'dep-2' });

    const postUpdateResult = await db.fetch(query);
    expect(postUpdateResult.size).toBe(2);
  });

  it('can provide variables via a query', async () => {
    const query = db
      .query('classes')
      .where([['department', '=', '$DEPARTMENT']]);

    const builtQuery1 = query.vars({ DEPARTMENT: 'dep-1' }).build();
    const builtQuery2 = query.vars({ DEPARTMENT: 'dep-2' }).build();

    const result1 = await db.fetch(builtQuery1);
    const result2 = await db.fetch(builtQuery2);

    expect(result1.size).toBe(3);
    expect(result2.size).toBe(2);
  });

  it.todo('supports updating variables with active subscriptions');
});

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
        attributes: {
          id: { type: 'string' },
          name: { type: 'string' },
          level: { type: 'number' },
          department: { type: 'string' },
          enrolled_students: { type: 'set_string' },
        },
        rules: {
          read: [
            {
              description: "Students can only view classes they're enrolled in",
              filter: [['enrolled_students', '=', '$user_id']],
            },
          ],
        },
      });

      await db.transact(async (tx) => {
        for (const cls of classes) {
          await tx.insert(
            'classes',
            {
              ...cls,
              enrolled_students: new Set(cls.enrolled_students),
            },
            cls.id
          );
        }
      });
    });

    it('fetch: filters results based on rules', async () => {
      const query = db.query('classes').build();
      await testDBAndTransaction(db, async (db) => {
        const results = await db.fetch(query);
        const classesWithStudent2 = classes.filter((cls) =>
          cls.enrolled_students.includes(USER_ID)
        );
        expect(results).toHaveLength(classesWithStudent2.length);
      });
    });

    it('fetch: doesnt filter rules if skipRules is set', async () => {
      const query = db.query('classes').build();
      await testDBAndTransaction(db, async (db) => {
        const results = await db.fetch(query, { skipRules: true });
        expect(results).toHaveLength(classes.length);
      });
    });

    it('fetchOne: filters results based on rules', async () => {
      await testDBAndTransaction(db, async (db) => {
        const nonEnrolledClass = await db.fetchById('classes', 'class-2');
        expect(nonEnrolledClass).toBeNull();
        const enrolledClass = await db.fetchById('classes', 'class-1');
        expect(enrolledClass).not.toBeNull();
      });
    });

    it('fetchOne: doesnt filter rules if skipRules is set', async () => {
      await testDBAndTransaction(db, async (db) => {
        const nonEnrolledClass = await db.fetchById('classes', 'class-2', {
          skipRules: true,
        });
        expect(nonEnrolledClass).not.toBeNull();
        const enrolledClass = await db.fetchById('classes', 'class-1', {
          skipRules: true,
        });
        expect(enrolledClass).not.toBeNull();
      });
    });

    it('filters results in subscriptions', async () => {
      return new Promise<void>((resolve, reject) => {
        const classesWithStudent = classes.filter((cls) =>
          cls.enrolled_students.includes(USER_ID)
        );
        let callbackNum = 0;
        const assertionSteps = [
          {
            check: (results: Map<string, any>) => {
              expect(results).toHaveLength(classesWithStudent.length);
            },
          },
          {
            update: async () => {
              const classId = `class-5`;
              db.insert('classes', {
                id: classId,
                name: 'Another class for student 2',
                level: 300,
                department: 'dep-2',
                enrolled_students: new Set([
                  'student-1',
                  'student-3',
                  USER_ID,
                  'student-5',
                ]),
              });
            },
            check: (results: Map<string, any>) => {
              expect(results).toHaveLength(classesWithStudent.length + 1);
            },
          },
          {
            update: async () => {
              const classId = `class-6`;
              db.insert('classes', {
                id: classId,
                name: 'NOT A class for student 2',
                level: 200,
                department: 'dep-3',
                enrolled_students: new Set([
                  'student-1',
                  'student-3',
                  'student-5',
                ]),
              });
            },
            check: (results: Map<string, any>) => {
              expect(results).toHaveLength(classesWithStudent.length + 1);
            },
          },
        ];
        db.subscribe(db.query('classes').build(), (results) => {
          assertionSteps[callbackNum].check(results);
          callbackNum++;
          if (
            assertionSteps[callbackNum] &&
            assertionSteps[callbackNum].update
          ) {
            // @ts-ignore
            assertionSteps[callbackNum].update();
          }
          if (callbackNum >= assertionSteps.length) {
            resolve();
          }
        });
      });
    });
  });
  describe('Insert', () => {
    let db: DB<undefined>;
    const USER_ID = 'the-user-id';
    beforeAll(async () => {
      db = new DB({
        storage: new MemoryBTree(),
        variables: {
          user_id: USER_ID,
        },
      });

      await db.createCollection({
        name: 'posts',
        attributes: {
          id: { type: 'string' },
          author_id: { type: 'string' },
        },
        rules: {
          write: [
            {
              description: 'Users can only post posts they authored',
              filter: [['author_id', '=', '$user_id']],
            },
          ],
        },
      });
    });

    describe('insert single', () => {
      it('can insert an entity that matches the filter', async () => {
        expect(
          db.insert('posts', { id: 'post-1', author_id: USER_ID }, 'post-1')
        ).resolves.not.toThrowError();
      });

      it("throws an error when inserting a obj that doesn't match filter", async () => {
        expect(
          db.insert(
            'posts',
            { id: 'post-1', author_id: 'Not-the-current-user' },
            'post-2'
          )
        ).rejects.toThrowError();
      });
    });

    describe('insert in transaction', () => {
      it('can insert an entity that matches the filter', async () => {
        expect(
          db.transact(async (tx) => {
            await tx.insert(
              'posts',
              { id: 'post-1', author_id: USER_ID },
              'post-1'
            );
          })
        ).resolves.not.toThrowError();
      });

      it("throws an error when inserting a obj that doesn't match filter", async () => {
        expect(
          db.transact(async (tx) => {
            await tx.insert(
              'posts',
              { id: 'post-1', author_id: 'Not-the-current-user' },
              'post-2'
            );
          })
        ).rejects.toThrowError();
      });
    });
  });

  describe('Update', () => {
    let db: DB<any>;
    const USER_ID = 'the-user-id';
    const POST_ID = 'post-1';
    beforeAll(async () => {
      db = new DB({
        storage: new MemoryBTree(),
        variables: {
          user_id: USER_ID,
        },
      });

      await db.createCollection({
        name: 'posts',
        attributes: {
          id: { type: 'string' },
          author_id: { type: 'string' },
          content: { type: 'string' },
        },
        rules: {
          write: [
            {
              description: 'Users can only post posts they authored',
              filter: [['author_id', '=', '$user_id']],
            },
          ],
        },
      });

      await db.insert(
        'posts',
        { id: POST_ID, author_id: USER_ID, content: 'before' },
        POST_ID
      );
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
          db.update('posts', POST_ID, async (entity) => {
            entity.author_id = 'not me';
          })
        ).rejects.toThrowError(WriteRuleError);
        const post = await db.fetchById('posts', POST_ID);
        expect(post.author_id).not.toBe('not me');
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
      },
    };

    it('can insert an entity with nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data, id);
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
        await db.insert('Businesses', data, id);
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
        await db.insert('Businesses', data, id);
      }

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
    });

    it('can select specific nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data, id);
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
    let db;
    beforeEach(async () => {
      db = new DB({
        schema: {
          collections: {
            Businesses: {
              attributes: S.Schema({
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
          },
        },
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

    it('can insert an entity with nested properties', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data, id);
      }

      const query = db.query('Businesses').entityId(ENTITY_ID).build();
      const result = (await db.fetch(query)).get(ENTITY_ID);
      expect(result.address.street.number).toBe('123');
      expect(result.address.street.name).toBe('Main St');
      expect(result.address.city).toBe('San Francisco');
      expect(result.address.state).toBe('CA');
    });

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
      ).rejects.toThrowError(InvalidSchemaPathError);

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
      ).rejects.toThrowError(ValueSchemaMismatchError);
    });

    it('can query based on nested property', async () => {
      for (const [id, data] of Object.entries(defaultData)) {
        await db.insert('Businesses', data, id);
      }

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
    });
  });
});

it('throws an error if a register filter is malformed', async () => {
  const db = new DB({
    schema: {
      collections: {
        Classes: {
          attributes: S.Schema({
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
  await db.tripleStore.deleteMetadataTuples([['_schema']]);
  await expect(db.fetch(query)).rejects.toThrowError(InvalidFilterError);
});

describe('subscription errors', () => {
  it.todo('passes query errors to the callback', async () => {});
  it('handles errors in callback', () => {
    const db = new DB({
      schema: {
        collections: {
          Classes: {
            attributes: S.Schema({
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
