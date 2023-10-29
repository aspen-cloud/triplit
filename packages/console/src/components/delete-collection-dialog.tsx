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
import { useSelectedCollection } from 'src/hooks/useSelectedCollection.js';
import { ComponentProps } from 'react';

type DeleteCollectionDialogProps = {
  client: TriplitClient<any>;
};

export function DeleteCollectionDialog(
  props: DeleteCollectionDialogProps & ComponentProps<typeof AlertDialog>
) {
  const { onOpenChange, client, ...dialogProps } = props;
  const [collection, setSelectedCollection] = useSelectedCollection();
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
              setSelectedCollection(undefined);
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
