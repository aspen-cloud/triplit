import { TriplitClient } from '@triplit/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Code } from '@/components/ui/code';

import { ComponentProps } from 'react';

type DeleteCollectionDialogProps = {
  collectionName: string;
  projectName: string;
  client: TriplitClient<any>;
};

export function DeleteCollectionDialog(
  props: DeleteCollectionDialogProps & ComponentProps<typeof AlertDialog>
) {
  const { collectionName, projectName, onOpenChange, client, ...dialogProps } =
    props;
  return (
    <AlertDialog onOpenChange={onOpenChange} {...dialogProps}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete <Code>{collectionName}</Code> from <Code>{projectName}</Code>
            ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            collection from this project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await client.db.dropCollection({ name: collectionName });
              onOpenChange && onOpenChange(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
