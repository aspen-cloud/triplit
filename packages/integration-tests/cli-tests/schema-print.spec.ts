import { $ } from 'execa';
import { it, expect, beforeEach, describe } from 'vitest';
import path from 'path';
import {
  schemaFileContentFromSchema,
  writeSchemaFile,
} from '../../cli/src/schema.js';
import { Models, Schema as S } from '@triplit/db';
import { serverRequesterMiddleware } from '../../cli/src/middleware/add-server-requester.js';
import { emptyDir } from 'fs-extra';
import { ServerOptions } from '../../server/src/hono.js';
import { tempTriplitServer } from '../utils/server.js';
import { evalJSString, transpileTsString } from '../../cli/src/filesystem.js';

const PORT = 8888;
const serviceToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoicHJvamVjdCJ9.gcDKyZU9wf8o43Ca9kUVXO4KsGwX8IhhyEg1PO1ZqiQ';

const env = {
  TRIPLIT_JWT_SECRET: 'test-secret',
  TRIPLIT_SERVICE_TOKEN: serviceToken,
  TRIPLIT_PROJECT_ID: 'project',
};
process.env = { ...process.env, ...env };

// For server, also setup PROJECT and JWT_SECRET ... feels like maybe we should refactor this
process.env.PROJECT_ID = process.env.TRIPLIT_PROJECT_ID;
process.env.JWT_SECRET = process.env.TRIPLIT_JWT_SECRET;

const projectPath = path.join(__dirname, 'project');
const triplitPath = path.join(projectPath, 'triplit');
const $shell = $({ cwd: projectPath, env, reject: true });

async function writeLocalSchema(collections: Models, path?: string) {
  const schema = {
    collections,
  };
  const schemaFileContent = schemaFileContentFromSchema(schema);
  await writeSchemaFile(schemaFileContent, { path });
}

async function readRemoteSchema() {
  let stdout;
  try {
    const output = await $shell`yarn triplit schema print --location=remote`;
    stdout = output.stdout;
  } catch (e) {
    console.error(e);
  }
  // If no schema, return undefined
  if (!stdout) return undefined;
  const transpiled = transpileTsString(stdout);
  return await evalJSString(transpiled);
}

async function generateNetworkCtx(ctx: any, port: number) {
  const result = await serverRequesterMiddleware.run({
    flags: {
      token: serviceToken,
      remote: `http://localhost:${port}`,
    },
    args: [],
    ctx,
  });
  if (result) {
    ctx = { ...ctx, ...result };
  }
  return ctx;
}

async function withServerAndCtx(
  options: { port: number; serverOptions?: ServerOptions },
  callback: (ctx: any, server: any) => void | Promise<void>
) {
  using server = await tempTriplitServer(options);
  process.env.TRIPLIT_DB_URL = `http://localhost:${server.port}`;
  const ctx = await generateNetworkCtx({}, server.port);
  await callback(ctx, server);
}
