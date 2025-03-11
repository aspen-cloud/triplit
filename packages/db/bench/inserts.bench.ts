import { run, bench, boxplot, summary, lineplot } from 'mitata';
import { DB } from '../src/db.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite.js';
import sqlite from 'better-sqlite3';

// boxplot(() => {
//   summary(() => {
//     bench('Insert $size items', function* (state) {
//       const size = state.get('size');
//       const db = new DB();
//       const inserts = Array.from({ length: size }).map((_, i) => ({
//         id: Math.random().toString(36).slice(2),
//         value: i,
//       }));
//       yield async () =>
//         Promise.all(inserts.map((doc) => db.insert('mycollection', doc)));
//     })
//       .range('size', 1, Math.pow(2, 10))
//       .gc('inner');
//   });
// });

function getSqliteKVStore(storage: 'memory' | 'sqlite') {
  const GET_KV = {
    memory: () => new BTreeKVStore(),
    sqlite: () => {
      const db = sqlite(':memory:');
      new SQLiteKVStore(db);
    },
  };
  return GET_KV[storage]();
}

boxplot(() => {
  summary(() => {
    bench('Inserts ($kv)', function* (state) {
      const kvType = state.get('kv');
      const kv = getSqliteKVStore(kvType);
      const db = new DB({ kv });
      const inserts = Array.from({ length: 10_000 }).map((_, i) => ({
        id: Math.random().toString(36).slice(2),
        value: i,
      }));
      yield async () =>
        Promise.all(inserts.map((doc) => db.insert('mycollection', doc)));
    })
      .args('kv', ['memory', 'sqlite'])
      .gc('inner');
  });
});

await run();
