import { blue } from 'ansis/colors';
import { createServerRequesterMiddleware } from '../middleware/add-server-requester.js';
import { Command } from '../command.js';
import prompts from 'prompts';
import * as Flag from '../flags.js';
import ora, { Ora } from 'ora';

export default Command({
  description: "Clears the sync server's database",
  middleware: [createServerRequesterMiddleware({ destructive: true })],
  flags: {
    full: Flag.Boolean({
      char: 'f',
      description:
        'Will also clear all metadata from the database, including the schema.',
      default: false,
    }),
  },
  run: async ({ args, ctx, flags }) => {
    let spinner: Ora | undefined;
    try {
      await ctx.remote.request(
        'POST',
        '/clear',
        {
          full: flags.full,
        },
        {
          hooks: {
            beforeRequest: () => {
              spinner = ora('Clearing the sync server').start();
            },
          },
        }
      );
      spinner?.succeed('Sync server database has been cleared');
    } catch (e) {
      spinner?.fail('Failed to clear the sync server database');
      console.error(e);
      return;
    }
  },
});
