import { describe, bench, beforeEach, beforeAll } from 'vitest';
import { CollectionQuery, MemoryStorage } from '../src';
import { TripleStore } from '../src/triple-store.js';
import * as Doc from '../src/document.js';
import { classes, departments, students } from '../test/sample_data/school.js';
import { fetch, fastFetch } from '../src/collection-query.js';

describe('Fetch speed', () => {
  const storage = new MemoryStorage();
  const store = new TripleStore({ storage });

  beforeAll(async () => {
    storage.data = [];
    await store.transact(async (tx) => {
      //   for (let i = 0; i < 100; i++) {
      //     // Insert a randomly generated class
      //     const schoolClass = {
      //       id: 'Class_' + i.toString(),
      //       level: Math.floor(Math.random() * 1000),
      //       name: `Class ${i}`,
      //       students: [],
      //     };
      //     await Doc.insert(tx, schoolClass.id, schoolClass, store.clock, 'Class');
      //     // Insert a randomly generated student
      //     const student = {
      //       id: 'Student_' + i.toString(),
      //       name: `Student ${i}`,
      //       classes: [],
      //     };
      //     await Doc.insert(tx, student.id, student, store.clock, 'Student');
      //     // Insert a randomly generated department
      //     const department = {
      //       id: 'Department_' + i.toString(),
      //       name: `Department ${i}`,
      //       classes: [],
      //     };
      //     await Doc.insert(
      //       tx,
      //       department.id,
      //       department,
      //       store.clock,
      //       'Department'
      //     );
      //   }
      //   for (const student of students) {
      //     await Doc.insert(tx, student.id, student, store.clock, 'Student');
      //   }
      //   for (const schoolClass of classes) {
      //     await Doc.insert(tx, schoolClass.id, schoolClass, store.clock, 'Class');
      //   }
      //   for (const department of departments) {
      //     await Doc.insert(
      //       tx,
      //       department.id,
      //       department,
      //       store.clock,
      //       'Department'
      //     );
      //   }
    });
    console.log('done inserting');
  });

  bench(
    'fetch',
    async () => {
      //   console.log('store size', storage.data.length);
      //   const results = await fetch(
      //     store,
      //     new CollectionQuery('Class').where([['level', '<', 200]])
      //   );
      //   console.log('fetch', results.size);
      return null;
    },
    { iterations: 1 }
  );

  bench(
    'fastFetch',
    async () => {
      //   console.log('store size', storage.data.length);
      //   const results = await fastFetch(
      //     store,
      //     new CollectionQuery('Class').where([['level', '<', 200]])
      //   );
      //   console.log('fastFetch', results.size);
      return null;
    },
    { iterations: 1 }
  );
});
