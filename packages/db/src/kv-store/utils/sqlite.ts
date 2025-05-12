const MB1 = 1024 * 1024;
const GB1 = 1024 * MB1;

export type SQLiteKVStoreOptions = {
  /**
   * Expected storage size of the system in bytes that SQLite may use. This does not put a hard limit on the size of the database, but it is used to influence WAL checkpointing and truncation.
   * The default is 5GB.
   */
  storageSize?: number;
  /**
   * The maximum size of the WAL file before it is truncated. This is used to limit the size of the WAL file and prevent it from growing indefinitely.
   * The default is 2.5% of the storage size.
   */
  journalSizeLimit?: number;
  /**
   * The number of pages in the WAL file that will trigger a (PASSIVE) checkpoint. This is used to control the frequency of checkpoints and prevent the WAL file from growing too large.
   * The default is journal_size_limit / page_size.
   */
  walAutocheckpoint?: number;
  /**
   * Set greater than journal_size_limit. This is used to control the frequency of checkpoints and prevent the WAL file from growing too large.
   * The default is 5% of the storage size.
   */
  checkpointRestart?: number;
  /**
   * Set greater than journal_size_limit. This is used to control the frequency of checkpoints and prevent the WAL file from growing too large.
   * The default is 20% of the storage size.
   */
  checkpointTruncate?: number; // in bytes
  /**
   * Additional custom pragma settings to be applied to the SQLite database. This can be used to set various SQLite options and configurations. Default PRAGMA statements will still be applied, so must be overridden if you want to change them.
   */
  pragma?: string;
};

export const STATEMENTS = Object.freeze({
  /**
   * Create the table if it doesn't exist.
   *
   * We use `WITHOUT ROWID` to create a clustered index on the `key` column to improve locality during range scans.
   */
  createTable:
    'CREATE TABLE IF NOT EXISTS data (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID',
  get: 'SELECT value FROM data WHERE key = ?',
  scan: 'SELECT key, value FROM data WHERE key >= ? AND key < ?',
  scanValues: 'SELECT value FROM data WHERE key >= ? AND key < ?',
  count: 'SELECT COUNT(*) FROM data',
  countRange: 'SELECT COUNT(*) FROM data WHERE key >= ? AND key < ?',
  set: 'INSERT OR REPLACE INTO data VALUES (?, ?)',
  delete: 'DELETE FROM data WHERE key = ?',
  deleteRange: 'DELETE FROM data WHERE key >= ? AND key < ?',
  truncate: 'DELETE FROM data',
});

export const CHECKPOINT_RESTART = 'PRAGMA wal_checkpoint(RESTART);';
export const CHECKPOINT_TRUNCATE = 'PRAGMA wal_checkpoint(TRUNCATE);';

export function parseSqliteKvStoreOptions(
  options: SQLiteKVStoreOptions
): Required<SQLiteKVStoreOptions> {
  const storageSize = options.storageSize || 5 * GB1;
  const journalSizeLimit =
    options.journalSizeLimit || defaultJournalSizeLimit(storageSize);
  const walAutocheckpoint =
    options.walAutocheckpoint || defaultWalAutocheckpoint(journalSizeLimit);
  const checkpointRestart =
    options.checkpointRestart || defaultCheckpointRestart(storageSize);
  const checkpointTruncate =
    options.checkpointTruncate || defaultCheckpointTruncate(storageSize);
  return {
    storageSize,
    journalSizeLimit,
    walAutocheckpoint,
    checkpointRestart,
    checkpointTruncate,
    pragma:
      defaultPragma(walAutocheckpoint, journalSizeLimit) +
      (options.pragma || ''),
  };
}

// Reasonable heuristic ≈ 2.5 % storage
function defaultJournalSizeLimit(storageSize: number) {
  return Math.floor(storageSize * 0.025);
}

// Reasonable heuristic ≈ journal_size_limit / page_size
function defaultWalAutocheckpoint(journalSizeLimit: number) {
  const pageSize = 4096; // default page size, TODO: make this configurable
  return Math.floor(journalSizeLimit / pageSize);
}

// Reasonable heuristic ≈ 5 % storage
function defaultCheckpointRestart(storageSize: number) {
  return Math.floor(storageSize * 0.05);
}

// Reasonable heuristic ≈ 20 % storage
function defaultCheckpointTruncate(storageSize: number) {
  return Math.floor(storageSize * 0.2);
}

/**
 * journal_mode = WAL: Use Write-Ahead Logging (WAL) mode for better concurrency.
 * synchronous = NORMAL: In WAL mode, provides best performance with durability guarantees.
 * temp_store = memory: Use memory for temporary tables and indexes.
 * mmap_size: Set the memory-mapped I/O size to 256MB for better performance. TODO: 256MB is a reasonable default, make this configurable.
 * wal_autocheckpoint: The number of pages in the WAL file that will trigger a (PASSIVE) checkpoint.
 * journal_size_limit: The maximum size of the WAL file before it is truncated.
 */
function defaultPragma(walAutocheckpoint: number, journalSizeLimit: number) {
  return `
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = memory;
    PRAGMA mmap_size = ${256 * MB1};
    PRAGMA wal_autocheckpoint  = ${walAutocheckpoint};
    PRAGMA journal_size_limit  = ${journalSizeLimit};
  `;
}
