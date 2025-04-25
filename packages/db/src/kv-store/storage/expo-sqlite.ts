import { decodeTuple, encodeTuple, Tuple } from '../../codec.js';
import {
  CountOptions,
  KVStore,
  KVStoreTransaction,
  ScanOptions,
} from '../../types.js';
import * as SQLite from 'expo-sqlite';
import {
  parseSqliteKvStoreOptions,
  SQLiteKVStoreOptions,
  STATEMENTS,
  walSizeGuard,
} from '../utils/sqlite.js';
import { MemoryTransaction } from '../transactions/memory-tx.js';
import { ScopedKVStore } from '../utils/scoped-store.js';

type SQLiteState = {
  db: SQLite.SQLiteDatabase;
  statements: Record<keyof typeof STATEMENTS, SQLite.SQLiteStatement>;
};

export class ExpoSQLiteKVStore implements KVStore {
  private storeReady: Promise<SQLiteState>;
  private walGuard: NodeJS.Timer | undefined;

  constructor(name: string, options?: SQLiteKVStoreOptions);
  constructor(db: SQLite.SQLiteDatabase, options?: SQLiteKVStoreOptions);
  constructor(
    arg0: string | SQLite.SQLiteDatabase,
    options: SQLiteKVStoreOptions = {}
  ) {
    let dbPromise: Promise<SQLite.SQLiteDatabase>;
    if (typeof arg0 === 'string') {
      dbPromise = SQLite.openDatabaseAsync(arg0);
    } else {
      dbPromise = Promise.resolve(arg0);
    }
    const parsedOptions = parseSqliteKvStoreOptions(options);
    this.storeReady = dbPromise.then(async (db) => {
      await db.execAsync(parsedOptions.pragma);
      // TODO: promise.all the prepares?
      const createTableStatement = await db.prepareAsync(
        STATEMENTS.createTable
      );
      createTableStatement.executeAsync();
      this.walGuard = this.startWalGuard(db, parsedOptions);
      return {
        db,
        statements: {
          createTable: createTableStatement,
          get: await db.prepareAsync(STATEMENTS.get),
          set: await db.prepareAsync(STATEMENTS.set),
          delete: await db.prepareAsync(STATEMENTS.delete),
          deleteRange: await db.prepareAsync(STATEMENTS.deleteRange),
          scan: await db.prepareAsync(STATEMENTS.scan),
          scanValues: await db.prepareAsync(STATEMENTS.scanValues),
          count: await db.prepareAsync(STATEMENTS.count),
          countRange: await db.prepareAsync(STATEMENTS.countRange),
          truncate: await db.prepareAsync(STATEMENTS.truncate),
        },
      };
    });
  }

  private startWalGuard(
    db: SQLite.SQLiteDatabase,
    options: Required<SQLiteKVStoreOptions>
  ) {
    if (this.walGuard) {
      clearInterval(this.walGuard);
    }
    const dbPath = db.databasePath;
    const walFile = `${dbPath}-wal`;
    return setInterval(() => {
      walSizeGuard(
        {
          exec: db.execSync,
        },
        walFile,
        {
          restartMax: options.checkpointRestart,
          truncateMax: options.checkpointTruncate,
        }
      );
    }, 60_000);
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
    const { db, statements } = await this.storeReady;
    await db.withExclusiveTransactionAsync(async () => {
      for await (const [key, value] of sets) {
        const encodedKey = encodeTuple(key);
        const encodedValue = JSON.stringify(value);
        await statements.set.executeAsync(encodedKey, encodedValue);
      }
      for await (const key of deletes) {
        const encodedKey = encodeTuple(key);
        await statements.delete.executeAsync(encodedKey);
      }
    });
  }

  async get(key: Tuple, scope?: Tuple): Promise<any> {
    const { statements } = await this.storeReady;
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    const result = await (
      await statements.get.executeAsync(encodedKey)
    ).getFirstAsync();
    if (!result) return undefined;
    return JSON.parse(
      // @ts-expect-error
      result
    );
  }
  async set(key: Tuple, value: any, scope?: Tuple): Promise<void> {
    const { statements } = await this.storeReady;
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    const encodedValue = JSON.stringify(value);
    await statements.set.executeAsync(encodedKey, encodedValue);
  }
  async delete(key: Tuple, scope?: Tuple): Promise<void> {
    const { statements } = await this.storeReady;
    const fullKey = scope ? [...scope, ...key] : key;
    const encodedKey = encodeTuple(fullKey);
    await statements.delete.executeAsync(encodedKey);
  }
  async *scan(
    options: ScanOptions,
    scope?: Tuple
  ): AsyncIterable<[Tuple, any]> {
    const { statements } = await this.storeReady;
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = await statements.scan.executeAsync(low, high);
    for await (const row of results) {
      const key = decodeTuple(
        // @ts-expect-error
        row.key
      );
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
    const { statements } = await this.storeReady;
    const low = scope
      ? encodeTuple([...scope, ...options.prefix])
      : encodeTuple(options.prefix);
    const high = low + '\uffff';
    const results = await statements.scanValues.executeForRawResultAsync(
      low,
      high
    );
    for await (const row of results) {
      yield JSON.parse(row[0]);
    }
  }
  async count(options: CountOptions, scope?: Tuple): Promise<number> {
    const { statements } = await this.storeReady;
    const fullPrefix = scope ? [...scope, ...options.prefix] : options.prefix;
    if (!fullPrefix.length) {
      return (
        await (
          await statements.count.executeForRawResultAsync()
        ).getFirstAsync()
      )?.[0] as unknown as number;
    }
    const low = encodeTuple(fullPrefix);
    const high = low + '\uffff';
    return (
      await (
        await statements.countRange.executeForRawResultAsync(low, high)
      ).getFirstAsync()
    )?.[0] as unknown as number;
  }
  async clear(scope?: Tuple): Promise<void> {
    const { statements } = await this.storeReady;
    // if we know that this is not a scoped store, we can just delete everything
    if (!scope?.length) {
      await statements.truncate.executeAsync();
      return;
    }
    const low = encodeTuple(scope);
    const high = low + '\uffff';
    await statements.deleteRange.executeAsync(low, high);
  }
}
