import path from 'path';
import fs from 'fs';

function createDirIfNotExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const CWD = process.cwd();

export const TRIPLIT_DIR = path.join(CWD, 'triplit');
export function getTriplitDir() {
  createDirIfNotExists(TRIPLIT_DIR);
  return TRIPLIT_DIR;
}

export const MIGRATIONS_DIR = path.join(TRIPLIT_DIR, 'migrations');
export function getMigrationsDir() {
  createDirIfNotExists(MIGRATIONS_DIR);
  return MIGRATIONS_DIR;
}

// Contains data for the local db if in filesystem (ie sqlite)
export const DATA_DIR = path.join(TRIPLIT_DIR, '.data');
export function getDataDir() {
  createDirIfNotExists(DATA_DIR);
  return DATA_DIR;
}
