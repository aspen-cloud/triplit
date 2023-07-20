import process from 'process';
import path from 'path';
import fs from 'fs';
import { Migration } from '@triplit/db';

export function getMigrationsDir() {
  const cwd = process.cwd();
  const triplitDir = path.join(cwd, 'triplit');
  return path.join(triplitDir, 'migrations');
}

export function readMigrationFiles() {
  const migrationsDir = getMigrationsDir();
  let files: string[];
  try {
    files = fs
      .readdirSync(migrationsDir)
      .map((file) => path.join(migrationsDir, file));
  } catch {
    files = [];
  }
  return files;
}

export function readMigrations() {
  const migrationPaths = readMigrationFiles();
  const migrations = migrationPaths.map(
    (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')) as Migration
  );
  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}
