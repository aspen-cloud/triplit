import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { serverRequesterMiddleware } from '../../middleware/add-server-requester.js';
import {
  JSONToSchema,
  schemaToJSON,
  exportSchemaAsJSONSchema,
} from '@triplit/db';
import { format as formatFile } from 'prettier';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';
import { schemaFileContentFromSchema } from '../../schema.js';

const DISPLAY_FORMATS = ['json', 'typescript', 'file', 'json-schema'] as const;
type SchemaFormat = (typeof DISPLAY_FORMATS)[number];

export default Command({
  description: 'View the schema of the current project',
  flags: {
    location: Flag.Enum({
      char: 'l',
      description: 'Location of the schema file',
      options: ['local', 'remote'],
      default: 'remote',
    }),
    format: Flag.Enum({
      char: 'f',
      description: 'Format of the output',
      options: DISPLAY_FORMATS,
      default: 'typescript',
    }),
  },
  middleware: [serverRequesterMiddleware, projectSchemaMiddleware],
  run: async ({ flags, ctx }) => {
    const location = flags.location;
    if (location === 'local') {
      const schema = ctx.schema;
      const roles = ctx.roles;
      if (!schema) return;
      const formattedSchema = await formatSchemaForDisplay(
        { collections: schema, roles, version: 0 },
        flags.format as SchemaFormat
      );
      console.log(formattedSchema);
    }
    if (location === 'remote') {
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
        console.log(formattedSchema);
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
    return JSON.stringify(schemaToJSON(schema), null, 2);
  }
  if (format === 'json-schema') {
    return JSON.stringify(
      exportSchemaAsJSONSchema(schema.collections),
      null,
      2
    );
  }
  if (format === 'file' || format === 'typescript') {
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
