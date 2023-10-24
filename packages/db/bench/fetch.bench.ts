import { MemoryBTreeStorage as MemoryStorage } from '../src/storage/memory-btree.js';
import { TripleStore } from '../src/triple-store.js';
import * as Doc from '../src/document.js';
import Bench from 'tinybench';
import CollectionQuery, { fetch, fastFetch } from '../src/collection-query.js';

const bench = new Bench();

const storage = new MemoryStorage();

const store = new TripleStore({ storage });

storage.data = [];
const classes = [];
await store.transact(async (tx) => {
  for (let i = 0; i < 1000; i++) {
    // Insert a randomly generated class
    const schoolClass = {
      id: 'Class_' + i.toString(),
      level: Math.floor(Math.random() * 1000),
      name: `Class ${i}`,
    };
    classes.push(schoolClass);
    await Doc.insert(tx, schoolClass.id, schoolClass, store.clock, 'Class');
    // Insert a randomly generated student
    const student = {
      id: 'Student_' + i.toString(),
      name: `Student ${i}`,
    };
    await Doc.insert(tx, student.id, student, store.clock, 'Student');
    // Insert a randomly generated department
    const department = {
      id: 'Department_' + i.toString(),
      name: `Department ${i}`,
    };
    await Doc.insert(tx, department.id, department, store.clock, 'Department');
  }
});

console.log('done inserting');
console.log('# tuples', storage.data.length);
console.log(
  'classes that meet filter',
  classes.filter((c) => c.level < 200).length
);

bench
  .add('vanilla js', async () => {
    classes.filter((c) => c.level < 200).length;
  })
  .add('fetch', async () => {
    const results = await fetch(
      store,
      new CollectionQuery('Class').where([['level', '<', 200]])
    );
  })
  .add('fastFetch', async () => {
    const results = await fastFetch(
      store,
      new CollectionQuery('Class').where([['level', '<', 200]])
    );
  });

await bench.run();

console.table(bench.table());
