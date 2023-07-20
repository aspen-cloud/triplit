import { Bench } from 'tinybench';
import { InMemoryTupleStorage } from 'tuple-database';
import MemoryBTree from '../src/storage/memory-btree';
import { TripleStore } from '../src/triple-store';
import * as Document from '../src/document';

const bench = new Bench();

const NUM_DOCS = 10;

const COLLECTION_NAME = 'STUDENTS';
const RANDOM_DOCS = new Array(NUM_DOCS).fill(null).map((_, i) => ({
  name: `Doc #${i}`,
  score: Math.floor(Math.random() * 1000),
  favoriteColor: ['red', 'green', 'blue'][Math.floor(Math.random() * 3)],
  id: i,
}));

const RANDOM_DOC_IDS_TO_DELETE = new Array(Math.floor(NUM_DOCS * 0.2))
  .fill(null)
  .map((_, i) => Math.floor(Math.random() * 100));

function testStore(store: TripleStore) {
  try {
    for (const doc of RANDOM_DOCS) {
      store.transact((tx) => {
        Document.insert(tx, doc.id, doc, tx.clock, COLLECTION_NAME);
      });
    }
    for (const idToDelete of RANDOM_DOC_IDS_TO_DELETE) {
      const triples = store.findByEntity(idToDelete);
      if (triples.length > 0) {
        const triple = triples[0];
        store.deleteTriple(triple);
      }
    }
    store.findByAVE([[COLLECTION_NAME, 'score']]);
    store.findByAVE([[COLLECTION_NAME, 'favoriteColor', 'red']]);
  } catch (e) {
    console.error(e);
    throw e;
  }
}

bench
  .add('array', () => {
    const store = new TripleStore({ storage: new InMemoryTupleStorage() });
    testStore(store);
  })
  .add('btree', () => {
    const store = new TripleStore({ storage: new MemoryBTree() });
    testStore(store);
  });

await bench.run();

console.table(bench.table());
