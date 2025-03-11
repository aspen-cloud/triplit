import { ImportServerForm } from './import-server-form';
import { ServerInfoForm } from './server-info-form';
import { ServerSelector } from './server-selector';
import { DownloadSimple, FolderOpen, Info, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useServerState } from './server-provider';
import {
  Modal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@triplit/ui';
import { DeleteServerDialog } from './delete-server-dialog';
import { addServerToConsole } from 'src/utils/server.js';
import { useQueryOne } from '@triplit/react';
import { consoleClient } from 'triplit/client.js';

export function ServerOptionsMenu({ children }: { children: React.ReactNode }) {
  const [serverHost, setServerHost] = useServerState();
  const [infoModalIsOpen, setInfoModalIsOpen] = useState(false);
  const [selectModalIsOpen, setSelectModalIsOpen] = useState(false);
  const [importModalIsOpen, setImportModalIsOpen] = useState(false);
  const [deleteServerDialogIsOpen, setDeleteServerDialogIsOpen] =
    useState(false);
  const { result: server } = useQueryOne(
    consoleClient,
    consoleClient.query('servers').Where('id', '=', serverHost)
  );
  if (!(server && serverHost)) return children;
  return (
    <>
      <DeleteServerDialog
        serverName={server?.displayName}
        open={deleteServerDialogIsOpen}
        onOpenChange={setDeleteServerDialogIsOpen}
      />
      <Modal open={selectModalIsOpen} onOpenChange={setSelectModalIsOpen}>
        <ServerSelector
          handleImportServer={() => {
            setSelectModalIsOpen(false);
            setImportModalIsOpen(true);
          }}
          handleSelectServer={() => {
            setSelectModalIsOpen(false);
          }}
        />
      </Modal>
      <Modal
        open={infoModalIsOpen}
        onOpenChange={setInfoModalIsOpen}
        title="Server info"
      >
        <ServerInfoForm serverId={serverHost} />
      </Modal>
      <Modal
        open={importModalIsOpen}
        onOpenChange={setImportModalIsOpen}
        title="Connect to a server"
      >
        <ImportServerForm
          onSubmit={async (values) => {
            try {
              const serverId = await addServerToConsole(values);
              setServerHost(serverId);
              setImportModalIsOpen(false);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      </Modal>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-[200px]">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setInfoModalIsOpen(true)}>
              <Info size={18} className="w-5 h-5 mr-3" />
              Server info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectModalIsOpen(true)}>
              <FolderOpen size={18} className="w-5 h-5 mr-3" />
              Change servers
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportModalIsOpen(true)}>
              <DownloadSimple size={18} className="w-5 h-5 mr-3" />
              Connect to a server
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => setDeleteServerDialogIsOpen(true)}
            className={'text-red-500'}
          >
            <Trash size={18} className="w-5 h-5 mr-3" />
            {`Delete ${server?.displayName}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
