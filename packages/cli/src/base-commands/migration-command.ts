import { Flags } from '@oclif/core';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ServerCommand } from './server-command';
import type { Migration } from '@triplit/client';

export abstract class MigrationCommand extends ServerCommand {
  static baseFlags = {
    ...ServerCommand.baseFlags,
    dir: Flags.directory({
      description: 'Path to migrations dir',
      default: './triplit/migrations',
      required: false,
    }),
  };

  migrations?: Migration[];

  public async init() {
    await super.init();
    const { flags } = await this.parse({
      flags: this.ctor.flags,
    });
    const dir = path.resolve(process.cwd(), flags.dir);
    const migrations = readMigrations(dir);
    this.migrations = migrations;
  }
}

export function readMigrations(migrationsDir: string) {
  let migrationPaths: string[];
  try {
    migrationPaths = fs
      .readdirSync(migrationsDir)
      .map((file) => path.join(migrationsDir, file));
  } catch {
    migrationPaths = [];
  }
  // const migrationPaths = readMigrationFiles();
  const migrations = migrationPaths.map(
    (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')) as Migration
  );
  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}
