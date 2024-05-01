import { blue } from 'ansis/colors';
import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';
import { Command } from '../command.js';
import prompts from 'prompts';
import * as Flag from '../flags.js';
import ora from 'ora';
import { or } from '@triplit/db';

export default Command({
  description: "Clears the sync server's database",
  middleware: [serverRequesterMiddleware],
  flags: {
    full: Flag.Boolean({
      char: 'f',
      description:
        'Will also clear all metadata from the database, including the schema.',
      default: false,
    }),
  },
  run: async ({ args, ctx, flags }) => {
    const { proceed } = await prompts({
      type: 'confirm',
      name: 'proceed',
      message: 'Are you sure you want to clear the database?',
    });
    if (!proceed) return;
    console.log('Sync server: ', blue(ctx.url));
    const spinner = ora('Clearing the sync server').start();
    try {
      await ctx.requestServer('POST', '/clear', {
        full: flags.full,
      });
      spinner.succeed('Sync server database has been cleared');
    } catch (e) {
      spinner.fail('Failed to clear the sync server database');
      console.error(e);
      return;
    }
  },
});
