import Bench from 'tinybench';
import TriplitDB from '../src/db.js';

const bench = new Bench();

const db = new TriplitDB();

// insert some sample data
const NUM_INSERTS = 500;
for (let i = 0; i < NUM_INSERTS; i++) {
  db.insert('test', {
    a: Math.random() * 200,
    b: Math.random().toString(),
    c: Math.random().toString(),
  });
}

bench
  .add('fetchTriples', async () => {
    await db.fetchTriples(
      db
        .query('test')
        .where([['a', '<', 100]])
        .build()
    );
  })
  .add('fetchDeltaTriples', async () => {
    await db.fetchDeltaTriples(
      db
        .query('test')
        .where([['a', '<', 100]])
        .build(),
      undefined
    );
  });

await bench.run();

console.table(bench.table());
