import { Button } from '@triplit/ui';
import { DownloadSimple } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useServerState } from './server-provider';
import { useServers } from '../hooks/useServer';
import { useNavigate } from 'react-router-dom';

export function ServerSelector({
  handleImportServer,
  handleSelectServer,
}: {
  handleImportServer: () => void;
  handleSelectServer?: (serverHost: string) => void;
}) {
  const [serverHost] = useServerState();
  const servers = useServers();

  const serverList = useMemo(
    () => (servers ? Array.from(servers.values()) : []),
    [servers]
  );

  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3">
      <div className="self-center text-zinc-500 text-sm">
        Connect to a server
      </div>
      {serverList.map(({ id, displayName, url }) => (
        <Button
          key={id}
          style={{ height: 50 }}
          onClick={() => {
            handleSelectServer && handleSelectServer(id);
            navigate('/' + id);
          }}
          variant={serverHost && serverHost === id ? 'default' : 'ghost'}
          className="flex flex-row"
        >
          <div>{displayName}</div>
          <div className="text-xs ml-3 font-normal">{url}</div>
        </Button>
      ))}
      <div className="self-center text-zinc-500 text-sm">or</div>
      <Button variant={'ghost'} onClick={handleImportServer}>
        <DownloadSimple size={18} />
        <div className="ml-2">Connect to a new server</div>
      </Button>
    </div>
  );
}
