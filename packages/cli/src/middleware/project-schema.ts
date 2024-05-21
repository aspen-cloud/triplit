import { Middleware } from '../middleware.js';
import * as Flag from '../flags.js';
import { getTriplitDir, loadTsModule } from '../filesystem.js';
import path from 'path';
import fs from 'fs';

export const projectSchemaMiddleware = Middleware({
  name: 'Project Schema',
  flags: {
    schemaPath: Flag.String({
      description: 'File path to the schema file',
      required: false,
      char: 'P',
    }),
    noSchema: Flag.Boolean({
      description: 'Do not load a schema file',
      char: 'N',
    }),
  },
  run: async ({ flags }) => {
    if (flags.noSchema) return { schema: undefined };
    let schemaPath =
      flags.schemaPath ??
      process.env.TRIPLIT_SCHEMA_PATH ??
      path.join(getTriplitDir(), 'schema.ts');
    if (!fs.existsSync(schemaPath)) {
      return `Schema file not found at ${schemaPath}`;
    }
    const result = await loadTsModule(schemaPath);

    if (!result) {
      return `Failed to load schema file at ${schemaPath}`;
    }
    if (!result.schema) {
      return `${schemaPath} does not export an object named 'schema'`;
    }

    return { schema: result.schema } as const;
  },
});
