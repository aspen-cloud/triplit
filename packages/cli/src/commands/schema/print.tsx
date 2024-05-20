import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { JSONToSchema, schemaToJSON } from '@triplit/db';
import { schemaFileContentFromSchema } from '../migrate/codegen.js';
import { format as formatFile } from 'prettier';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';

const DISPLAY_FORMATS = ['json', 'file'] as const;
type SchemaFormat = (typeof DISPLAY_FORMATS)[number];

export default Command({
  description: 'View the schema of the current project',
  flags: {
    location: Flag.Enum({
      char: 'l',
      description: 'Location of the schema file',
      options: ['local', 'remote', 'both'],
      default: 'both',
    }),
    raw: Flag.Boolean({
      char: 'r',
      description:
        'Print exclusively the requested schema (useful for exporting to file)',
    }),
    format: Flag.Enum({
      char: 'f',
      description: 'Format of the output',
      options: DISPLAY_FORMATS,
      default: 'json',
    }),
  },
  middleware: [serverRequesterMiddleware, projectSchemaMiddleware],
  run: async ({ flags, ctx }) => {
    const alwaysLog = console.log;
    if (flags.raw) console.log = () => {};
    const locations =
      flags.location === 'both' ? ['local', 'remote'] : [flags.location];
    if (locations.includes('local')) {
      console.log('Local schema:');
      const schema = ctx.schema;
      if (!schema) return;
      const formattedSchema = await formatSchemaForDisplay(
        { collections: schema, version: 0 },
        flags.format as SchemaFormat
      );
      alwaysLog(formattedSchema);
    }
    if (locations.includes('remote')) {
      console.log('Remote schema:');
      const serverSchemaResponse = await ctx.requestServer('POST', '/schema', {
        format: 'json',
      });
      if (serverSchemaResponse.type === 'schemaless') {
        return;
      } else if (serverSchemaResponse.type === 'schema') {
        const { schema: schemaJSON } = serverSchemaResponse;
        const schema = JSONToSchema(schemaJSON);
        const formattedSchema = await formatSchemaForDisplay(
          schema,
          flags.format as SchemaFormat
        );
        alwaysLog(formattedSchema);
      } else {
        throw new Error('Unexpected response from server');
      }
    }
  },
});

async function formatSchemaForDisplay(
  schema,
  format: SchemaFormat
): Promise<string> {
  if (format === 'json') {
    return JSON.stringify(schemaToJSON(schema).collections, null, 2);
  }
  if (format === 'file') {
    return await formatFile(schemaFileContentFromSchema(schema), {
      parser: 'typescript',
    });
  }
  throw new Error(
    `Invalid format: ${format}. Format must be one of: ${DISPLAY_FORMATS.map(
      (f) => `'${f}'`
    ).join(', ')}`
  );
}
