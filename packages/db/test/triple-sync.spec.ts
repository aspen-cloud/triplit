import { it, expect, describe } from 'vitest';
import DB, { CollectionNameFromModels, ModelFromModels } from '../src/db.js';
import { Models, TripleRow, TypeFromModel, Unalias } from '../src/index.js';
import {
  fetchSyncTriplesReplay,
  fetchSyncTriplesRequeryArr,
  initialFetchExecutionContext,
} from '../src/collection-query.js';
import { DurableClock } from '../src/clocks/durable-clock.js';
import { pause } from './utils/async.js';
import { Schema as S } from '../src/schema/builder.js';
import { faker } from '@faker-js/faker';
import { shuffleArray } from './utils/data.js';
import { prepareQuery } from '../src/query/prepare.js';

const SCHOOL_SCHEMA = {
  collections: {
    students: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        age: S.Number(),
        dorm: S.String(),
        classes: S.RelationMany('classes', {
          where: [['student_ids', 'has', '$1.id']],
        }),
      }),
    },
    classes: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        department_id: S.String(),
        department: S.RelationById('departments', '$1.department_id'),
        instructor_id: S.String(),
        instructor: S.RelationById('faculty', '$1.instructor_id'),
        student_ids: S.Set(S.String()),
        students: S.RelationMany('students', {
          where: [['id', 'in', '$1.student_ids']],
        }),
      }),
    },
    faculty: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        age: S.Number(),
        department_id: S.String(),
        department: S.RelationById('departments', '$1.department_id'),
        classes: S.RelationMany('classes', {
          where: [['instructor_id', '=', '$1.id']],
        }),
      }),
    },
    departments: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        classes: S.RelationMany('classes', {
          where: [['department_id', '=', '$1.id']],
        }),
        head_id: S.String(),
        head: S.RelationById('faculty', '$1.head_id'),
      }),
    },
  },
};

type SchoolSchema = typeof SCHOOL_SCHEMA.collections;

type SchemaEntity<
  M extends Models,
  CN extends CollectionNameFromModels<M>,
> = Unalias<TypeFromModel<ModelFromModels<M, CN>>>;
type Student = SchemaEntity<SchoolSchema, 'students'>;
type Class = SchemaEntity<SchoolSchema, 'classes'>;
type Faculty = SchemaEntity<SchoolSchema, 'faculty'>;
type Department = SchemaEntity<SchoolSchema, 'departments'>;

function generateStudentData(
  n: number,
  options: { overrides?: Partial<Student> } = {}
): Student[] {
  return Array.from({ length: n }, (_, i) => ({
    id: options.overrides?.id ?? faker.string.uuid(),
    name: options.overrides?.name ?? faker.person.fullName(),
    age: options.overrides?.age ?? faker.number.int({ min: 18, max: 25 }),
    dorm: options.overrides?.dorm ?? faker.location.street().split(' ')[0],
  }));
}

function generateFacultyData(
  n: number,
  options: { overrides?: Partial<Faculty> } = {}
): Faculty[] {
  return Array.from({ length: n }, (_, i) => ({
    id: options.overrides?.id ?? faker.string.uuid(),
    name: options?.overrides?.name ?? faker.person.fullName(),
  }));
}

