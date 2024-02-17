import { blue, green, yellow } from 'ansis/colors';
import { Command } from '../../command.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { readLocalSchema } from '../../schema.js';
import { JSONToSchema, schemaToJSON } from '@triplit/db';
import jsondiffpatch from 'jsondiffpatch';
import { createMigration } from '../../migration.js';

export default Command({
  description: 'Show the diff between local and remote schema',
  middleware: [serverRequesterMiddleware],
  run: async ({ ctx }) => {
    const localSchema = schemaToJSON({
      collections: await readLocalSchema(),
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
    console.log('Schema diff:');
    console.log(
      jsondiffpatch.formatters.console
        // @ts-expect-error
        .format(delta)
    );
    console.log();
    const migration = createMigration(localSchema, serverSchema, 0, 0, 'diff');
    console.log('Operations to sync schemas:');
    console.log(
      migration.up.length
        ? migration.up
        : blue`No operations needed. Schemas are in sync.`
    );
  },
});
