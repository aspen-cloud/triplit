import { Command } from '../../command.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { readLocalSchema } from '../../schema.js';
import { logSchemaChangeViolations, schemaToJSON } from '@triplit/db';
import ora from 'ora';

export default Command({
  description: 'Show the diff between local and remote schema',
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

    logSchemaChangeViolations(data.successful, data.issues);
  },
});
