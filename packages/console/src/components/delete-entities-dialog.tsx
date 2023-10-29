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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Code } from '@/components/ui/code';
import { useState } from 'react';
import { consoleClient } from 'triplit/client.js';
import { Button } from '@/components/ui/button.js';
import { Trash } from '@phosphor-icons/react';

type DeleteEntitiesDialogProps = {
  entityIds: string[];
  collectionName: string;
  client: TriplitClient<any>;
};

async function deleteEntities(
  client: TriplitClient<any>,
  collectionName: string,
  entityIds: string[]
) {
  await client.transact(async (tx) => {
    await Promise.all(entityIds.map((id) => tx.delete(collectionName, id)));
  });
  await consoleClient.transact(async (tx) => {
    await Promise.all(entityIds.map((id) => tx.delete('selections', id)));
  });
}

export function DeleteEntitiesDialog(props: DeleteEntitiesDialogProps) {
  const [open, setOpen] = useState(false);
  const { collectionName, client, entityIds } = props;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size={'sm'} variant={'destructive'}>
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
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await deleteEntities(client, collectionName, entityIds);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
