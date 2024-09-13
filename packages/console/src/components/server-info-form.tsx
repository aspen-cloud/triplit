import { useEffect, useState, useCallback } from 'react';
import {
  Input,
  Button,
  PasswordInput,
  FormField,
  CopyButtonWithTooltip,
} from '@triplit/ui';
import { consoleClient } from 'triplit/client.js';
import { useQueryOne } from '@triplit/react';

export function ServerInfoForm({ serverId }: { serverId: string }) {
  const { result: server, fetching } = useQueryOne(
    consoleClient,
    consoleClient.query('servers').where('id', '=', serverId).include('tokens')
  );

  const [draftName, setDraftName] = useState('');

  const cleanName = draftName.trim();

  const onSaveName = useCallback(async () => {
    await consoleClient.update('servers', serverId, async (originalEntity) => {
      originalEntity.displayName = cleanName;
    });
  }, [cleanName, consoleClient, serverId]);

  const nameChanged = cleanName !== server?.displayName;
  const validName = cleanName.length > 0;

  useEffect(() => {
    setDraftName(server?.displayName ?? '');
  }, [server]);
  if (fetching || !server) return null;
  return (
    <div className="flex flex-col gap-5 mb-3">
      <div className="flex flex-row gap-2 items-end">
        <FormField label="Server alias">
          <Input
            className="w-full"
            type="text"
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
            }}
          />
        </FormField>
        <Button
          variant={'outline'}
          onClick={onSaveName}
          disabled={!(nameChanged && validName)}
        >
          Save
        </Button>
      </div>
      {server.tokens &&
        Array.from(server.tokens.values()).map((token) => (
          <div className="flex flex-row gap-2 items-end" key={token.value}>
            <FormField label={token.name}>
              <PasswordInput
                autoComplete="off"
                className="w-full"
                value={token.value}
                readOnly
              />
            </FormField>
            <CopyButtonWithTooltip className="mb-1.5" copyValue={token.value} />
          </div>
        ))}
      {/* <div className="flex flex-row gap-2 items-end">
        <FormField label="Service Token">
          <PasswordInput
            autoComplete="off"
            className="w-full"
            value={token}
            readOnly
          />
        </FormField>
        <CopyButtonWithTooltip className="mb-1.5" copyValue={token} />
      </div> */}
      <div className="flex flex-row gap-2 items-end">
        <FormField label="Sync server">
          <Input className="w-full" value={server.url} readOnly />
        </FormField>
        <CopyButtonWithTooltip className="mb-1.5" copyValue={server.url} />
      </div>
    </div>
  );
}
