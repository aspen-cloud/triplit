import { blue } from 'ansis/colors';
import { serverRequesterMiddleware } from '../middleware/add-server-requester.js';
import { Command } from '../command.js';
import prompts from 'prompts';
import * as Flag from '../flags.js';

export default Command({
  description: "Clears the sync server's database",
  middleware: [serverRequesterMiddleware],
  flags: {
    full: Flag.Boolean({
      char: 'f',
      description: 'Create a new seed file',
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
    console.log(`Clearing the sync server: `, blue(ctx.url));
    console.log();

    await ctx.requestServer('POST', '/clear', {
      full: flags.full,
    });
    console.log(blue('Database has been cleared'));
  },
});
