import React from 'react';
import { Box, Newline, Text } from 'ink';
import {
  createServer as createDBServer,
  durableStoreKeys,
  storeKeys,
} from '@triplit/server';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs, { existsSync } from 'fs';
import { CWD, getDataDir, getTriplitDir } from '../filesystem.js';
import { Command } from '../command.js';
import * as Flag from '../flags.js';
import chokidar, { FSWatcher } from 'chokidar';
import { insertSeeds } from './seed/run.js';
import { projectSchemaMiddleware } from '../middleware/project-schema.js';
import { validateWebhookStructure } from './webhooks/push.js';
import { blue } from 'ansis/colors';
import { logger } from '@triplit/logger';
import { DevServerLogHandler } from '../log-handlers/dev-server-logs.js';

export default Command({
  description: 'Starts the Triplit development environment',
  middleware: [projectSchemaMiddleware],
  flags: {
    storage: Flag.Enum({
      options: storeKeys,
      char: 's',
      description: 'Database storage type',
    }),
    dbPort: Flag.Number({
      char: 'd',
      description: 'Port to run the database server on',
    }),
    verbose: Flag.Boolean({
      char: 'v',
      description: 'Verbose logging',
    }),
    initWithSchema: Flag.Boolean({
      char: 'i',
      description: 'Initialize the database with the local schema',
      default: true,
    }),
    seed: Flag.String({
      char: 'S',
      description: 'Seed the database with data',
    }),
    enableWebhooks: Flag.Boolean({
      description: 'Enable the sending of webhooks to the configured servers',
      char: 'e',
      default: false,
    }),
    upstreamUrl: Flag.String({
      description: 'URL of the upstream server',
      hidden: true,
    }),
    upstreamToken: Flag.String({
      description: 'Token to be used with the upstream server',
      hidden: true,
    }),
    inspect: Flag.Boolean({
      description: 'Enable node inspector',
      hidden: true,
      default: false,
    }),
  },
  async run({ flags, ctx }) {
    const dbPort = flags.dbPort || 6543;
    process.env.JWT_SECRET =
      process.env.TRIPLIT_JWT_SECRET ?? 'jwt-key-for-development-only';
    process.env.PROJECT_ID =
      process.env.TRIPLIT_PROJECT_ID ?? 'local-project-id';
    if (process.env.TRIPLIT_CLAIMS_PATH)
      process.env.CLAIMS_PATH = process.env.TRIPLIT_CLAIMS_PATH;
    if (process.env.TRIPLIT_EXTERNAL_JWT_SECRET)
      process.env.EXTERNAL_JWT_SECRET = process.env.TRIPLIT_EXTERNAL_JWT_SECRET;
    if (!flags.enableWebhooks) process.env.TRIPLIT_DISABLE_WEBHOOKS = 'true';
    // If we have durable storage, setup db path
    if (durableStoreKeys.includes(flags.storage as any)) {
      // Check dependenies as needed
      switch (flags.storage as (typeof durableStoreKeys)[number]) {
        case 'lmdb':
          checkLMDBDependency();
        case 'sqlite':
        case 'sqlite-worker':
          checkSQLiteDependency();
        default:
          break;
      }

      // Setup the database path
      const dataDir = getDataDir();
      const storageDirName =
        flags.storage === 'sqlite-worker' ? 'sqlite' : flags.storage;
      const storagePath = path.join(dataDir, storageDirName, 'app.db');
      if (!fs.existsSync(path.dirname(storagePath))) {
        fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      }
      process.env.LOCAL_DATABASE_URL = storagePath;
    }

    const serviceKey = jwt.sign(
      {
        'x-triplit-token-type': 'secret',
        'x-triplit-project-id': process.env.PROJECT_ID,
      },
      process.env.JWT_SECRET,
      { noTimestamp: true }
    );

    const anonKey = jwt.sign(
      {
        'x-triplit-token-type': 'anon',
        'x-triplit-project-id': process.env.PROJECT_ID,
      },
      process.env.JWT_SECRET,
      { noTimestamp: true }
    );

    const schema = flags.initWithSchema
      ? await ctx.projectSchema.getSchema()
      : undefined;

    let upstream = undefined;
    if (!!flags.upstreamUrl) {
      if (!flags.upstreamToken) {
        throw new Error('Both upstreamUrl and upstreamToken must be provided');
      }
      upstream = {
        url: flags.upstreamUrl,
        token: flags.upstreamToken,
      };
    }
    logger.registerHandler(
      new DevServerLogHandler({ verbose: flags.verbose }),
      { exclusive: true }
    );
    const startDBServer = await createDBServer({
      storage: flags.storage || 'memory',
      jwtSecret: process.env.JWT_SECRET,
      projectId: process.env.PROJECT_ID,
      externalJwtSecret: process.env.EXTERNAL_JWT_SECRET,
      dbOptions: {
        schema,
      },
      verboseLogs: !!flags.verbose,
      upstream,
      useNodeInspector: flags.inspect,
      maxPayloadMb: process.env.TRIPLIT_MAX_BODY_SIZE,
    });
    let watcher: FSWatcher | undefined = undefined;
    const dbServer = startDBServer(dbPort, async () => {
      watcher = chokidar.watch(ctx.projectSchema.schemaPath, {
        awaitWriteFinish: true,
      });
      watcher.on('change', async () => {
        console.warn(
          'Schema file changed. Restart the dev server or run\n\n`triplit schema push`\n\nto apply the new schema.'
        );
      });
    });

    process.on('SIGINT', function () {
      watcher?.close();
      dbServer.close();
      process.exit();
    });

    const dbUrl = `http://localhost:${dbPort}`;
    const isDefaultToken =
      serviceKey ===
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoibG9jYWwtcHJvamVjdC1pZCJ9.8Z76XXPc9esdlZb2b7NDC7IVajNXKc4eVcPsO7Ve0ug';
    const consoleUrl =
      'https://console.triplit.dev' +
      (isDefaultToken
        ? '/local'
        : `/localhost:${dbPort}?${new URLSearchParams({
            server: dbUrl,
            token: serviceKey,
            projName: CWD.split('/').pop() + '-local',
          }).toString()}`);

    if (flags.seed !== undefined) {
      await insertSeeds(
        dbUrl,
        serviceKey,
        flags.seed,
        false,
        schema?.collections
      );
    }

    const webhooksPath = path.resolve(
      process.env.TRIPLIT_WEBHOOK_CONFIG_PATH ??
        path.join(getTriplitDir(), 'webhooks.json')
    );

    if (existsSync(webhooksPath)) {
      const validJSONWebhooks = validateWebhookStructure(
        fs.readFileSync(webhooksPath, 'utf8')
      );
      if (validJSONWebhooks) {
        await fetch(dbUrl + '/webhooks-push', {
          method: 'POST',
          body: JSON.stringify({
            webhooks: validJSONWebhooks,
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
          },
        });
        console.log(
          'Webhooks config file found at',
          blue('./' + path.relative(CWD, webhooksPath))
        );
        console.log('Webhooks will not be sent in development mode.');
        console.log(
          `You can override this with the ${blue('--enableWebhooks')} flag`
        );
      }
    }
    return (
      <>
        <Newline />
        <Box flexDirection="column" gap={1}>
          <Text bold underline color={'magenta'}>
            Triplit Development Environment
          </Text>
          <Box flexDirection="column" gap={1}>
            <Text>
              You can access your local Triplit services at the following local
              URLs:
            </Text>
            <Box flexDirection="column">
              <Text bold>🟢 Console</Text>
              <Text color="cyan" wrap="end">
                {consoleUrl}
              </Text>
            </Box>
            <Box flexDirection="column">
              <Text bold>🟢 Database</Text>
              <Text color="cyan">{dbUrl}</Text>
            </Box>
            <Box flexDirection="column">
              <Text bold underline>
                Service Token
              </Text>
              <Text wrap="end">{serviceKey}</Text>
            </Box>
            <Box flexDirection="column">
              <Text bold underline>
                Anonymous Token
              </Text>
              <Text wrap="end">{anonKey}</Text>
            </Box>
            <Box flexDirection="column">
              <Text bold underline>
                Logs {flags.verbose ? '(verbose)' : ''}
              </Text>
            </Box>
          </Box>
        </Box>
        <Newline />
      </>
    );
  },
});

function checkLevelDBDependency() {
  try {
    import.meta.resolve('level');
  } catch (e) {
    console.log(e);
    console.error(
      "To use LevelDB storage, you must install 'level' as a dev dependency:"
    );
    console.error('npm install level --save-dev');
    process.exit(1);
  }
}

function checkLMDBDependency() {
  try {
    import.meta.resolve('lmdb');
  } catch (e) {
    console.error(
      "To use LMDB storage, you must install 'lmdb' as a dev dependency:"
    );
    console.error('npm install lmdb --save-dev');
    process.exit(1);
  }
}

function checkSQLiteDependency() {
  try {
    import.meta.resolve('better-sqlite3');
  } catch (e) {
    console.error(
      "To use SQLite storage, you must install 'better-sqlite3' as a dev dependency:"
    );
    console.error('npm install better-sqlite3 --save-dev');
    process.exit(1);
  }
}
