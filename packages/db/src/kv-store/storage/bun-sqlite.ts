import { decodeTuple, encodeTuple, Tuple } from '../../codec.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';
import { Database, type Statement } from 'bun:sqlite';
import {
  parseSqliteKvStoreOptions,
  SQLiteKVStoreOptions,
  STATEMENTS,
  walSizeGuard,
} from '../utils/sqlite.js';
import { ScopedKVStore } from '../utils/scoped-store.js';
import { MemoryTransaction } from '../transactions/memory-tx.js';

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
    write: CallableFunction;
  };
};

export class BunSQLiteKVStore implements KVStore {
  db: Database;
  private statements: SQLiteKVState['statements'];
  private transactions: SQLiteKVState['transactions'];
  private walGuard?: NodeJS.Timer;

  constructor(databasePath: string, options?: SQLiteKVStoreOptions);
  constructor(database: Database, options?: SQLiteKVStoreOptions);
  constructor(arg0: string | Database, options: SQLiteKVStoreOptions = {}) {
    if (typeof arg0 === 'string') {
      this.db = new Database(arg0, { create: true });
    } else {
      this.db = arg0;
    }
    const parsedOptions = parseSqliteKvStoreOptions(options);
    this.db.exec(parsedOptions.pragma);
    this.createTable();
    this.statements = {
      get: this.db.query(STATEMENTS.get),
      set: this.db.query(STATEMENTS.set),
      delete: this.db.query(STATEMENTS.delete),
      deleteRange: this.db.query(STATEMENTS.deleteRange),
      scan: this.db.query(STATEMENTS.scan),
      scanValues: this.db.query(STATEMENTS.scanValues),
      count: this.db.query(STATEMENTS.count),
      countRange: this.db.query(STATEMENTS.countRange),
      truncate: this.db.query(STATEMENTS.truncate),
    };
    this.transactions = {
      write: this.db.transaction(
        (sets: Iterable<[Tuple, any]>, deletes: Iterable<Tuple>) => {
          for (const key of deletes) {
            const encodedKey = encodeTuple(key);
            this.freeStatement(this.statements.delete).run(encodedKey);
          }
          for (const [key, value] of sets) {
            const encodedKey = encodeTuple(key);
            const encodedValue = JSON.stringify(value);
            this.freeStatement(this.statements.set).run(
              encodedKey,
              encodedValue
            );
          }
        }
      ),
    };
    this.walGuard = this.startWalGuard(parsedOptions);
  }

  private startWalGuard(options: Required<SQLiteKVStoreOptions>) {
    if (this.walGuard) {
      clearInterval(this.walGuard);
    }
    const dbPath = this.db.filename;
    const walFile = `${dbPath}-wal`;
    const walCheck = setInterval(() => {
      walSizeGuard(this.db, walFile, {
        restartMax: options.checkpointRestart,
        truncateMax: options.checkpointTruncate,
      });
    }, 60_000);
    // In Node, unref() to prevent keeping the event loop alive
    // https://nodejs.org/api/timers.html#timers_timeout_unref
    if (typeof walCheck === 'object' && 'unref' in walCheck) walCheck.unref();
    return walCheck;
  }

  private createTable() {
    const createTableQuery = this.db.prepare(STATEMENTS.createTable);
    createTableQuery.run();
  }

  // TODO: taken from the better-sqlite3 bindings, but not sure if this is needed
  private freeStatement(statement: Statement) {
    return statement;
    // if (!statement.busy) return statement;
    // return this.db.prepare(statement.source);
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
    for (const row of results) {
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
    const results = this.freeStatement(this.statements.scanValues).iterate(
      low,
      high
    );
    for (const row of results) {
      yield JSON.parse(
        // @ts-expect-error
        row.value
      );
    }
  }

  count(options: CountOptions, scope?: Tuple): Promise<number> {
    const fullPrefix = scope ? [...scope, ...options.prefix] : options.prefix;
    if (!fullPrefix.length) {
      return Promise.resolve(
        (
          this.freeStatement(this.statements.count).get() as Record<
            'COUNT(*)',
            number
          >
        )['COUNT(*)']
      );
    }
    const low = encodeTuple(fullPrefix);
    const high = low + '\uffff';
    return Promise.resolve(
      (
        this.freeStatement(this.statements.countRange).get(low, high) as Record<
          'COUNT(*)',
          number
        >
      )['COUNT(*)']
    );
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
