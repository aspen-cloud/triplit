import { blue, gray, green, red, yellow } from 'ansis/colors';
import { withServerRequester } from '../../middleware/add-server-requester.js';
import { getMigrationsStatus } from '../../migration.js';

export const description = 'View migration status of remote database';

export const run = withServerRequester(async ({ ctx }) => {
  const res = await getMigrationsStatus({ ctx });
  const { status, server, project } = res;

  // list migrations:
  // green: in sync between both
  // yellow: unapplied on client, but ahead of server
  // red: unapplied on server, but behind server (will need to regenerate)
  // blue: applied on server, but not tracked by migrations
  // gray: unknown

  console.log(
    'These are you remote and local migrations. They are color coded as follows:'
  );
  console.log(green`green:`, 'The server has applied this migration.');
  console.log(
    yellow`yellow:`,
    'The server has not applied this migration, and no changes have been made to the server since this migration was created.'
  );
  console.log(
    red`red:`,
    'The server has not applied this migration, and this migration will not be accepted by the server. It must be regenerated.'
  );
  console.log(
    blue`blue:`,
    "The server has applied this migration, but it is not in the project's migrations. This is likely because the migration was created on another machine."
  );
  console.log();

  // const serverLatest = server.migrationIds.at(-1) ?? 0;

  console.log('Remote migrations:');
  if (server.migrationIds.length) {
    server.migrationIds.forEach((v) => {
      const status = server.statuses[v];
      if (status === 'IN_SYNC') console.log(green(v.toString()));
      else if (status === 'UNTRACKED') console.log(blue(v.toString()));
      else console.log(gray(v.toString()));
    });
  } else {
    console.log('None');
  }
  console.log();
  console.log(`Local migrations:`);
  if (project.migrations.length) {
    project.migrations.forEach((m) => {
      const status = project.statuses[m.version];
      if (status === 'IN_SYNC') console.log(green(m.version.toString()));
      else if (status === 'UNAPPLIED')
        console.log(yellow(m.version.toString()));
      else if (status === 'ORPHANED') console.log(red(m.version.toString()));
      else console.log(gray(m.version.toString()));
    });
  } else {
    console.log('None');
  }
  console.log();

  if (status === 'IN_SYNC') {
    console.log("This project's schema is in sync with the remote database!");
    return;
  }

  if (status === 'SERVER_BEHIND') {
    console.log(
      'This project has migrations that have not been applied to the remote database. Run `triplit migrate up` to update the remote database.'
    );
    return;
  }

  if (status === 'SERVER_AHEAD') {
    console.log(
      'The server has migrations that are not present on this project.'
    );
    return;
  }

  if (status === 'SERVER_UNTRACKED_CHANGES') {
    console.log(
      `It has been detected that the schema on the server has changes not tracked by migrations. Run \`triplit migrate pull\` to generate a migration.`
    );
    return;
  }

  if (status === 'PROJECT_UNTRACKED_CHANGES') {
    console.log(
      'Your tracked migrations match the remote database, but your local schema has changes not tracked by migrations.'
    );
    console.log();
    console.log(
      'If you manually updated your schema file, run `triplit migrate create [migration_name]` to generate a migration.'
    );
    console.log(
      'If you recently pulled in new migrations from remote, you may manually update your schema or run `triplit migrate codegen` to regenerate your schema file.'
    );
    return;
  }

  if (status === 'PROJECT_HAS_ORPHANS') {
    // TODO: implement 'rescaffold'
    console.log(
      'Your project has migrations that are not in the parent chain. You will need to delete and regenerate these migrations. Please ensure any changes pulled from remote migrations are applied to your local schema before regenerating migrations.'
    );
    return;
  }

  console.log(
    "Hmm, you shouldn't hit this codepath. Please report this to Triplit."
  );
});
