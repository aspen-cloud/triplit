import React from 'react';
import { Box, Newline, Spacer, Text } from 'ink';
import { createServer as createConsoleServer } from '@triplit/console';
import { createServer as createDBServer } from '@triplit/server';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { getDataDir, getTriplitDir } from '../filesystem.js';
import { Command } from '../command.js';
import * as Flag from '../flags.js';
import { readLocalSchema } from '../schema.js';
import chokidar from 'chokidar';
import { hashSchemaJSON, schemaToJSON } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import {
  schemaFileContentFromJSON,
  writeSchemaFile,
} from './migrate/codegen.js';
import { emitKeypressEvents } from 'readline';

export default Command({
  description: 'Starts the Triplit development environment',
  flags: {
    storage: Flag.Enum({
      options: ['memory', 'sqlite'] as const,
      char: 's',
      description: 'Database storage type',
    }),
    consolePort: Flag.Number({
      char: 'c',
      description: 'Port to run the console server on',
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
      hidden: true,
    }),
  },
  async run({ flags }) {
    const consolePort = flags.consolePort || 6542;
    const dbPort = flags.dbPort || 6543;
    process.env.JWT_SECRET =
      process.env.TRIPLIT_JWT_SECRET ?? 'jwt-key-for-development-only';
    process.env.PROJECT_ID =
      process.env.TRIPLIT_PROJECT_ID ?? 'local-project-id';
    if (process.env.TRIPLIT_CLAIMS_PATH)
      process.env.CLAIMS_PATH = process.env.TRIPLIT_CLAIMS_PATH;
    if (process.env.TRIPLIT_EXTERNAL_JWT_SECRET)
      process.env.EXTERNAL_JWT_SECRET = process.env.TRIPLIT_EXTERNAL_JWT_SECRET;

    if (flags.storage === 'sqlite') {
      const dataDir = getDataDir();
      const sqlitePath = path.join(dataDir, 'sqlite', 'app.db');
      if (!fs.existsSync(path.dirname(sqlitePath))) {
        fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
      }
      process.env.LOCAL_DATABASE_URL = sqlitePath;
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
    let schema = undefined;
    if (flags.watch) {
      const collections = await readLocalSchema();
      if (collections) schema = { collections, version: 0 };
    }
    const startDBServer = createDBServer({
      storage: flags.storage || 'memory',
      dbOptions: {
        schema,
      },
      watchMode: !!flags.watch,
      verboseLogs: !!flags.verbose,
    });
    let watcher: chokidar.FSWatcher | undefined = undefined;
    let remoteSchemaUnsubscribe = undefined;
    const dbServer = startDBServer(dbPort, async () => {
      if (flags.watch) {
        const client = new TriplitClient({
          serverUrl: `http://localhost:${dbPort}`,
          token: serviceKey,
          syncSchema: true,
        });
        await client.db.ensureMigrated;
        const schemaPath = path.join(getTriplitDir(), 'schema.ts');
        const schemaQuery = client
          .query('_metadata')
          .entityId('_schema')
          // Avoid firing on optimistic changes
          .syncStatus('confirmed')
          .build();

        watcher = chokidar.watch(schemaPath, {
          awaitWriteFinish: true,
        });

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
                collections: await readLocalSchema(),
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
          const collections = await readLocalSchema();
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
      }
    });

    const consoleServer = createConsoleServer('../../console', {
      token: serviceKey,
      projName: 'triplit-test',
      server: `http://localhost:${dbPort}`,
    });
    consoleServer.listen(consolePort);

    process.on('SIGINT', function () {
      remoteSchemaUnsubscribe?.();
      watcher?.close();
      dbServer.close();
      consoleServer.close();
      process.exit();
    });

    return (
      <>
        <Newline />
        <Box flexDirection="column" gap={1}>
          <Text bold underline color={'magenta'}>
            Triplit Development Environment
          </Text>
          <Box flexDirection="column">
            <Text>
              You can access your local Triplit services at the following local
              URLs:
            </Text>
            <Box
              width={48}
              flexDirection="column"
              borderStyle="single"
              paddingX={1}
            >
              <Box>
                <Text bold>🟢 Console</Text>
                <Spacer />
                <Text color="cyan">{`http://localhost:${consolePort}`}</Text>
              </Box>
              <Box>
                <Text bold>🟢 Database</Text>
                <Spacer />
                <Text color="cyan">{`http://localhost:${dbPort}`}</Text>
              </Box>
            </Box>
          </Box>
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text bold underline>
                Service Key
              </Text>
              <Text wrap="end">{serviceKey}</Text>
            </Box>
            <Box flexDirection="column">
              <Text bold underline>
                Anon Token
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
