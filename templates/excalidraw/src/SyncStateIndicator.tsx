import { CloudCheck, CloudWarning } from '@phosphor-icons/react';
import { useConnectionStatus } from '@triplit/react';
import { client, useUnsyncedElements } from './triplit';

export function SyncStateIndicator() {
  const connectionStatus = useConnectionStatus(client);
  const { results: unsyncedChanges } = useUnsyncedElements();
  const isConnected = connectionStatus === 'OPEN';
  const statusText =
    unsyncedChanges && unsyncedChanges.size > 0
      ? `${unsyncedChanges.size} unsynced element${
          unsyncedChanges.size > 1 ? 's' : ''
        }`
      : isConnected
      ? 'All changes synced'
      : 'Not connected to Triplit';
  return (
    <div
      className="text-sm shrink-[2] overflow-hidden flex flex-row gap-2 py-2 px-3 items-center justify-center text-zinc-300"
      title={statusText}
    >
      {!isConnected || (unsyncedChanges && unsyncedChanges.size > 0) ? (
        <CloudWarning className="shrink-0" size={20} />
      ) : (
        <CloudCheck className="shrink-0" size={20} />
      )}
      <span className="hidden truncate min-[500px]:inline-block">
        {statusText}
      </span>
    </div>
  );
}
