import { Command } from '../../command.js';
import * as Flag from '../../flags.js';
import { createServerRequesterMiddleware } from '../../middleware/add-server-requester.js';
import { projectSchemaMiddleware } from '../../middleware/project-schema.js';
import { normalizeSessionVars, getRolesFromSession } from '@triplit/db';

import * as JWT from 'jsonwebtoken';

export default Command({
  description: 'See what roles the given token is allowed to assume',
  flags: {
    location: Flag.Enum({
      char: 'l',
      description: 'Location of the schema file',
      options: ['local', 'remote'],
      default: 'remote',
    }),
  },
  args: [
    {
      description: 'A JWT token or a JSON-parseable string of claims',
      name: 'token',
      required: false,
    },
  ],
  middleware: [
    createServerRequesterMiddleware({ destructive: false }),
    projectSchemaMiddleware,
  ],
  run: async ({ flags, ctx, args }) => {
    let roleToken = args.token;
    let parsedClaims;
    try {
      parsedClaims = JWT.decode(roleToken);
      if (parsedClaims === null || typeof parsedClaims === 'string') {
        parsedClaims = JSON.parse(roleToken);
      }
    } catch (e) {
      console.error('Input could not be parsed as JSON');
      return;
    }
    parsedClaims = normalizeSessionVars(parsedClaims);
    let schema;
    if (flags.location === 'remote') {
      const serverSchemaResponse = await ctx.remote.request('POST', '/schema', {
        format: 'json',
      });
      if (serverSchemaResponse.type === 'schemaless') {
        console.log(
          'No schema found on server. Try running `triplit schema push`'
        );
        return;
      }
      schema = serverSchemaResponse.schema;
    } else {
      const localSchema = await ctx.projectSchema.getSchema();
      if (!localSchema?.roles) {
        console.log('No roles found in schema');
        return;
      }
      schema = localSchema;
    }
    if (!schema.roles) {
      console.log('No roles found in schema');
      return;
    }
    console.log();
    console.log('Token claims:');
    console.log(parsedClaims);
    console.log();
    console.log(`Roles (from ${flags.location} schema):`);
    console.log(getRolesFromSession(schema, parsedClaims));
    console.log();
    return;
  },
});
