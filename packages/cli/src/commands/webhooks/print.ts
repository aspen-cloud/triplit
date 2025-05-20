import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { Command } from '../../command.js';
import ora from 'ora';

export default Command({
  description: 'Prints the webhooks that are active on the sync server',
  preRelease: true,
  middleware: [createServerRequesterMiddleware({ destructive: false })],
  run: async ({ ctx }) => {
    const spinner = ora(
      'Getting the webhooks currently running on the server...'
    ).start();
    try {
      const res = await ctx.remote.request('POST', '/webhooks-get');
      spinner.succeed('Webhooks retrieved from the server');
      console.dir(res, { depth: null });
    } catch (e) {
      spinner.fail('Failed to get webhooks from the server');
      console.error(e);
      return;
    }
  },
});
