import { computed, ref, watchEffect, type ComputedRef } from 'vue';
import { ConnectionStatus, TriplitClient } from '@triplit/client';
import type { WorkerClient } from '@triplit/client/worker-client';

/**
 * A composable that subscribes to the connection status of a client with the server
 *
 * @param client - The client instance to get the connection status of
 * @returns An object containing `connectionStatus` that indicates the current connection status of the client with the server
 */
export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
): {
  connectionStatus: ComputedRef<ConnectionStatus>;
} {
  const status = ref<ConnectionStatus>('CONNECTING');

  watchEffect(() => {
    const unsub = client.onConnectionStatusChange((newStatus) => {
      status.value = newStatus;
    }, true);
    return () => {
      unsub();
    };
  });

  return { connectionStatus: computed(() => status.value) };
}
