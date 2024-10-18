import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { Command } from '../../command.js';
import ora from 'ora';

export default Command({
  description: 'Removes all webhooks from the sync server',
  middleware: [serverRequesterMiddleware],
  run: async ({ ctx }) => {
    const spinner = ora(
      'Clearing the webhooks currently running on the server...'
    ).start();
    try {
      const res = await ctx.requestServer('POST', '/webhooks-clear');
      spinner.succeed('Webhooks cleared from the server');
    } catch (e) {
      spinner.fail('Failed to clear webhooks from the server');
      console.error(e);
      return;
    }
  },
});
