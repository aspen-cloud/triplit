import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { Command } from '../../command.js';
import ora from 'ora';

export default Command({
  description: 'Prints the webhooks that are active on the sync server',
  middleware: [serverRequesterMiddleware],
  run: async ({ ctx }) => {
    const spinner = ora(
      'Getting the webhooks currently running on the server...'
    ).start();
    try {
      const res = await ctx.requestServer('POST', '/webhooks-get');
      spinner.succeed('Webhooks retrieved from the server');
      console.dir(res, { depth: null });
    } catch (e) {
      spinner.fail('Failed to get webhooks from the server');
      console.error(e);
      return;
    }
  },
});
