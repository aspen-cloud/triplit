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

type AddTokenDialogProps = {
  onSubmit: (token: string, nickname: string) => void;
  disabled?: boolean;
};

export function AddTokenDialog(props: AddTokenDialogProps) {
  const [draftToken, setDraftToken] = useState('');
  const [nickname, setNickname] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          disabled={props.disabled}
          className="h-auto py-1 px-1 lg:px-3 flex flex-row gap-1"
          variant="secondary"
        >
          <Plus className="shrink-0 h-4 w-4" />
          <span className="hidden lg:inline">Add</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form
          className="flex flex-col gap-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit(draftToken, nickname);
            setDraftToken('');
            setNickname('');
            setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add token</DialogTitle>
            <DialogDescription>
              Add a user token to this project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="collection-name" className="text-right">
                Token
              </Label>
              <Input
                id="token"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="collection-name" className="text-right">
                Nickname
              </Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <Button disabled={!draftToken} type="submit" className="self-end">
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
