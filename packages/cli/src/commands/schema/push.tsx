import c from 'ansi-colors';
import { Command } from '../../command.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { readLocalSchema } from '../../schema.js';
import { logSchemaChangeViolations, schemaToJSON } from '@triplit/db';
import ora from 'ora';

export default Command({
  description: 'Apply the local schema to the server',
  middleware: [serverRequesterMiddleware],
  run: async ({ ctx }) => {
    const localSchema = schemaToJSON({
      collections: await readLocalSchema(),
      version: 0,
    });
    const pushSpinner = ora('Pushing schema to server').start();
    let data;
    try {
      data = await ctx.requestServer('POST', '/override-schema', {
        schema: localSchema,
      });
      pushSpinner.succeed('Schema pushed to server');
    } catch (e) {
      pushSpinner.fail('Failed to push schema to server');
      data = e;
    }
    if (!Object.hasOwn(data, 'successful') || !Object.hasOwn(data, 'issues')) {
      console.error(data);
      return;
    }
    logSchemaChangeViolations(data.successful, data.issues, {
      warn: (message, ...args) => console.log(c.yellow(message), ...args),
      info: (message, ...args) => console.log(c.blue(message), ...args),
      error: (message, ...args) => console.log(c.red(message), ...args),
      debug: () => {},
      scope: () => this,
    });
  },
});
