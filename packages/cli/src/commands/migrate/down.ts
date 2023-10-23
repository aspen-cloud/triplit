import { yellow, italic } from 'ansis/colors';
import { withServerRequester } from '../../middleware/add-server-requester.js';
import {
  applyMigration,
  getMigrationsStatus,
  readMigrations,
} from '../../migration.js';

export const description = 'Runs down migrations on the remote database';

export const run = withServerRequester(async ({ args, ctx }) => {
  const endVersion = args[0];
  if (endVersion == undefined) throw new Error('No version specified');

  const resp = await getMigrationsStatus({ ctx });
  const { status, server } = resp;

  // must be ahead or in sync to run migrations
  if (status !== 'IN_SYNC' && status !== 'SERVER_BEHIND') {
    console.log(
      'Cannot run migrations on remote database. Please run `triplit migrate status` for more information.'
    );
    return;
  }
  const startVersion = server.migrationIds?.at(-1) || 0;
  if (endVersion > startVersion) {
    console.error(
      `Migration version ${endVersion} is greater than server version ${startVersion}`
    );
    return;
  }
  const migrations = readMigrations()
    .filter(
      (m) =>
        m.migration.version <= startVersion && m.migration.version > endVersion
    )
    .map((m) => m.migration)
    .sort((a, b) => b.version - a.version);

  if (migrations.length === 0) {
    console.log('No migrations to apply');
  } else {
    for (const migration of migrations) {
      console.log(
        //@ts-ignore
        yellow`applying ${italic('down')} migration with id ${
          migration.version
        }`
      );
      await applyMigration(migration, 'down', ctx);
    }
  }
});