// Log # delta triples
// Check that the client has the same results as the server
describe.each([
  { fetchSyncTriples: fetchSyncTriplesReplay },
  { fetchSyncTriples: fetchSyncTriplesRequeryArr },
])('%s', ({ fetchSyncTriples }) => {
  describe('CollectionName', () => {
    it('A client can query data in a collection', async () => {
      // setup a server db with state
      const serverClock = new DurableClock(undefined, 'server');
      const serverDB = new DB({ clock: serverClock });
      await serverDB.transact(async (tx) => {
        for (let i = 0; i < 50; i++) {
          await tx.insert('a', { id: i.toString(), name: `a-${i}` });
          await tx.insert('b', { id: i.toString(), name: `b-${i}` });
        }
      });
      // setup an empty client db
      const clientClock = new DurableClock(undefined, 'client');
      const clientDB = new DB({ clock: clientClock });

      // setup subscription
      const query = clientDB.query('a').build();
      const subFires = [];
      clientDB.subscribe(query, (results) => {
        subFires.push(results);
      });

      const stateVector = new Map<string, number>();

      let i = 0;
      async function performSync() {
        const deltaTriples = await fetchSyncTriples(
          serverDB.tripleStore,
          query,
          initialFetchExecutionContext(),
          {
            stateVector,
            session: {
              systemVars: serverDB.systemVars,
              roles: undefined,
            },
          }
        );
        console.log(`sync ${i}`, deltaTriples.length);
        updateStateVector(stateVector, deltaTriples);
        await clientDB.tripleStore.insertTriples(deltaTriples);
        i++;
        await pause();
        return deltaTriples;
      }

      // Step 1: No data, get data
      {
        await performSync();
        expect(subFires.length).toEqual(2);
        expect(subFires.at(-1).length).toEqual(50);
      }

      // Step 2: Server adds an entity in collection A
      await serverDB.insert('a', { id: '50', name: 'a-50' });
      {
        await performSync();
        expect(subFires.length).toEqual(3);
        expect(subFires.at(-1).length).toEqual(51);
      }

      // Step 3: Server deletes an entity in collection A
      await serverDB.delete('a', '0');
      {
        await performSync();
        expect(subFires.length).toEqual(4);
        expect(subFires.at(-1).length).toEqual(50);
      }

      // Step 4: Server adds an entity in collection B
      await serverDB.insert('b', { id: '50', name: 'b-50' });
      {
        await performSync();
        expect(subFires.length).toEqual(4);
        expect(subFires.at(-1).length).toEqual(50);
      }
    });
  });

  describe('Where', () => {
    it('Adding / removing an item that matches a basic where statement', async () => {
      const serverClock = new DurableClock(undefined, 'server');
      const serverDB = new DB({ clock: serverClock, schema: SCHOOL_SCHEMA });

      // Query: Get all students over 65
      // Data: 50 students, 2 over 65
      const students = shuffleArray([
        ...generateStudentData(48),
        ...generateStudentData(2, { overrides: { age: 65 } }),
      ]);
      await serverDB.transact(async (tx) => {
        for (const student of students) {
          await tx.insert('students', student);
        }
      });

      const clientClock = new DurableClock(undefined, 'client');
      const clientDB = new DB({ clock: clientClock, schema: SCHOOL_SCHEMA });

      const query = clientDB.query('students').where('age', '>=', 65).build();
      const subFires = [];
      clientDB.subscribe(query, (results) => {
        subFires.push(results);
      });
      await pause();

      const stateVector = new Map<string, number>();

      let i = 0;
      async function performSync() {
        const deltaTriples = await fetchSyncTriples(
          serverDB.tripleStore,
          query,
          initialFetchExecutionContext(),
          {
            stateVector,
            session: {
              systemVars: serverDB.systemVars,
              roles: undefined,
            },
          }
        );
        console.log(`sync ${i}`, deltaTriples.length);
        updateStateVector(stateVector, deltaTriples);
        await clientDB.tripleStore.insertTriples(deltaTriples);
        i++;
        await pause();
        return deltaTriples;
      }

      // Step 1: No data, get data
      {
        await performSync();
        expect(subFires.length).toEqual(2);
        expect(subFires.at(-1).length).toEqual(2);
      }

      // Step 2: Server adds a senior student
      await serverDB.insert('students', {
        id: '50',
        name: 'senior',
        age: 65,
        dorm: 'Hadley',
      });
      {
        await performSync();
        expect(subFires.length).toEqual(3);
        expect(subFires.at(-1).length).toEqual(3);
      }

      // Step 3: Server removes a senior student
      await serverDB.delete('students', '50');
      {
        await performSync();
        expect(subFires.length).toEqual(4);
        expect(subFires.at(-1).length).toEqual(2);
      }
    });

    it('Adding / removing an item that matches one but not all of an AND statement', async () => {
      const serverClock = new DurableClock(undefined, 'server');
      const serverDB = new DB({ clock: serverClock, schema: SCHOOL_SCHEMA });

      // Query: Get all students over 65 in dorm 'Allen'
      // Data: 50 students, 4 over 65, of which 2 are in dorm 'Allen'
      // Test: Add a student over 65 not in dorm 'Allen'
      // Check: Client should not receive the student
      // Test: Add a student in dorm 'Allen' not over 65
      // Check: Client should not receive the student
      // Test: Add a student over 65 in dorm 'Allen'
      // Check: Client should receive the student
      // Test: Edit the student to not be in dorm 'Allen'
      // Check: Client should remove the student from result
      // Test: Edit the student to be under 65
      // Check: Client should remove the student from result
      // Test: Remove the student in dorm 'Allen' over 65
      // Check: Client should remove the student from result
      const students = shuffleArray([
        ...generateStudentData(46),
        ...generateStudentData(2, { overrides: { age: 65 } }),
        ...generateStudentData(2, { overrides: { age: 65, dorm: 'Allen' } }),
      ]);
      await serverDB.transact(async (tx) => {
        for (const student of students) {
          await tx.insert('students', student);
        }
      });

      const clientClock = new DurableClock(undefined, 'client');
      const clientDB = new DB({ clock: clientClock, schema: SCHOOL_SCHEMA });

      const query = clientDB
        .query('students')
        .where('age', '>=', 65)
        .where('dorm', '=', 'Allen')
        .build();
      const subFires = [];
      clientDB.subscribe(query, (results) => {
        subFires.push(results);
      });
      await pause();

      const stateVector = new Map<string, number>();

      let i = 0;
      async function performSync() {
        const deltaTriples = await fetchSyncTriples(
          serverDB.tripleStore,
          query,
          initialFetchExecutionContext(),
          {
            stateVector,
            session: {
              systemVars: serverDB.systemVars,
              roles: undefined,
            },
          }
        );
        console.log(`sync ${i}`, deltaTriples.length);
        updateStateVector(stateVector, deltaTriples);
        await clientDB.tripleStore.insertTriples(deltaTriples);
        i++;
        await pause();
        return deltaTriples;
      }

      // Step 1: No data, get data
      {
        await performSync();
        expect(subFires.length).toEqual(2);
        expect(subFires.at(-1).length).toEqual(2);
      }

      // Step 2: Server adds a senior student not in dorm 'Allen'
      await serverDB.insert('students', {
        id: '50',
        name: 'senior',
        age: 65,
        dorm: 'Not Allen',
      });
      {
        await performSync();
        expect(subFires.length).toEqual(2);
        expect(subFires.at(-1).length).toEqual(2);
      }

      // Step 3: Server adds a student in dorm 'Allen' not over 65
      await serverDB.insert('students', {
        id: '51',
        name: 'junior',
        age: 64,
        dorm: 'Allen',
      });
      {
        await performSync();
        expect(subFires.length).toEqual(2);
        expect(subFires.at(-1).length).toEqual(2);
      }

      // Step 4: Server adds a senior student in dorm 'Allen'
      await serverDB.insert('students', {
        id: '52',
        name: 'senior',
        age: 65,
        dorm: 'Allen',
      });
      {
        await performSync();
        expect(subFires.length).toEqual(3);
        expect(subFires.at(-1).length).toEqual(3);
      }

      // Step 5: Server edits the student to not be in dorm 'Allen'
      {
        const studentMatch = await serverDB.fetchOne(query);
        await serverDB.update('students', studentMatch.id, (entity) => {
          entity.dorm = 'Not Allen';
        });
        await performSync();
        expect(subFires.length).toEqual(4);
        expect(subFires.at(-1).length).toEqual(2);
      }

      // Step 6: Server edits the student to be under 65
      {
        const studentMatch = await serverDB.fetchOne(query);
        await serverDB.update('students', studentMatch.id, (entity) => {
          entity.age = 64;
        });
        await performSync();
        expect(subFires.length).toEqual(5);
        expect(subFires.at(-1).length).toEqual(1);
      }

      // Step 7: Server removes the student in dorm 'Allen' over 65
      {
        const studentMatch = await serverDB.fetchOne(query);
        await serverDB.delete('students', studentMatch.id);
        await performSync();
        expect(subFires.length).toEqual(6);
        expect(subFires.at(-1).length).toEqual(0);
      }
    });

    it.todo('Adding/removing an item that matches both of AND');
    it.todo('Adding/removing an item that matches an OR');

    describe('Exists', () => {
      it.todo('Update an exists subquery that brings an item in to parent');
      it.todo('Update an exists subquery that brings an item out of parent');
    });

    describe('Nested exists', () => {
      it.todo('Update an exists subquery that brings an item in to parent');
      it.todo('Update an exists subquery that brings an item out of parent');
    });
  });

  describe('Order and Limit', () => {
    it.todo('Sends new data as items fill up the limit window');
    it.todo(
      'When an item is evicted from the limit widnow, updates are no longer sent'
    );
    it.todo('Deleting or invalidating filters will send backfill data');
    describe('Order by nested fields', () => {
      it.todo('Sends new data as items fill up the limit window');
      it.todo(
        'When an item is evicted from the limit widnow, updates are no longer sent'
      );
      it.todo('Deleting or invalidating filters will send backfill data');
    });
    describe('Multiple order by', () => {
      it.todo('Sends new data as items fill up the limit window');
      it.todo(
        'When an item is evicted from the limit widnow, updates are no longer sent'
      );
      it.todo('Deleting or invalidating filters will send backfill data');
    });
  });

  describe('Include', () => {
    it.todo(
      'Adding / removing an item that matches an include statement',
      async () => {
        const serverClock = new DurableClock(undefined, 'server');
        const serverDB = new DB({ clock: serverClock, schema: SCHOOL_SCHEMA });

        await serverDB.transact(async (tx) => {
          await tx.insert('students', {
            id: '1',
            name: 'Alice',
            age: 20,
            dorm: 'Hadley',
          });
          await tx.insert('students', {
            id: '2',
            name: 'Bob',
            age: 21,
            dorm: 'Hadley',
          });
          await tx.insert('students', {
            id: '3',
            name: 'Charlie',
            age: 22,
            dorm: 'Hadley',
          });
          await tx.insert('classes', {
            id: '1',
            name: 'Math',
            department_id: '1',
            instructor_id: '1',
            student_ids: new Set(['1', '2']),
          });
        });

        const clientClock = new DurableClock(undefined, 'client');
        const clientDB = new DB({ clock: clientClock, schema: SCHOOL_SCHEMA });

        const query = clientDB.query('classes').include('students').build();
        const subFires = [];
        clientDB.subscribe(query, (results) => {
          subFires.push(results);
        });
        await pause();

        const stateVector = new Map<string, number>();
        let i = 0;
        async function performSync() {
          const prepared = prepareQuery(query, SCHOOL_SCHEMA.collections, {});
          const deltaTriples = await fetchSyncTriples(
            serverDB.tripleStore,
            prepared,
            initialFetchExecutionContext(),
            {
              stateVector,
              session: {
                systemVars: serverDB.systemVars,
                roles: undefined,
              },
              schema: SCHOOL_SCHEMA.collections,
            }
          );
          console.log(`sync ${i}`, deltaTriples.length);
          updateStateVector(stateVector, deltaTriples);
          await clientDB.tripleStore.insertTriples(deltaTriples);
          i++;
          await pause();
          return deltaTriples;
        }

        // Step 1: No data, get data
        {
          await performSync();
          expect(subFires.length).toEqual(2);
          expect(subFires.at(-1).length).toEqual(1);
          expect(subFires.at(-1)[0].students.length).toEqual(2);
        }

        // Step 2: Add a student to the class

        {
          await serverDB.update('classes', '1', (entity) => {
            entity.student_ids.add('3');
          });
          await performSync();
          expect(subFires.length).toEqual(3);
          expect(subFires.at(-1).length).toEqual(1);
          expect(subFires.at(-1)[0].students.length).toEqual(3);
        }

        // Step 3: Delete a student from the class via updating the class
        {
          await serverDB.update('classes', '1', (entity) => {
            entity.student_ids.delete('2');
          });
          await performSync();
          expect(subFires.length).toEqual(4);
          expect(subFires.at(-1).length).toEqual(1);
          expect(subFires.at(-1)[0].students.length).toEqual(2);
        }

        // Step 4: Delete a student from the class via deleting the student
        {
          await serverDB.delete('students', '1');
          await performSync();
          expect(subFires.length).toEqual(5);
          expect(subFires.at(-1).length).toEqual(1);
          expect(subFires.at(-1)[0].students.length).toEqual(1);
        }
      }
    );
    it.todo('Updates to included data are sent');
    it.todo('Adding an item to a query contains included data');
    describe('Nested includes', () => {
      it.todo('Adding / removing an item that matches an include statement');
      it.todo('Updates to included data are sent');
      it.todo('Adding an item to a query contains included data');
    });
  });
});

function expectArrayItemsToMatch<T>(actual: T[], expected: T[]) {
  expect(actual.length).toEqual(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(expected).toContainEqual(actual[i]);
  }
}

// async function getStateVector(db: DB, query: CollectionQuery) {
//   const triples = await db.fetchTriples(query, { sync: true });
//   if (triples.length === 0) {
//     return undefined;
//   }
//   const stateVector = new Map<string, number>();
//   for (const triple of triples) {
//     const [tick, client] = triple.timestamp;
//     const prev = stateVector.get(client);
//     if (prev === undefined || prev < tick) {
//       stateVector.set(client, tick);
//     }
//   }
//   return stateVector;
// }

async function updateStateVector(
  stateVector: Map<string, number>,
  triples: TripleRow[]
) {
  for (const triple of triples) {
    const [tick, client] = triple.timestamp;
    const prev = stateVector.get(client);
    if (prev === undefined || prev < tick) {
      stateVector.set(client, tick);
    }
  }
}

function groupTriplesById(triples: TripleRow[]) {
  return triples.reduce<Map<string, TripleRow[]>>((acc, triple) => {
    const id = triple.id;
    const existing = acc.get(id) || [];
    existing.push(triple);
    acc.set(id, existing);
    return acc;
  }, new Map());
}
