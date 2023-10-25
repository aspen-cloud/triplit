import path from 'path';
import fs from 'fs';
import {
  applyMigration,
  createMigration,
  getMigrationsStatus,
} from '../../migration.js';
import { withServerRequester } from '../../middleware/add-server-requester.js';
import { getMigrationsDir } from '../../filesystem.js';
import { blue, italic } from 'ansis/colors';
import DB, { schemaToJSON } from '@triplit/db';
import { writeSchemaWithMigrations } from './codegen.js';

const pullMigrationName = 'sync_with_remote';

// Need to figure out something with version
export const run = withServerRequester(async ({ ctx }) => {
  console.log(`Pulling latest migrations from sync server: `, blue(ctx.url));
  console.log();
  const res = await getMigrationsStatus({ ctx });
  const { status, server, project } = res;
  if (status === 'SERVER_UNTRACKED_CHANGES') {
    // Create a DB up to the latest server migration
    const latest = server.migrationIds.at(-1) ?? 0;
    const db = new DB({
      migrations: project.migrations.filter((m) => m.version <= latest),
    });
    const tempSchema = schemaToJSON(await db.getSchema()).collections;
    const timestamp = Date.now();
    const migration = createMigration(
      tempSchema ?? {},
      server.schema ?? {},
      timestamp,
      latest,
      pullMigrationName
    );

    if (!migration) {
      console.log(
        'Could not detect any changes to the schema. This is unexpected, please report this to Triplit.'
      );
      return;
    }

    const fileName = path.join(
      getMigrationsDir(),
      `${timestamp}_${pullMigrationName}.json`
    );

    fs.writeFileSync(
      fileName,
      JSON.stringify(migration, null, 2) + '\n',
      'utf8'
    );

    // @ts-ignore
    console.log(blue`Migration file created at ${fileName}`);

    console.log(
      // @ts-ignore
      blue`applying ${italic('up')} migration with id ${migration.version}`
    );
    await applyMigration(migration, 'up', ctx);

    if (project.schemaHash === project.migrationsHash) {
      console.log('\n...Regenerating schema file with the new migration\n');
      const newMigrations = [...project.migrations, migration];
      writeSchemaWithMigrations(newMigrations);
    } else {
      // console.log(
      //   'Your schema.ts file has untracked changes. Run `triplit migrate create [migration_name]` and `triplit migrate up` to track the changes and push them to the remote.\n'
      // );
    }
    return;
  }

  console.log(
    'The server has no untracked changes. Please run `triplit migrate status` for more information.'
  );
  return;
});
