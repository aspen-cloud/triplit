import { SchemaType as DBConsoleSchemaType } from '../../triplit/schema';
import { useEffect, useState, useCallback } from 'react';
import '@glideapps/glide-data-grid/dist/index.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CopyButtonWithTooltip } from '@/components/ui/copy-button';
import { UpdateTypeFromModel } from '@triplit/db';
import { consoleClient } from '../../triplit/client';
import { PasswordInput } from '@/components/ui/password-input';
import { FormField } from '@/components/ui/form-field';

export type Project = UpdateTypeFromModel<
  DBConsoleSchemaType['projects']['attributes']
>;

export function ProjectInfoForm({
  projectId: projectPrimaryKey,
  project,
}: {
  projectId: string;
  project: Project;
}) {
  const { displayName, token, server, projectId } = project;
  const [draftName, setDraftName] = useState(displayName);

  const cleanName = draftName.trim();

  const onSaveName = useCallback(async () => {
    await consoleClient.update(
      'projects',
      projectPrimaryKey,
      async (originalEntity) => {
        originalEntity.displayName = cleanName;
      }
    );
  }, [cleanName, consoleClient, projectPrimaryKey]);

  const nameChanged = cleanName !== displayName;
  const validName = cleanName.length > 0;

  useEffect(() => {
    setDraftName(displayName);
  }, [projectPrimaryKey]);

  return (
    <div className="flex flex-col gap-5 mb-3">
      <div className="flex flex-row gap-2 items-end">
        <FormField label="Project alias">
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
      <FormField label="id">
        <Input value={projectId} readOnly />
      </FormField>
      <div className="flex flex-row gap-2 items-end">
        <FormField label="API key">
          <PasswordInput
            autoComplete="off"
            className="w-full"
            value={token}
            readOnly
          />
        </FormField>
        <CopyButtonWithTooltip className="mb-1.5" copyValue={token} />
      </div>
      <div className="flex flex-row gap-2 items-end">
        <FormField label="Sync server">
          <Input className="w-full" value={server} readOnly />
        </FormField>
        <CopyButtonWithTooltip className="mb-1.5" copyValue={server} />
      </div>
    </div>
  );
}
