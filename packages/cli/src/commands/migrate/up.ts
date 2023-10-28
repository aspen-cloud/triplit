import { blue, italic } from 'ansis/colors';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import {
  readMigrations,
  applyMigration,
  getMigrationsStatus,
} from '../../migration.js';
import { Command } from '../../command.js';

export default Command({
  description: 'Runs up migrations on the remote database',
  middleware: [serverRequesterMiddleware],
  args: ['version'],
  run: async ({ args, ctx }) => {
    console.log(`Migrating up the sync server: `, blue(ctx.url));
    console.log();
    const resp = await getMigrationsStatus({ ctx });
    const { status, server } = resp;

    // must be ahead or in sync to run migrations
    if (status !== 'IN_SYNC' && status !== 'SERVER_BEHIND') {
      console.log(
        'Cannot run migrations on remote database. Please run `triplit migrate status` for more information.'
      );
      return;
    }

    // If no schema or already using migrations, apply proper migrations
    const startVersion = server.migrationIds?.at(-1) || 0;
    const endVersion = args[0];
    if (endVersion && endVersion < startVersion) {
      console.error(
        `Migration version ${endVersion} is less than server version ${startVersion}`
      );
      return;
    }

    const migrations = readMigrations()
      .filter(
        (m) =>
          m.migration.version > startVersion &&
          (!endVersion || m.migration.version <= endVersion)
      )
      .map((m) => m.migration)
      .sort((a, b) => a.version - b.version);

    if (migrations.length === 0) {
      console.log('No migrations to apply');
    } else {
      for (const migration of migrations) {
        console.log(
          // @ts-ignore
          blue`applying ${italic('up')} migration with id ${migration.version}`
        );
        await applyMigration(migration, 'up', ctx);
      }
    }
  },
});
