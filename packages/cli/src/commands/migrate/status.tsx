import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import {
  getMigrationsStatus,
  projectHasUntrackedChanges,
} from '../../migration.js';
import { Box, Newline, Text } from 'ink';
import React from 'react';

export default Command({
  description: 'View migration status of remote database',
  flags: {
    all: Flag.Boolean({
      char: 'a',
      description: 'Show all migrations',
    }),
  },
  middleware: [serverRequesterMiddleware],
  run: async ({ flags, ctx }) => {
    // console.log(`\nGetting migration status of the sync server: `, blue(ctx.url));
    const showAllMigrations = !!flags.all;
    const res = await getMigrationsStatus({ ctx });
    const { status, server, project } = res;

    let recommendedUserAction: React.JSX.Element | string | null = null;
    if (status === 'IN_SYNC')
      recommendedUserAction = (
        <Text color={'green'}>
          This project's schema is in sync with the remote database!
        </Text>
      );

    if (status === 'SERVER_BEHIND')
      recommendedUserAction = (
        <Text>
          This project has migrations that have not been applied to the remote
          database. <Newline count={2} />
          {'\tRun '}
          <Text color={'blue'}>`triplit migrate up`</Text> to update the remote
          database.
        </Text>
      );

    // TODO: message that there are code changes, probably need to pull from vcs
    if (status === 'SERVER_AHEAD')
      recommendedUserAction = (
        <Text>
          The server has migrations that are not present on this project. This
          is most likely due to your client code being out of date. You may be
          able to get the latest migrations by pulling from your version control
          system e.g. git
        </Text>
      );

    if (status === 'SERVER_UNTRACKED_CHANGES')
      recommendedUserAction = (
        <Text>
          The schema on the server has changes not tracked by migrations.
          <Newline count={2} />
          {'\tRun '}
          <Text color={'blue'}>`triplit migrate pull`</Text> to generate a
          migration.
        </Text>
      );

    if (status === 'PROJECT_UNTRACKED_CHANGES')
      recommendedUserAction = (
        <Text>
          Your tracked migrations match the remote database, but your local
          schema has changes not tracked by migrations.
          <Newline count={2} />
          If you manually updated your schema file, run{' '}
          <Text color={'blue'}>
            `triplit migrate create [migration_name]`
          </Text>{' '}
          to generate a migration.
          <Newline count={2} />
          If you recently pulled in new migrations from remote, you may manually
          update your schema or run{' '}
          <Text color={'blue'}>`triplit migrate codegen`</Text> to regenerate
          your schema file.
        </Text>
      );

    if (status === 'PROJECT_HAS_ORPHANS')
      // TODO: implement 'rescaffold'
      recommendedUserAction =
        'Your project has migrations that are not in the parent chain. You will need to delete and regenerate these migrations. Please ensure any changes pulled from remote migrations are applied to your local schema before regenerating migrations.';

    return (
      <Box flexDirection="column" gap={1} marginY={1}>
        <Box flexDirection="row" gap={2}>
          <Box flexDirection="column" width={30}>
            <Box
              borderStyle={'single'}
              borderLeft={false}
              borderRight={false}
              borderTop={false}
            >
              <Text bold>Local migrations</Text>
            </Box>
            {!showAllMigrations && project.migrations.length > 3 ? (
              <Text color={'gray'}>...</Text>
            ) : null}
            {project.migrations
              .slice(showAllMigrations ? 0 : -3)
              .map(({ version, name }) => (
                <Text
                  color={
                    project.statuses[version] === 'IN_SYNC' ? 'gray' : 'yellow'
                  }
                  key={version}
                >{`${version.toString()}_${name}`}</Text>
              ))}
            {projectHasUntrackedChanges(
              project.schemaHash,
              project.migrationsHash
            ) ? (
              <Text color={'yellow'} italic>
                Untracked schema changes
              </Text>
            ) : null}
          </Box>
          <Box flexDirection="column" width={30}>
            <Box
              borderStyle={'single'}
              borderLeft={false}
              borderRight={false}
              borderTop={false}
            >
              <Text bold>Remote migrations</Text>
            </Box>
            {!showAllMigrations && server.migrations.length > 3 ? (
              <Text color={'gray'}>...</Text>
            ) : null}
            {server.migrations
              .slice(showAllMigrations ? 0 : -3)
              .map(({ id: version, name }) => (
                <Text
                  color={
                    server.statuses[version] === 'IN_SYNC' ? 'gray' : 'yellow'
                  }
                  key={version}
                >{`${version.toString()}_${name}`}</Text>
              ))}
            {server.schemaHash !== server.migrationHash ? (
              <Text color={'yellow'} italic>
                Untracked schema changes
              </Text>
            ) : null}
          </Box>
        </Box>
        <Text>{recommendedUserAction}</Text>
      </Box>
    );
  },
});
