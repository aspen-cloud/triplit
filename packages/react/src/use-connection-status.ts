import { ConnectionStatus, TriplitClient } from '@triplit/client';
import type { WorkerClient } from '@triplit/client/worker-client';
import { useEffect, useState } from 'react';
/**
 * A React hook that subscribes to the connection status of a client with the server
 *
 * @param client - The client instance to get the connection status of
 * @returns The current connection status of the client with the server
 */
export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    client.connectionStatus
  );
  useEffect(() => {
    const unsub = client.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
    }, true);
    return () => {
      unsub();
    };
  }, [client]);

  return connectionStatus;
}
