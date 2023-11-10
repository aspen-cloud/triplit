import React from 'react';
import { Box, Newline, Spacer, Text } from 'ink';
import { createServer as createConsoleServer } from '@triplit/console';
import { createServer as createDBServer } from '@triplit/server';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { getDataDir } from '../filesystem.js';
import { Command } from '../command.js';
import * as Flag from '../flags.js';

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
  },
  async run({ flags }) {
    const consolePort = flags.consolePort || 6542;
    const dbPort = flags.dbPort || 6543;

    process.env.JWT_SECRET =
      process.env.TRIPLIT_JWT_SECRET ?? 'jwt-key-for-development-only';
    process.env.PROJECT_ID =
      process.env.TRIPLIT_PROJECT_ID ?? 'local-project-id';
    process.env.CLAIMS_PATH = process.env.TRIPLIT_CLAIMS_PATH;

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

    const startDBServer = createDBServer({
      storage: flags.storage || 'memory',
    });
    const dbServer = startDBServer(dbPort);
    const consoleServer = createConsoleServer('../../console', {
      token: serviceKey,
      projName: 'triplit-test',
      server: `http://localhost:${dbPort}`,
    });
    consoleServer.listen(consolePort);

    process.on('SIGINT', function () {
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
          </Box>
        </Box>
      </>
    );
  },
});
