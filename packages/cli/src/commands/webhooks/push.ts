import { blue } from 'ansis/colors';
import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { WebhookJSONDefinition, WebhookAction } from '@triplit/server-core';
import ora, { Ora } from 'ora';
import path from 'path';
import fs from 'fs';
import { getTriplitDir } from '../../filesystem.js';

export default Command({
  description: 'Pushes webhooks to the sync server',
  preRelease: true,
  middleware: [createServerRequesterMiddleware({ destructive: true })],
  flags: {
    raw: Flag.String({
      description: 'Raw JSON string of the webhook',
      required: false,
      char: 'r',
    }),
    configPath: Flag.String({
      description: 'Path to the webhook config file',
      required: false,
      char: 'c',
    }),
  },
  run: async ({ flags, ctx }) => {
    let webhookJSON: string;
    if (flags.raw) {
      webhookJSON = flags.raw;
    } else {
      const configPath = path.resolve(
        flags.configPath ??
          process.env.TRIPLIT_WEBHOOK_CONFIG_PATH ??
          path.join(getTriplitDir(), 'webhooks.json')
      );
      if (!fs.existsSync(configPath)) {
        console.error('Webhook config file not found at', configPath);
        return;
      }
      webhookJSON = fs.readFileSync(configPath, 'utf8');
    }

    const webhooks = validateWebhookStructure(webhookJSON);

    if (!webhooks) {
      return;
    }

    console.dir(webhooks, { depth: null });
    let spinner: Ora | undefined;
    try {
      await ctx.remote.request(
        'POST',
        '/webhooks-push',
        { webhooks },
        {
          hooks: {
            beforeRequest: () => {
              spinner = ora('Pushing webhooks to the server').start();
            },
          },
        }
      );
      spinner?.succeed('Webhooks have been pushed to the sync server');
    } catch (e) {
      spinner?.fail('Failed to push webhooks to the sync server');
      console.error(e);
      return;
    }
  },
});

export function validateWebhookStructure(
  webhookJSON: string
): WebhookJSONDefinition | null {
  let webhook: WebhookJSONDefinition;
  try {
    webhook = JSON.parse(webhookJSON);
  } catch (e) {
    console.error('Invalid JSON structure');
    return null;
  }
  for (const url in webhook) {
    if (!isAValidUrlString(url)) {
      console.error('Invalid URL', url);
      return null;
    }
    for (const collectionName in webhook[url]) {
      for (const action of Object.keys(
        webhook[url][collectionName]
      ) as WebhookAction[]) {
        if (!['inserts', 'updates', 'deletes'].includes(action)) {
          console.error('Invalid action', action);
          return null;
        } else if (typeof webhook[url][collectionName][action] !== 'boolean') {
          console.error(
            'Invalid action value',
            webhook[url][collectionName][action]
          );
          console.error('Action value must be a boolean');
          return null;
        }
      }
    }
  }
  return webhook;
}

const isAValidUrlString = (s: string) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};
