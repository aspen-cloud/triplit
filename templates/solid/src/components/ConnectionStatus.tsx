import { useConnectionStatus } from '@triplit/solid';
import { triplit } from '../../triplit/client.ts';

export function ConnectionStatus() {
  const { status } = useConnectionStatus(triplit);
  return (
    <div class="connection-status">
      <div class={`indicator ${status().toLowerCase()}`}></div>
      {status() === 'CLOSED'
        ? 'Offline'
        : status() === 'CONNECTING'
          ? 'Connecting'
          : 'Online'}
    </div>
  );
}
