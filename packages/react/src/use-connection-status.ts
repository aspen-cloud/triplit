import { ConnectionStatus, TriplitClient } from '@triplit/client';
import type { WorkerClient } from '@triplit/client/worker-client';
import { useEffect, useState } from 'react';

export function useConnectionStatus(
  client: TriplitClient<any> | WorkerClient<any>
) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('CONNECTING');
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
