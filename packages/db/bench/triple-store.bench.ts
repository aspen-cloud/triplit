import { InMemoryTupleStorage } from 'tuple-database';
import { describe, bench, beforeEach } from 'vitest';
import * as Document from '../src/document.js';
import { TripleStore } from '../src/triple-store.js';
import MemoryBTree from '../src/storage/memory-btree.js';
import { nanoid } from 'nanoid';
import { MemoryClock } from '../src/clocks/memory-clock.js';

const doc = {
  text: ['H', 'e', 'l', 'l', 'o', ',', ' ', 'w', 'o', 'r', 'l', 'd'],
};
const docId = 'my-doc';

const newText = ', and universe!'.split('');

const storage = new InMemoryTupleStorage();
const store = new TripleStore({ storage });
const clock = new MemoryClock();
clock.assignToStore(store);
// listenToStore(clock, store);

describe.only('array performance', () => {
  beforeEach(() => {
    storage.data = [];
  });
  bench(
    'array updates',
    async () => {
      const startText = doc.text.join('');
      store.insertTriple({
        id: docId,
        attribute: ['text'],
        value: startText,
        timestamp: await clock.getNextTimestamp(),
        expired: false,
      });
      let prevText = startText;
      for (const char of newText) {
        const ts = await clock.getNextTimestamp();
        const [{ value: chars }] = await store.findByEntity(docId);
        store.deleteTriple({
          id: docId,
          attribute: ['text'],
          value: prevText,
          timestamp: ts,
          expired: false,
        });
        const nextText = chars + char;
        store.insertTriple({
          id: docId,
          attribute: ['text'],
          value: nextText,
          timestamp: ts,
          expired: false,
        });
        prevText = nextText;
      }
      const [{ value: chars }] = await store.findByEntity(docId);
      const finalText = chars;
    },
    { iterations: 100 }
  );

  bench(
    'deconstructed updates',
    async () => {
      Document.insert(store, docId, doc);
      let i = doc.text.length;
      for (const char of newText) {
        store.insertTriple({
          id: docId,
          attribute: ['text', i++],
          value: char,
          timestamp: await clock.getNextTimestamp(),
          expired: false,
        });
      }
      // Document.get(store, docId).text.join('');
    },
    { iterations: 100 }
  );
});

describe('array vs btree performance', () => {
  // const storage = new MemoryBTree();
  // let store = new TripleStore({ storage });
  // beforeEach(() => {
  //   storage.wipe();
  // });
  bench(
    'sorted array',
    () => {
      const store = new TripleStore({ storage: new InMemoryTupleStorage() });
      testStore(store);
    },
    { iterations: 1 }
  );

  bench(
    'btree',
    () => {
      const store = new TripleStore({ storage: new MemoryBTree() });
      testStore(store);
    },
    { iterations: 1 }
  );
});

const NUM_DOCS = 5000;
const RANDOM_DOCS = new Array(NUM_DOCS).fill(null).map((_, i) => ({
  name: `Doc #${i}`,
  score: Math.floor(Math.random() * 1000),
  favoriteColor: ['red', 'green', 'blue'][Math.floor(Math.random() * 3)],
  id: i,
}));
const RANDOM_DOC_IDS_TO_DELETE = new Array(Math.floor(NUM_DOCS * 0.2))
  .fill(null)
  .map((_, i) => Math.floor(Math.random() * 100));
const COLLECTION_NAME = 'STUDENTS';
function testStore(store: TripleStore) {
  try {
    for (const doc of RANDOM_DOCS) {
      store.transact(async (tx) => {
        await Document.insert(tx, doc.id.toString(), doc, COLLECTION_NAME);
      });
    }
    for (const idToDelete of RANDOM_DOC_IDS_TO_DELETE) {
      const triple = store.findByEntity(idToDelete)[0];
      store.deleteTriple(triple);
    }
    store.findByAVE([[COLLECTION_NAME, 'score']]);
    store.findByAVE([[COLLECTION_NAME, 'favoriteColor', 'red']]);
  } catch (e) {
    console.error(e);
    throw e;
  }
}
