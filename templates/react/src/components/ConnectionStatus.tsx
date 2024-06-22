import { useConnectionStatus } from '@triplit/react';
import { triplit } from '../../triplit/client.ts';

export function ConnectionStatus() {
  const status = useConnectionStatus(triplit);
  return (
    <div className="connection-status">
      {status === 'OPEN'
        ? 'Connected'
        : status === 'CONNECTING'
        ? 'Connecting...'
        : 'Disconnected'}
    </div>
  );
}
