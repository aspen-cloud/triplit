import type { Database, Transaction, Statement } from 'better-sqlite3';
import { MemoryTransaction } from '../transactions/memory-tx.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';
import { decodeTuple, encodeTuple, Tuple } from '../../codec.js';
import { STATEMENTS, DEFAULT_PRAGMA } from '../utils/sqlite.js';
import { ScopedKVStore } from '../utils/scoped-store.js';
import sqlite from 'better-sqlite3';

type SQLiteKVState = {
  tableCreated: boolean;
  statements: {
    get: Statement;
    set: Statement;
    delete: Statement;
    deleteRange: Statement;
    scan: Statement;
    scanValues: Statement;
    count: Statement;
    countRange: Statement;
    truncate: Statement;
  };
  transactions: {
    write: Transaction;
  };
};

/**
 * Performance notes:
 * - WITHOUT ROWID makes our range scans pretty fast in SQLite
 * - With large data / scans, the bottleneck becomes getting data into javascript in the correct format
 *  - stmt.pluck(true) the `value` column in the scan query (if you dont need the key value) to just get a string array right off the bat
 *  - patch better-sqlite3 to parse JSON values directly (seems possible, could add some api to know which strings should be parsed that way)
 *    - Saves us the cost of SQLite -> string -> JSON.parse()
 */

export class SQLiteKVStore implements KVStore {
  private statements: SQLiteKVState['statements'];
  private transactions: SQLiteKVState['transactions'];

  db: Database;

  // NOTE: string constructor is rarely used and MAY be dangerous because it actually brings in sqlite dep
  constructor(databasePath: string);
  constructor(database: Database);
  constructor(arg0: string | Database) {
    if (typeof arg0 === 'string') {
      this.db = sqlite(arg0);
    } else {
      this.db = arg0;
    }
    /**
     * Docs: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/unsafe.md#unsafe-mode
     *
     * I think we are getting errors during scoping because we'll try to run the create table query while possibly we are iterating over a scan separately
     * Optimally we can refactor this to only create table initially and eval if we can drop unsafe mode
     *
     * TODO: we now only run createTable when needed, eval unsafeMode (might need for subquery evaluation)
     */
    this.db.unsafeMode(true);
    this.db.exec(DEFAULT_PRAGMA);
    this.createTable();
    this.statements = {
      get: this.db.prepare(STATEMENTS.get),
      set: this.db.prepare(STATEMENTS.set),
      delete: this.db.prepare(STATEMENTS.delete),
      deleteRange: this.db.prepare(STATEMENTS.deleteRange),
      scan: this.db.prepare(STATEMENTS.scan),
      scanValues: this.db.prepare(STATEMENTS.scanValues),
      count: this.db.prepare(STATEMENTS.count),
      countRange: this.db.prepare(STATEMENTS.countRange),
      truncate: this.db.prepare(STATEMENTS.truncate),
    };
    this.transactions = {
      write: this.db.transaction(
        (sets: Iterable<[Tuple, any]>, deletes: Iterable<Tuple>) => {
          // TODO: prefix application?
          for (const key of deletes) {
            const encodedKey = encodeTuple(key);
            this.freeStatement(this.statements.delete).run(encodedKey);
            // deleteQuery.run(encodedKey);
          }
          for (const [key, value] of sets) {
            const encodedKey = encodeTuple(key);
            const encodedValue = JSON.stringify(value);
            this.freeStatement(this.statements.set).run(
              encodedKey,
              encodedValue
            );
            // insertQuery.run(encodedKey, encodedValue);
          }
        }
      ),
    };
  }

  private createTable() {
    /**
     * Create the table if it doesn't exist.
     *
     * We use `WITHOUT ROWID` to create a clustered index on the `key` column to improve locality during range scans.
     */
    const createTableQuery = this.db.prepare(STATEMENTS.createTable);

    // Make sure the table exists.
    createTableQuery.run();
  }

  /**
   * If a statement is busy, we will prepare a new one to use temporarily
   * A statement may be busy if it is being iterated over (and we are performing a subquery on top of tha=7890-)
   * A further optimzation would be to use a pool of statements or a stack of statements
   * If we start to notice `prepare` taking up time in the profiler, we should probably do that
   */
  private freeStatement(statement: Statement) {
    if (!statement.busy) return statement;
    return this.db.prepare(statement.source);
  }

  get(key: Tuple, scope?: Tuple): Promise<any> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    const result: any = this.freeStatement(this.statements.get).get(encodedKey);
    return Promise.resolve(result ? JSON.parse(result.value) : undefined);
  }

  set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    const encodedValue = JSON.stringify(value);
    this.freeStatement(this.statements.set).run(encodedKey, encodedValue);
    return Promise.resolve();
  }

  delete(key: Tuple, scope?: Tuple): Promise<void> {
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    this.freeStatement(this.statements.delete).run(encodedKey);
    return Promise.resolve();
  }

  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = this.freeStatement(this.statements.scan).iterate(low, high);
    for await (const row of results) {
      // @ts-expect-error
      const key = decodeTuple(row.key);
      const prefixLength = (scope?.length ?? 0) + options.prefix.length;
      const keyWithoutPrefix = prefixLength > 0 ? key.slice(prefixLength) : key;
      if (keyWithoutPrefix.length === 0) continue;
      yield [
        keyWithoutPrefix,
        JSON.parse(
          // @ts-expect-error
          row.value
        ),
      ];
    }
  }

  async *scanValues(options: ScanOptions, scope?: Tuple): AsyncIterable<any> {
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = this.freeStatement(this.statements.scanValues)
      .pluck()
      .iterate(low, high);
    for (const row of results) {
      yield JSON.parse(
        // @ts-expect-error
        row
      );
    }
  }

  count(options: CountOptions, scope?: Tuple): Promise<number> {
    const fullPrefix = scope ? [...scope, ...options.prefix] : options.prefix;
    if (!fullPrefix.length) {
      return this.freeStatement(this.statements.count)
        .pluck()
        .get() as Promise<number>;
    }
    const low = encodeTuple(fullPrefix);
    const high = low + '\uffff';
    return this.freeStatement(this.statements.countRange)
      .pluck()
      .get(low, high) as Promise<number>;
  }

  async clear(scope?: Tuple): Promise<void> {
    // if we know that this is not a scoped store, we can just delete everything
    if (!scope?.length) {
      this.freeStatement(this.statements.truncate).run();
      return;
    }
    const low = encodeTuple(scope);
    const high = low + '\uffff';
    this.freeStatement(this.statements.deleteRange).run(low, high);
  }

  scope(scope: Tuple): KVStore {
    return new ScopedKVStore(this, scope);
  }

  transact(): KVStoreTransaction {
    return new MemoryTransaction(this);
  }

  // Needs to be interable
  async applyEdits(
    sets: AsyncIterable<[Tuple, any]> | Iterable<[Tuple, any]>,
    deletes: AsyncIterable<Tuple> | Iterable<Tuple>
  ): Promise<void> {
    const accumulatedSets: [Tuple, any][] = [];
    const accumulatedDeletes: Tuple[] = [];
    for await (const edit of sets) {
      accumulatedSets.push(edit);
    }
    for await (const del of deletes) {
      accumulatedDeletes.push(del);
    }
    this.transactions.write(accumulatedSets, accumulatedDeletes);
    return Promise.resolve();
  }
}
