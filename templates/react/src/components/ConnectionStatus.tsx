import { useConnectionStatus } from '@triplit/react';
import { triplit } from '../../triplit/client.ts';

export function ConnectionStatus() {
  const status = useConnectionStatus(triplit);
  return (
    <div className="connection-status">
      <div className={`indicator ${status.toLowerCase()}`}></div>
      {status === 'CLOSED'
        ? 'Offline'
        : status === 'CONNECTING'
        ? 'Connecting'
        : 'Online'}
    </div>
  );
}
