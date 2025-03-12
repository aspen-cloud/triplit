import { reactive, watchEffect } from 'vue';
import { ConnectionStatus, TriplitClient } from '@triplit/client';
import { WorkerClient } from '@triplit/client/worker-client';

/**
 * A composable that subscribes to the connection status of a client with the server
 *
 * @param client - The client instance to get the connection status of
 * @returns An object containing `connectionStatus` that indicates the current connection status of the client with the server
 */
export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
) {
  const connection = reactive<{ status: ConnectionStatus }>({
    status: client.connectionStatus,
  });

  watchEffect((cleanup) => {
    const unsub = client.onConnectionStatusChange((newStatus) => {
      connection.status = newStatus;
    }, true);
    cleanup(unsub);
  });

  return connection;
}
