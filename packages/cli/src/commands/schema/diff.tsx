import { yellow } from 'ansis/colors';
import { Command } from '../../command.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { schemaToJSON } from '@triplit/db';
import jsondiffpatch from 'jsondiffpatch';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';

export default Command({
  description: 'Show the diff between local and remote schema',
  middleware: [serverRequesterMiddleware, projectSchemaMiddleware],
  run: async ({ ctx }) => {
    const localSchema = schemaToJSON({
      collections: ctx.schema,
      version: 0,
    })?.collections;
    const serverSchemaResponse = await ctx.requestServer('POST', '/schema', {
      format: 'json',
    });
    const serverSchema =
      serverSchemaResponse.type === 'schema'
        ? serverSchemaResponse.schema?.collections
        : null;

    if (!localSchema) console.log(yellow`Local project is schemaless`);
    if (!serverSchema) console.log(yellow`Remote database is schemaless`);
    const delta = jsondiffpatch.diff(localSchema ?? {}, serverSchema ?? {});
    if (!delta) {
      console.log('Local and remote schemas are in sync (no difference)');
      return;
    }
    console.log('Schema diff:');
    console.log(
      jsondiffpatch.formatters.console
        // @ts-expect-error
        .format(delta)
    );
  },
});
