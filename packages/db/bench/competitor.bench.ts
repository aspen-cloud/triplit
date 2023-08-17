import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import Bench from 'tinybench';
import DB from '../src/db';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { MemoryStorage } from '../src';
import { MemoryBTree } from '../src/storage/memory-btree';
import { fetch } from '../src/collection-query';
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

const triplit = new DB({ source: new MemoryBTree() });

await rxdb.collections.classes.bulkInsert(CLASSES);

await triplit.transact(async (tx) => {
  for (const cls of CLASSES) {
    await tx.insert('classes', cls, cls.id);
  }
});

const expectedClassCount = CLASSES.filter((c) => c.level < 200).length;

const controller = new AbortController();

const bench = new Bench({ signal: controller.signal });

function logAndThrowError(msg: string) {
  console.error(msg);
  throw new Error(msg);
}

bench
  .add('vanilla js query', async () => {
    CLASSES.filter((c) => c.level < 200).length;
  })
  .add('rxdb query', async () => {
    let resp = await rxdb.collections.classes
      .find()
      .where('level')
      .lt(200)
      .exec();
    resp = resp.map((doc) => doc.toJSON());
    if (resp.length !== expectedClassCount)
      logAndThrowError('RXDB: Wrong result count');
  })
  .add('triplit query', async () => {
    const resp = await triplit.fetch(
      triplit
        .query('classes')
        .where([['level', '<', 200]])
        .build()
    );
    if (resp.size !== expectedClassCount)
      logAndThrowError(
        `Triplit: Wrong result count. Expected ${expectedClassCount}, got ${resp.size}}`
      );
  })
  .add('triplit w/ triples query', async () => {
    const resp = await fetch(
      triplit.tripleStore,
      triplit
        .query('classes')
        .where([['level', '<', 200]])
        .build(),
      { includeTriples: true }
    );
    if (resp.results.size !== expectedClassCount)
      logAndThrowError(
        `Triplit: Wrong result count. Expected ${expectedClassCount}, got ${resp.size}}`
      );
  })
  .add('triple-store attribute index query', async () => {
    const allLevels = await triplit.tripleStore.findByAVE([
      ['classes', 'level'],
    ]);

    const resp = allLevels.filter((trip) => trip.value < 200);
    if (resp.length !== expectedClassCount)
      logAndThrowError('Triple Store: Wrong result count');
  })
  .add('triple-store entities index query', async () => {
    const allClasses = await triplit.tripleStore.getEntities('classes');
    try {
      const resp = [...allClasses.values()].filter(
        (trip) => trip.level && trip.level[0] < 200
      );
      if (resp.length !== expectedClassCount)
        logAndThrowError(
          `Triple Store Entities: Wrong result count. Expected ${expectedClassCount}, got ${resp.length}`
        );
    } catch (e) {
      logAndThrowError(e.message);
    }
  });

bench.addEventListener('error', (e) => {
  console.error(e);
  controller.abort();
});
await bench.run();

console.table(bench.table());
