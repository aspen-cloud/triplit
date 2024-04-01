import { TriplitClient } from '@triplit/client';
import { useEffect, useState } from 'react';

export function useConnectionStatus(client: TriplitClient<any>) {
  const [connectionStatus, setConnectionStatus] = useState('OPENING');
  useEffect(() => {
    const unsub = client.onConnectionStatusChange(setConnectionStatus, true);
    return () => {
      unsub();
    };
  }, []);

  return connectionStatus;
}
