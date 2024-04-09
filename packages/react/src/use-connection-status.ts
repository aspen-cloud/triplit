import { ConnectionStatus, TriplitClient } from '@triplit/client';
import { useEffect, useState } from 'react';

export function useConnectionStatus(client: TriplitClient<any>) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('CONNECTING');
  useEffect(() => {
    const unsub = client.onConnectionStatusChange((status) => {
      setConnectionStatus(status);
    }, true);
    return () => {
      unsub();
    };
  }, []);

  return connectionStatus;
}
