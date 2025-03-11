export const STATEMENTS = Object.freeze({
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

export const DEFAULT_PRAGMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = memory;
PRAGMA mmap_size = 30000000000;
`;
