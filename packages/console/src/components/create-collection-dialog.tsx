import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@triplit/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';

type CreateCollectionDialogProps = {
  onSubmit: (collectionName: string) => void;
  disabled?: boolean;
};

export function CreateCollectionDialog(props: CreateCollectionDialogProps) {
  const [draftName, setDraftName] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          disabled={props.disabled}
          className="h-auto py-1 px-3 flex flex-row gap-1"
          variant="secondary"
        >
          <Plus className="shrink-0 h-4 w-4" />
          <span className="hidden lg:inline">Create</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form
          className="flex flex-col gap-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(draftName);
            setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Create collection</DialogTitle>
            <DialogDescription>
              Add a new collection to your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="collection-name" className="text-right">
                Name
              </Label>
              <Input
                id="collection-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <Button disabled={!draftName} type="submit" className="self-end">
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
