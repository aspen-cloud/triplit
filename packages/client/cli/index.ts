#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { createCommand, CreateCommandArgs } from './create';
import {
  upCommand,
  UpCommandArgs,
  downCommand,
  DownCommandArgs,
} from './migrate';
import { statusCommand, StatusCommandArgs } from './status';
import { hideBin } from 'yargs/helpers';

const tokenOption = {
  type: 'string' as const,
  describe: 'Secret token (do not expose this in source control)',
  demandOption: true,
};

yargs(hideBin(process.argv))
  .scriptName('triplit')
  .usage('$0 <cmd> [args]')
  .command<CreateCommandArgs>(
    'create <migrationName>',
    'Create a migration file',
    (yargs) => {
      yargs.positional('migrationName', {
        type: 'string',
        describe: 'The name of the migration',
      });
      return yargs;
    },
    createCommand
  )
  .command<StatusCommandArgs>(
    'status',
    'Get current migration status',
    (yargs) => {
      yargs.option('token', tokenOption);
      yargs.option('origin', { type: 'string', hidden: true });
      return yargs;
    },
    statusCommand
  )
  .command('migrate <direction>', 'Migrate the database', (yargs) => {
    yargs.command<UpCommandArgs>(
      'up [version]',
      'Migrate up',
      () => {
        yargs.version(false);
        yargs.positional('migrationVersion', {
          type: 'number',
          describe: 'The version to migrate up to',
        });
        yargs.option('token', tokenOption);
        yargs.option('origin', { type: 'string', hidden: true });
      },
      upCommand
    );
    yargs.command<DownCommandArgs>(
      'down <version>',
      'Migrate down',
      () => {
        yargs.version(false);
        yargs.positional('version', {
          type: 'number',
          describe: 'The version to migrate down to',
        });
        yargs.option('token', tokenOption);
        yargs.option('origin', { type: 'string', hidden: true });
      },
      downCommand
    );
  })
  .help().argv;
