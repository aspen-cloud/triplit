import { blue, yellow } from 'ansis/colors';
import { Command } from '../../command.js';
import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';
import { diffSchemas } from '@triplit/db';
import * as Flag from '../../flags.js';

export default Command({
  description: 'Show the diff between local and remote schema',
  middleware: [
    createServerRequesterMiddleware({ destructive: false }),
    projectSchemaMiddleware,
  ],
  flags: {
    ahead: Flag.Enum({
      description:
        'When comparing the local and remote schemas, which one should be considered ahead of the other',
      options: ['local', 'remote'],
      default: 'local',
      char: 'a',
      required: false,
    }),
  },
  run: async ({ ctx, flags }) => {
    const localSchema = await ctx.projectSchema.getSchema();
    const serverSchemaResponse = await ctx.remote.request('POST', '/schema', {
      format: 'json',
    });
    const serverSchema =
      serverSchemaResponse.type === 'schema'
        ? serverSchemaResponse.schema
        : null;

    if (!localSchema) console.log(yellow`Local project is schemaless`);
    if (!serverSchema) console.log(yellow`Remote database is schemaless`);
    if (localSchema && serverSchema) {
      let diff =
        flags.ahead === 'local'
          ? diffSchemas(serverSchema, localSchema)
          : diffSchemas(localSchema, serverSchema);
      // If the local schema doesn't have roles defined
      // the remote server will have the DEFAULT_ROLES
      // but that's not really a difference that the user
      // can control or should care about
      if (!localSchema.roles)
        diff = diff.filter(({ _diff }) => _diff !== 'roles');
      // TODO: prettify diff output
      if (diff.length === 0) {
        console.log(
          blue('No differences found between local and remote schema.')
        );
        return;
      }
      console.dir(diff, { depth: null });
    }
  },
});
