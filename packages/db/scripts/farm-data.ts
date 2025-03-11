import { DB } from '../src/db.js';
import * as fs from 'fs';
import * as path from 'path';
import { EntityStoreWithOutbox } from '../src/entity-store-with-outbox.js';
import { EntityStoreKV } from '../src/entity-store.js';
import { schema, roles } from './farm-schema.js';
import { BTreeKVStore } from '../src/kv-store/storage/memory-btree.js';
import { SQLiteKVStore } from '../src/kv-store/storage/sqlite.js';
import { LmdbKVStore } from '../src/kv-store/storage/lmdb.js';
import sqlite from 'better-sqlite3';
import { open } from 'lmdb';
import { fileURLToPath } from 'url';
import { QueryWhere } from '../src/query.js';
const btree = new BTreeKVStore();
const sqliteDb = sqlite('./app.db');
sqliteDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = memory;
  PRAGMA mmap_size = 30000000000;
`);
const sqliteKv = new SQLiteKVStore(sqliteDb);
const lmdb = open('./lmdb', {});
const lmdbKv = new LmdbKVStore(lmdb);

const COLLECTIONS = [
  'activity_log',
  'breeding',
  'chat',
  'milk_log',
  'animals',
  'propertys',
  'companys',
  'scanning_sessions',
  'session_scans',
  'smart_sensor',
  'tasks',
  'treatment_course',
  'treatment_details',
  'treatment',
  'users',
  'vat_log',
  'views',
];
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readCollection(name: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `.data/${name}.json`)).toString()
  ).result.map(([id, data]) => data);
}

const vaccination_cutoff = new Date(
  Date.now() - 1000 * 60 * 60 * 24 * 7 * 4 * 12
).toISOString();
const newborn_cutoff = new Date(
  Date.now() - 1000 * 60 * 60 * 24 * 7 * 4 * 12
).toISOString();
async function runQueries() {
  const kvStores = [
    ['btree', btree],
    ['sqlite', sqliteKv],
    ['lmdb', lmdbKv],
  ];

  for (const [label, kv] of kvStores) {
    let db = new DB({
      clientId: 'bob',
      variables: {
        vaccination_cutoff,
        newborn_cutoff,
      },
      schema: { collections: schema, roles },
      kv,
    }).withSessionVars({
      scope: 'user 74tL5Ngr1ukDLcDlaEECK',
      sub: '59ee9408-8071-7054-2680-6c056e7ff0b7',
      companys: 'user 74tL5Ngr1ukDLcDlaEECK',
    });

    const insertions = [];
    for (const c of COLLECTIONS) {
      for (const e of readCollection(c)) {
        insertions.push(db.insert(c, e, { skipRules: true }));
      }
    }

    const timings = new Map();
    await Promise.all(insertions);

    const queries = (await db.fetch({ collectionName: 'views' })).map((v) => {
      return db.query('animals').Where(JSON.parse(v.query_data));
    });

    for (const q of queries) {
      const start = performance.now();
      const results = await db.fetch(q);
      timings.set(q, {
        time: performance.now() - start,
        results: results.length,
      });
    }

    // timings.forEach((runInfo, query) => {
    //   console.dir(query.where);
    //   console.log(
    //     `Fetched ${runInfo.results} results in ${Math.floor(runInfo.time)}ms with ${label}`
    //   );
    //   console.log('---');
    // });
    console.log(`===== ${label} =====`);
    console.table(
      Array.from(timings.entries())
        .map(([q, t]) => ({
          query: prettyPrintWhereFilters(q.where),
          time: Math.floor(t.time),
          results: t.results,
          time_per_result: t.time / t.results,
          // label,
        }))
        .toSorted((a, b) => a.time_per_result - b.time_per_result)
    );
  }
}

function prettyPrintWhereFilters(filters: QueryWhere) {
  return filters
    .map((f) => {
      if (Array.isArray(f)) {
        return f.join(' ');
      }
      return f;
      // TODO support groups
    })
    .join(' AND ');
}

runQueries();

/*
--- expected results ---

# of results | query where
------------ | -----------
5414         | unvailable_date isDefined false                                                                                     
1837         | birth_date >= $global.newborn_cutoff AND unvailable_date isDefined false                                            
1300         | all_breedings.stage = Pregnant AND unvailable_date isDefined false                                                  
1305         | milking = true AND unvailable_date isDefined false                                                                  
392          | all_breedings.stage = Joined AND unvailable_date isDefined false                                                    
1            | unvailable_date isDefined false AND milking_changes.id isDefined true AND milking = false                           
1            | unvailable_date isDefined true AND unvailable_date >= $global.newborn_cutoff                                        
0            | unvailable_date isDefined false AND treatments.id = 6_in_1_vaccinated AND birth_date <= $global.vaccination_cutoff  
0            | treatments.administered_at isDefined false AND unvailable_date isDefined false                                      
*/
