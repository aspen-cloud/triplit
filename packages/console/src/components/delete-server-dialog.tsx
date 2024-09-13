import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@triplit/ui';
import { Code } from '@triplit/ui';
import { consoleClient } from 'triplit/client';
import { ComponentProps } from 'react';
import { useServerState } from './server-provider';

type DeleteServerDialogProps = {
  serverName: string;
} & ComponentProps<typeof AlertDialog>;

async function onDeleteServer(id: string) {
  try {
    await consoleClient.delete('servers', id);
  } catch (e) {}
}

export function DeleteServerDialog(props: DeleteServerDialogProps) {
  const [serverId, setServerId] = useServerState();
  const { serverName, onOpenChange, ...dialogProps } = props;
  return (
    <AlertDialog onOpenChange={onOpenChange} {...dialogProps}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Are you sure you want to delete <Code>{serverName}</Code>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action will only delete the project from the console, it will
            still be available on the Triplit dashboard. You can always add it
            back!
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              serverId && (await onDeleteServer(serverId));
              setServerId('');
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
