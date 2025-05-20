import { durableStoreKeys } from '@triplit/server';
import { execa } from 'execa';
import { it, expect, describe } from 'vitest';
import path from 'path';
import { setTimeout } from 'timers/promises';

const projectPath = path.join(__dirname, 'project');
const BASE_PORT = 9090; // Choose a starting port

describe.each(
  durableStoreKeys.map((storage, index) => ({
    storage,
    port: BASE_PORT + index, // Use different port for each storage type
  }))
)('%s', async ({ storage, port }) => {
  it('should be able to start the server with durable storage', async () => {
    // Start the server process without waiting for it to complete
    const serverProcess = execa(
      'yarn',
      ['triplit', 'dev', '--storage', storage, '--dbPort', port.toString()],
      {
        cwd: projectPath,
        reject: false,
      }
    );

    // Wait for the server to start (checking for successful startup)
    const isServerRunning = await checkServerRunning(port, 2000);
    expect(isServerRunning).toBe(true);

    serverProcess.kill('SIGTERM');
    try {
      await serverProcess;
    } catch (error: any) {
      // Ignore expected errors from terminating the process
      if (!error.killed) {
        console.error(`Error terminating server: ${error.message}`);
      }
    }
  });
});

async function checkServerRunning(port: number, timeout: number) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Try to connect to the server using fetch with HEAD method for efficiency
      const response = await fetch(`http://localhost:${port}/healthcheck`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000), // Abort after 1 second
      });

      // If we get any response, the server is running
      return true;
    } catch (e) {
      console.error(e);
      // Wait a bit before trying again
      await setTimeout(200);
    }
  }

  return false; // Server didn't start
}
