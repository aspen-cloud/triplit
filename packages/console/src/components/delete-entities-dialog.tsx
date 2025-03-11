import { TriplitClient } from '@triplit/client';
import {
  Code,
  Button,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@triplit/ui';
import { useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { RoleFilters } from './role-filters.js';
import { type CollectionPermissions } from '@triplit/entity-db';

type DeleteEntitiesDialogProps = {
  entityIds: string[];
  collectionName: string;
  permissions?: CollectionPermissions<any, any>;
  client: TriplitClient<any>;
  onDialogConfirm: () => void;
};

export function DeleteEntitiesDialog(props: DeleteEntitiesDialogProps) {
  const [open, setOpen] = useState(false);
  const { collectionName, client, entityIds, permissions, onDialogConfirm } =
    props;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          size={'sm'}
          variant={'destructive'}
          className="py-1 h-auto px-2 ml-3"
        >
          <Trash className=" mr-2" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {entityIds.length}{' '}
            {entityIds.length > 1 ? 'entities' : 'entity'} from{' '}
            <Code>{collectionName}</Code>?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            entities from this collection.
          </AlertDialogDescription>
          {permissions && (
            <RoleFilters
              client={client}
              permissions={permissions}
              rule={'delete'}
            />
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDialogConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
