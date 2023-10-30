import { TriplitClient } from '@triplit/client';
import { useEffect, useState } from 'react';

export function useConnectionStatus(client: TriplitClient<any>) {
  const [connectionStatus, setConnectionStatus] = useState(
    client.syncEngine.connectionStatus
  );
  useEffect(() => {
    const unsub = client.syncEngine.onConnectionStatusChange(
      setConnectionStatus,
      true
    );
    return () => {
      unsub();
    };
  }, []);

  return connectionStatus;
}
