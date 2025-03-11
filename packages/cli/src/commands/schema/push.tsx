import * as Colors from 'ansis/colors';
import { Command } from '../../command.js';
import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { logSchemaChangeViolations } from '@triplit/db';
import ora, { Ora } from 'ora';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';
import * as Flag from '../../flags.js';

export default Command({
  description: 'Apply the local schema to the server',
  middleware: [
    createServerRequesterMiddleware({ destructive: true }),
    projectSchemaMiddleware,
  ],
  flags: {
    force: Flag.Boolean({
      description:
        'Force push the schema to the server, ignoring backwards incompatible changes',
      required: false,
      default: false,
      char: 'f',
    }),
    printIssues: Flag.Boolean({
      description: 'Print issues even if successful',
      char: 'p',
      required: false,
      default: false,
    }),
  },
  run: async ({ ctx, flags }) => {
    let data;
    const failOnBackwardsIncompatibleChange = !flags.force;
    const localSchema = await ctx.projectSchema.getSchema();
    let pushSpinner: Ora | undefined;
    try {
      data = await ctx.remote.request(
        'POST',
        '/override-schema',
        {
          schema: localSchema,
          failOnBackwardsIncompatibleChange,
        },
        {
          hooks: {
            beforeRequest: () => {
              pushSpinner = ora('Pushing schema to server').start();
            },
          },
        }
      );
      pushSpinner?.succeed('Schema pushed to server');
    } catch (e) {
      pushSpinner?.fail('Failed to push schema to server');
      data = e;
    }
    if (!Object.hasOwn(data, 'successful') || !Object.hasOwn(data, 'issues')) {
      console.error(data);
      process.exit(1);
    }
    logSchemaChangeViolations(data, {
      forcePrintIssues: failOnBackwardsIncompatibleChange || flags.printIssues,
      // @ts-expect-error TODO: properly implement logger
      logger: {
        warn: (message, ...args) =>
          console.log(Colors.yellow(message), ...args),
        info: (message, ...args) => console.log(Colors.blue(message), ...args),
        error: (message, ...args) => console.log(Colors.red(message), ...args),
        debug: () => {},
      },
    });
    if (!data.successful) {
      process.exit(1);
    }
  },
});
