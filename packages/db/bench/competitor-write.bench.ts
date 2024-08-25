import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import Bench from 'tinybench';
import { DB, Timestamp, TripleRow } from '../src/index.js';
import { Schema as S } from '../src/schema/builder.js';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import {
  MemoryBTreeStorage as MemoryBTree,
  MemoryBTreeStorage,
} from '../src/storage/memory-btree.js';
import {
  AsyncTupleDatabase,
  AsyncTupleDatabaseClient,
  transactionalReadWriteAsync,
  TupleDatabase,
  TupleDatabaseClient,
} from '@triplit/tuple-database';
import BTree from 'sorted-btree';
import * as tv from '@triplit/tuple-database/dist/helpers/sortedTupleValuePairs.js';

addRxPlugin(RxDBQueryBuilderPlugin);
const BTreeClass = (BTree.default ? BTree.default : BTree) as typeof BTree;

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

function TripleRowOptimized(
  entityId: string,
  attribute: string[],
  value: any,
  timestamp: Timestamp,
  expired: boolean
) {
  this.id = entityId;
  this.attribute = attribute;
  this.value = value;
  this.timestamp = timestamp;
  this.expired = expired;
}

const CLASSES = new Array(100).fill(0).map((_, i) => ({
  id: i.toString(),
  level: Math.floor(Math.random() * 1000),
  name: `Class ${i}`,
}));

const txId: Timestamp = [1, 'vF1xJCyUdN0Wlqi8EY655'];
const txIdStr = JSON.stringify(txId);
const CLASSES_TRIPLES: TripleRow[][] = CLASSES.map((cls) => [
  ...Object.entries(cls).map<TripleRow>(
    ([k, v]) =>
      new TripleRowOptimized(
        `classes#${cls.id}`,
        ['classes', k],
        v,
        txId,
        false
      )
  ),
  new TripleRowOptimized(
    `classes#${cls.id}`,
    ['_collection'],
    'classes',
    txId,
    false
  ),
  // ...Object.entries(cls).map<TripleRow>(([k, v]) => ({
  //   id: `classes#${cls.id}`,
  //   attribute: ['classes', k],
  //   value: v,
  //   timestamp: txId,
  //   expired: false,
  // })),
  // {
  //   id: `classes#${cls.id}`,
  //   attribute: ['_collection'],
  //   value: 'classes',
  //   timestamp: txId,
  //   expired: false,
  // },
]);

const triplit = new DB({
  source: new MemoryBTree(),
  // schema: {
  //   version: 0,
  //   collections: {
  //     classes: {
  //       schema: S.Schema({
  //         id: S.String(),
  //         level: S.Number(),
  //         name: S.String(),
  //       }),
  //     },
  //   },
  // },
});
await triplit.ready;

const expectedClassCount = CLASSES.filter((c) => c.level < 200).length;

const controller = new AbortController();

const bench = new Bench({ signal: controller.signal });

function logAndThrowError(msg: string) {
  console.error(msg);
  throw new Error(msg);
}

// // Time first inserts for each bench
// {
//   const now = performance.now();
//   for (const cls of CLASSES) {
//     await rxdb.collections.classes.upsert(cls);
//   }
//   console.log(
//     `rxdb first insert ${CLASSES.length} classes: ${performance.now() - now}ms`
//   );
// }
// {
//   const now = performance.now();
//   for (const cls of CLASSES) {
//     await triplit.insert('classes', cls);
//   }
//   console.log(
//     `triplit first insert ${CLASSES.length} classes: ${
//       performance.now() - now
//     }ms`
//   );
// }

// const tupleDb = new AsyncTupleDatabaseClient(
//   new AsyncTupleDatabase(new MemoryBTreeStorage())
// );

bench
  .add('tuple db triples - append to current', async () => {
    const tupleDb = new AsyncTupleDatabaseClient(
      new AsyncTupleDatabase(new MemoryBTreeStorage())
    );
    await transactionalReadWriteAsync()(async (tx) => {
      for (const cls of CLASSES_TRIPLES) {
        const existingTxWrites = tv.scan(tx.writes.set, {
          prefix: ['client', 'inbox', txId],
          limit: 1,
        });

        if (existingTxWrites.length > 0) {
          const write = existingTxWrites[0]!;
          tx.set(['inbox', txId], [...write.value, ...cls]);
        } else {
          tx.set(['inbox', txId], cls);
        }
      }
    })(tupleDb);
  })
  .add('tuple db triples - tuple per triple', async () => {
    const tupleDb = new AsyncTupleDatabaseClient(
      new AsyncTupleDatabase(new MemoryBTreeStorage())
    );
    const flatClasses: TripleRow[] = [];
    await transactionalReadWriteAsync()(async (tx) => {
      for (const cls of CLASSES_TRIPLES) {
        flatClasses.push(...cls);
      }
      for (const trip of flatClasses) {
        tx.set(['client', 'inbox', txIdStr, trip.id], trip);
      }
    })(tupleDb);
  })
  .add('tuple db triples - single tx tuple flat array', async () => {
    const tupleDb = new AsyncTupleDatabaseClient(
      new AsyncTupleDatabase(new MemoryBTreeStorage())
    );
    const flatClasses: TripleRow[] = [];
    await transactionalReadWriteAsync()(async (tx) => {
      for (const cls of CLASSES_TRIPLES) {
        flatClasses.push(...cls);
      }
      tx.set(['inbox', txId], flatClasses);
    })(tupleDb);
  })
  .add('triplit bulk', async () => {
    const triplit = new DB();
    await triplit.transact(async (tx) => {
      for (const cls of CLASSES) {
        await tx.insert('classes', cls);
      }
    });
  })
  .add('triplit bulk triples', async () => {
    const triplit = new DB();
    await triplit.tripleStore.transact(async (tx) => {
      for (const cls of CLASSES_TRIPLES) {
        await tx.insertTxTriples(cls, txIdStr);
      }
    });
  });

// .add('vanilla js map', async () => {
//   const db = new Map(CLASSES.map((cls) => [cls.id, cls]));
// })
// .add('TupleDB', async () => {
//   const tx = tupleDb.transact();
//   for (const cls of CLASSES) {
//     tx.set(['classes', cls.id], cls);
//   }
//   await tx.commit();
// })
// .add('Btree', async () => {
//   const btree = new BTreeClass();
//   for (const cls of CLASSES) {
//     btree.set(cls.id, cls);
//   }
// })
// .add('rxdb bulk', async () => {
//   await rxdb.collections.classes.bulkInsert(CLASSES);
// })
// .add('rxdb', async () => {
//   try {
//     for (const cls of CLASSES) {
//       await rxdb.collections.classes.upsert(cls);
//     }
//   } catch (e) {
//     logAndThrowError(e.message);
//   }
// })
// .add('triplit', async () => {
//   for (const cls of CLASSES) {
//     await triplit.insert('classes', cls);
//   }
// })
// .add('triplit bulk', async () => {
//   const triplit = new DB();
//   await triplit.transact(async (tx) => {
//     for (const cls of CLASSES) {
//       await tx.insert('classes', cls);
//     }
//   });
// });

bench.addEventListener('error', (e) => {
  console.error(e);
  controller.abort();
});

await bench.run();
console.table(bench.table());
