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
import { useToast } from 'src/hooks/useToast.js';
import { dropCollection } from 'src/utils/schema.js';

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
  const { toast } = useToast();
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
              const error = await dropCollection(client, collection);
              if (error) {
                toast({
                  title: 'Error',
                  description: error,
                  variant: 'destructive',
                });
                return;
              }
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
