import React from 'react';
import { Box, Newline, Text } from 'ink';
import {
  createServer as createDBServer,
  durableStoreKeys,
  storeKeys,
} from '@triplit/server';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { CWD, getDataDir, getTriplitDir } from '../filesystem.js';
import { Command } from '../command.js';
import * as Flag from '../flags.js';
import chokidar from 'chokidar';
import { hashSchemaJSON, schemaToJSON } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import { insertSeeds } from './seed/run.js';
import { projectSchemaMiddleware } from '../middleware/project-schema.js';
import { schemaFileContentFromJSON, writeSchemaFile } from '../schema.js';

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
    watch: Flag.Boolean({
      char: 'w',
      description: 'Watch for schema changes',
      hidden: true,
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
    upstreamUrl: Flag.String({
      description: 'URL of the upstream server',
    }),
    upstreamToken: Flag.String({
      description: 'Token to be used with the upstream server',
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

    // If we have durable storage, setup db path
    if (durableStoreKeys.includes(flags.storage as any)) {
      // Check dependenies as needed
      switch (flags.storage as (typeof durableStoreKeys)[number]) {
        case 'leveldb':
          checkLevelDBDependency();
        case 'lmdb':
          checkLMDBDependency();
        case 'sqlite':
          checkSQLiteDependency();
        default:
          break;
      }

      // Setup the database path
      const dataDir = getDataDir();
      const storagePath = path.join(dataDir, flags.storage, 'app.db');
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
    const collections = ctx.schema;
    const roles = ctx.roles;
    const schema =
      collections && flags.initWithSchema
        ? { collections, roles, version: 0 }
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

    const startDBServer = createDBServer({
      storage: flags.storage || 'memory',
      dbOptions: {
        schema,
      },
      watchMode: !!flags.watch,
      verboseLogs: !!flags.verbose,
      upstream,
    });
    let watcher: chokidar.FSWatcher | undefined = undefined;
    let remoteSchemaUnsubscribe = undefined;
    const dbServer = startDBServer(dbPort, async () => {
      const schemaPath = path.join(getTriplitDir(), 'schema.ts');
      watcher = chokidar.watch(schemaPath, {
        awaitWriteFinish: true,
      });
      if (flags.watch) {
        const client = new TriplitClient({
          serverUrl: `http://localhost:${dbPort}`,
          token: serviceKey,
          syncSchema: true,
        });
        await client.db.ready;
        const schemaPath = path.join(getTriplitDir(), 'schema.ts');
        const schemaQuery = client
          .query('_metadata')
          .entityId('_schema')
          // Avoid firing on optimistic changes
          .syncStatus('confirmed')
          .build();

        /**
         * There's a few problems here:
         * - syncStatus('confirmed') as currently implemented is a poor abstraction for this, we really want to subscribe purely to remote changes
         * - Race conditions around file reading/writing as updates come in
         *
         * Causes:
         * - Remote changes come into the cache in two messages 'TRIPLES' and 'TRIPLES_ACK' (usually in that order), causing two updates. The first will not include your changes.
         * - We dont queue up the subscription calls to await eachother...I think tough to do as they'll be in different transactions
         */
        remoteSchemaUnsubscribe = client.subscribe(
          schemaQuery,
          async (results, info) => {
            // Avoid firing on potentially stale results
            if (info.hasRemoteFulfilled) {
              const schemaJSON = results.get('_schema');
              const resultHash = hashSchemaJSON(schemaJSON.collections);
              const fileSchema = schemaToJSON({
                collections: ctx.schema,
                version: 0,
              });
              const currentFileHash = hashSchemaJSON(fileSchema.collections);

              // If no diff, do nothing
              if (resultHash === currentFileHash) {
                return;
              }

              const content = schemaFileContentFromJSON(schemaJSON);

              // Unwatch the file to avoid infinite loop
              watcher.unwatch(schemaPath);
              await writeSchemaFile(content);
              watcher.add(schemaPath);
            }
          },
          (error) => {
            console.log('An error occurred in the schema change subscription');
            console.error(error);
          }
        );

        // On file changes, update the schema
        watcher.on('change', async () => {
          const collections = ctx.schema;
          const schema = collections
            ? schemaToJSON({ collections, version: 0 })
            : undefined;

          // Bulk updates the schema
          // TODO: apply more granular updates with schema diffing
          await client.update('_metadata', '_schema', (entity) => {
            delete entity.collections;
            entity.collections = schema.collections;
          });
        });
      } else {
        watcher.on('change', async () => {
          console.warn(
            'Schema file changed. Restart the dev server or run\n\n`triplit schema push`\n\nto apply the new schema.'
          );
        });
      }
    });

    process.on('SIGINT', function () {
      remoteSchemaUnsubscribe?.();
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

    if (flags.seed !== undefined)
      await insertSeeds(dbUrl, serviceKey, flags.seed, false, ctx.schema);

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
