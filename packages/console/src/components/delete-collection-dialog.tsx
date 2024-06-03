import { TriplitClient } from '@triplit/client';
import {
  Code,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@triplit/ui';
import { ComponentProps } from 'react';

type DeleteCollectionDialogProps = {
  client: TriplitClient<any>;
  collection: string;
  onDeleteCollection: () => void;
};

export function DeleteCollectionDialog(
  props: DeleteCollectionDialogProps & ComponentProps<typeof AlertDialog>
) {
  const {
    onOpenChange,
    client,
    collection,
    onDeleteCollection,
    ...dialogProps
  } = props;
  return (
    <AlertDialog onOpenChange={onOpenChange} {...dialogProps}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete <Code>{collection}</Code>?
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
              await client.db.dropCollection({ name: collection });
              onDeleteCollection();
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
