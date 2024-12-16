import * as Colors from 'ansis/colors';
import { Command } from '../../command.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { logSchemaChangeViolations, schemaToJSON } from '@triplit/db';
import ora from 'ora';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';
import * as Flag from '../../flags.js';

export default Command({
  description: 'Apply the local schema to the server',
  middleware: [serverRequesterMiddleware, projectSchemaMiddleware],
  flags: {
    failOnBackwardsIncompatibleChange: Flag.Boolean({
      description: 'Fail if there is a backwards incompatible change',
      required: false,
      default: false,
    }),
    printIssues: Flag.Boolean({
      description: 'Print issues even if successful',
      char: 'p',
      required: false,
      default: false,
    }),
  },
  run: async ({ ctx, flags }) => {
    const localSchema = schemaToJSON({
      roles: ctx.roles,
      collections: ctx.schema,
      version: 0,
    });
    const pushSpinner = ora('Pushing schema to server').start();
    let data;
    try {
      data = await ctx.requestServer('POST', '/override-schema', {
        schema: localSchema,
        failOnBackwardsIncompatibleChange:
          flags.failOnBackwardsIncompatibleChange,
      });
      pushSpinner.succeed('Schema pushed to server');
    } catch (e) {
      pushSpinner.fail('Failed to push schema to server');
      data = e;
    }
    if (!Object.hasOwn(data, 'successful') || !Object.hasOwn(data, 'issues')) {
      console.error(data);
      process.exit(1);
    }
    logSchemaChangeViolations(data.successful, data.issues, {
      forcePrintIssues:
        flags.failOnBackwardsIncompatibleChange || flags.printIssues,
      logger: {
        warn: (message, ...args) =>
          console.log(Colors.yellow(message), ...args),
        info: (message, ...args) => console.log(Colors.blue(message), ...args),
        error: (message, ...args) => console.log(Colors.red(message), ...args),
        debug: () => {},
        scope: () => this,
      },
    });
    if (!data.successful) {
      process.exit(1);
    }
  },
});
