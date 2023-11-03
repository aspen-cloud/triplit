import path from 'path';
import fs from 'fs';
import { DB, schemaToJSON } from '@triplit/db';
import { blue } from 'ansis/colors';
import { readLocalSchema } from '../../schema.js';
import { createMigration, readMigrations } from '../../migration.js';
import { getMigrationsDir, getTriplitDir } from '../../filesystem.js';
import { Command } from '../../command.js';

export default Command({
  description: 'Generates a migration based on your current schema file',
  args: { name: 'migrationName', description: 'The name of your migration' },
  run: async ({ args }) => {
    const migrationName = args.migrationName.join('_');
    if (!migrationName) throw new Error('Missing migration name');
    const sanitizedMigrationName = sanitizeFilename(migrationName); //args.migrationName
    // define a name for the migration
    const timestamp = Date.now();
    const fileName = path.join(
      getMigrationsDir(),
      `${timestamp}_${sanitizedMigrationName}.json`
    );
    fs.mkdirSync(path.dirname(fileName), { recursive: true });

    const migrationFiles = readMigrations()
      // .filter((mf) => version == undefined || mf.migration.version <= version)
      .sort((a, b) => a.migration.version - b.migration.version);

    const latest =
      migrationFiles.length === 0
        ? 0
        : migrationFiles[migrationFiles.length - 1].migration.version;

    if (latest == undefined || latest > timestamp)
      throw new Error('Invalid timestamp');

    const db = new DB<any>({
      migrations: migrationFiles.map((mf) => mf.migration),
    });
    await db.ensureMigrated;

    const dbSchema = await db.getSchema();
    if (dbSchema && dbSchema.version !== latest)
      throw new Error('Local database failed to apply all migrations');
    const dbSchemaJSON = dbSchema
      ? JSON.parse(JSON.stringify(schemaToJSON(dbSchema)?.collections ?? {}))
      : {};

    const localSchema = await readLocalSchema();

    if (!localSchema) {
      createEmptySchemaFile();
      return;
    }

    const localSchemaJSON = JSON.parse(
      JSON.stringify(
        schemaToJSON({ collections: localSchema, version: timestamp })
          .collections
      )
    );

    const migration = createMigration(
      dbSchemaJSON,
      localSchemaJSON,
      timestamp,
      latest,
      sanitizedMigrationName
    );

    if (!migration) {
      console.log('No changes detected');
      return;
    }

    fs.writeFile(
      fileName,
      JSON.stringify(migration, null, 2) + '\n',
      'utf8',
      (err) => {
        if (err) throw err;
        // @ts-ignore
        console.log(blue`Migration file created at ${fileName}`);
      }
    );
  },
});

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[^a-z0-9]/gi, '_') // Replace any character not alphanumeric with '_'
    .replace(/^-*|-*$/g, '') // Remove leading or trailing '-'
    .replace(/__*/g, '_') // Replace consecutive '_' with a single '_'
    .toLowerCase();
}

function createEmptySchemaFile() {
  const content = `export const schema = {};\n`;
  const schemaPath = path.join(getTriplitDir(), 'schema.ts');
  // @ts-ignore
  console.log(blue`No schema file found, creating one at ${schemaPath}`);
  console.log(
    blue`Please add your schema file and then run this command again.`
  );
  fs.writeFileSync(schemaPath, content, 'utf8');
}
