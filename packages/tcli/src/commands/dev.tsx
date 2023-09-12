import React from 'react';
import { Box, Text } from 'ink';
// import createServer from '../../../../../packages/server/src/server';
// import TriplitServer from '@triplit/server';
// import { createServer as createConsoleServer } from '@triplit/console';
import jwt from 'jsonwebtoken';

export const description = 'Starts the Triplit development environment';
export const flags = {};
export const args = {};

export async function run() {
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ?? 'jwt-key-for-development-only';
  // const startDBServer = TriplitServer.createServer();
  // const dbServer = startDBServer(6543);
  // const consoleServer = await createConsoleServer();
  // await consoleServer.listen(6542);
  // consoleServer.printUrls();

  const serviceKey = jwt.sign(
    {
      'x-triplit-token-type': 'secret',
      'x-triplit-project-id': 'local-project-id',
    },
    process.env.JWT_SECRET
  );

  process.on('SIGINT', function () {
    // dbServer.close();
    // consoleServer.close();
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={12}>
          <Text bold>🟢 DB</Text>
        </Box>
        <Text dimColor>[Port {6543}]</Text>
      </Box>
      <Box>
        <Box width={12}>
          <Text bold>🟢 Console</Text>
        </Box>
        <Text color="cyan">{`http://localhost:${6542}`}</Text>
      </Box>
      {/* <Box flexDirection="column" padding={1}> */}
      <Text bold underline>
        Service Key
      </Text>
      <Text>{serviceKey}</Text>
      {/* </Box> */}
    </Box>
  );
}
