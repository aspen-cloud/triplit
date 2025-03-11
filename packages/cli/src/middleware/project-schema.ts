import { Middleware } from '../middleware.js';
import * as Flag from '../flags.js';
import { getDefaultSchemaPath, loadTsModule } from '../filesystem.js';
import fs from 'fs';
import { DBSchema } from '@triplit/entity-db';
import { yellow } from 'ansis/colors';

/**
 * Loads the schema
 */
export const projectSchemaMiddleware = Middleware({
  name: 'Project Schema',
  flags: {
    schemaPath: Flag.String({
      description: 'File path to the local schema file',
      required: false,
    }),
    // Flag to throw schema if not found
    requireSchema: Flag.Boolean({
      description: 'Throw an error if no local schema file is found',
      required: false,
      default: false,
    }),
  },
  run: async ({
    flags,
  }): Promise<{
    projectSchema: {
      getSchema: () => Promise<DBSchema | undefined>;
      schemaPath: string;
    };
  }> => {
    const schemaPath = flags.schemaPath ?? getDefaultSchemaPath();
    const getSchema = createSchemaLoader({
      schemaPath,
      requireSchema: flags.requireSchema,
    });

    return { projectSchema: { getSchema, schemaPath } };
  },
});

function createSchemaLoader({
  schemaPath,
  requireSchema,
}: {
  schemaPath: string;
  requireSchema: boolean;
}): () => Promise<DBSchema | undefined> {
  return async () => {
    if (!fs.existsSync(schemaPath)) {
      if (requireSchema)
        throw new Error(
          `Schema file not found at ${schemaPath}. You may specify a different location with the --schemaPath flag.`
        );
      console.warn(yellow(`No schema file found at ${schemaPath}.`));
      return undefined;
    }
    const result = await loadTsModule(schemaPath);
    if (!result) {
      throw new Error(
        `Failed to load schema from ${schemaPath}, even though it exists. Please check the file for errors.`
      );
    }
    return {
      collections: result.schema,
      roles: result.roles,
    } as DBSchema;
  };
}
