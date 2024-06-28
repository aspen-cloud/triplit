import {computed, ref, watchEffect } from 'vue'
import { ConnectionStatus, TriplitClient } from '@triplit/client';
import type { WorkerClient } from '@triplit/client/worker-client';

export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
) {
  const status = ref<ConnectionStatus>('CONNECTING');

  watchEffect(() => {
    const unsub = client.onConnectionStatusChange((newStatus) => {
      status.value = newStatus;
    }, true);
    return () => {
      unsub();
    };
  });

  return { status: computed(() => status.value)};
}
