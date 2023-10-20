import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import Bench from 'tinybench';
import DB from '../src/db.js';
import { Schema as S } from '../src/schema.js';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import MemoryBTree from '../src/storage/memory-btree.js';
addRxPlugin(RxDBQueryBuilderPlugin);

const rxdb = await createRxDatabase({
  name: 'exampledb',
  storage: getRxStorageMemory(),
});

await rxdb.addCollections({
  classes: {
    schema: {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        level: { type: 'number' },
        name: { type: 'string' },
      },
    },
  },
});

const CLASSES = new Array(1000).fill(0).map((_, i) => ({
  id: i.toString(),
  level: Math.floor(Math.random() * 1000),
  name: `Class ${i}`,
}));

const triplit = new DB({
  source: new MemoryBTree(),
  schema: {
    version: 0,
    collections: {
      classes: {
        schema: S.Schema({
          id: S.String(),
          level: S.Number(),
          name: S.String(),
        }),
      },
    },
  },
});

await rxdb.collections.classes.bulkInsert(CLASSES);

try {
  await triplit.transact(async (tx) => {
    for (const cls of CLASSES) {
      await tx.insert('classes', cls, cls.id);
    }
  });
  console.log('done inserting into triplit');
} catch (e) {
  console.error(e);
}

const expectedClassCount = CLASSES.filter((c) => c.level < 200).length;

const controller = new AbortController();

const bench = new Bench({ signal: controller.signal });

function logAndThrowError(msg: string) {
  console.error(msg);
  throw new Error(msg);
}

// Measure first run of each query

// TRIPLIT
let start = performance.now();
await triplit.fetch(
  triplit
    .query('classes')
    .vars({ level: 200 })
    .where([['level', '=', `$level`]])
    .build()
);
let end = performance.now();
console.log(`Triplit first query: ${end - start}ms`);

// RXDB
start = performance.now();
await rxdb.collections.classes.find().where('level').eq(200).exec();
end = performance.now();
console.log(`RxDB first query: ${end - start}ms`);

// Measure second run of each query
start = performance.now();
await triplit.fetch(
  triplit
    .query('classes')
    .vars({ level: 100 })
    .where([['level', '=', `$level`]])
    .build()
);
end = performance.now();
console.log(`Triplit second query: ${end - start}ms`);

// RXDB
start = performance.now();
await rxdb.collections.classes.find().where('level').eq(100).exec();
end = performance.now();
console.log(`RxDB second query: ${end - start}ms`);

bench
  .add('vanilla js query', async () => {
    const level = Math.floor(Math.random() * 1000);
    // const level = 200;
    const resp = CLASSES.filter((c) => c.level < level);
    // if (resp.length !== CLASSES.filter((c) => c.level === level).length) {
    //   logAndThrowError('RXDB: Wrong result count');
    // }
  })
  .add('rxdb query', async () => {
    const level = Math.floor(Math.random() * 1000);
    // const level = 200;
    let resp = await rxdb.collections.classes
      .find()
      .where('level')
      .lt(level)
      .exec();
    resp = resp.map((doc) => doc.toJSON());
    // if (resp.length !== CLASSES.filter((c) => c.level === level).length) {
    //   logAndThrowError('RXDB: Wrong result count');
    // }
  })
  .add('triplit query', async () => {
    const level = Math.floor(Math.random() * 1000);
    // const level = 200;
    const resp = await triplit.fetch(
      triplit
        .query('classes')
        .vars({ level })
        .where([['level', '<', `$level`]])
        .build()
    );
    // if (resp.size !== CLASSES.filter((c) => c.level === level).length)
    //   logAndThrowError(
    //     `Triplit: Wrong result count. Expected ${expectedClassCount}, got ${resp.size}}`
    //   );
  });

bench.addEventListener('error', (e) => {
  console.error(e);
  controller.abort();
});

await bench.run();
console.table(bench.table());
