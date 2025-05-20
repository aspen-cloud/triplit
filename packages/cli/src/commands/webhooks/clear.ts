import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { Command } from '../../command.js';
import ora, { Ora } from 'ora';

export default Command({
  description: 'Removes all webhooks from the sync server',
  preRelease: true,
  middleware: [createServerRequesterMiddleware({ destructive: true })],
  run: async ({ ctx }) => {
    let spinner: Ora | undefined;
    try {
      const res = await ctx.remote.request(
        'POST',
        '/webhooks-clear',
        {},
        {
          hooks: {
            beforeRequest: () => {
              ora(
                'Clearing the webhooks currently running on the server...'
              ).start();
            },
          },
        }
      );
      spinner?.succeed('Webhooks cleared from the server');
    } catch (e) {
      spinner?.fail('Failed to clear webhooks from the server');
      console.error(e);
      return;
    }
  },
});
