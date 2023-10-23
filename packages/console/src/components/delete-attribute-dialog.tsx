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

import { ComponentProps } from 'react';

type DeleteAttributeDialogProps = {
  collectionName: string;
  attributeName: string;
  onSubmit: () => void;
};

export function DeleteAttributeDialog(
  props: DeleteAttributeDialogProps & ComponentProps<typeof AlertDialog>
) {
  const { collectionName, attributeName, onSubmit, ...dialogProps } = props;
  return (
    <AlertDialog {...dialogProps}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete <Code>{attributeName}</Code> from{' '}
            <Code>{collectionName}</Code>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            attribute from this collection.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onSubmit}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
