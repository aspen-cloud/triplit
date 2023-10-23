import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'packages/console/@/components/ui/alert-dialog';
import { Code } from 'packages/console/@/components/ui/code';
import { consoleClient } from 'packages/console/triplit/client';
import { ComponentProps } from 'react';
import { useProjectState } from './project-provider';

type DeleteProjectDialogProps = {
  projectName: string;
} & ComponentProps<typeof AlertDialog>;

async function onDeleteProject(id: string) {
  try {
    await consoleClient.delete('projects', id);
  } catch (e) {}
}

export function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  const [projectId, setProjectId] = useProjectState();
  const { projectName, onOpenChange, ...dialogProps } = props;
  return (
    <AlertDialog onOpenChange={onOpenChange} {...dialogProps}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Are you sure you want to delete <Code>{projectName}</Code>?
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
              projectId && (await onDeleteProject(projectId));
              setProjectId('');
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
