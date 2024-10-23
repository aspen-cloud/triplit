import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@triplit/ui';
import { Check, Plus } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Roles, getRolesFromSession } from '@triplit/db';
import { parseJWT } from 'src/utils/remote-helpers.js';
import { ConsoleSessionRole } from 'src/utils/roles.js';
import { RoleCard } from './role-filters.js';

type AddTokenDialogProps = {
  onSubmit: (token: string, nickname: string) => void;
  disabled?: boolean;
  schema?: any;
};

export function AddTokenDialog(props: AddTokenDialogProps) {
  const [draftToken, setDraftToken] = useState('');
  const [nickname, setNickname] = useState('');
  const [open, setOpen] = useState(false);
  const parsedToken = useMemo(() => {
    try {
      return parseJWT(draftToken);
    } catch (e) {
      return {};
    }
  }, [draftToken]);
  const potentialSessionRoles = useMemo(
    () => getRolesFromSession(props.schema, parsedToken),
    [parsedToken, props.schema]
  );
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
              <Label className="text-right">Nickname</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Token</Label>
              <Input
                id="token"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                className="col-span-3"
              />
            </div>
            {props.schema && (
              <>
                <RolePanel
                  possibleRoles={props.schema.roles ?? {}}
                  sessionRoles={potentialSessionRoles ?? []}
                />
                {potentialSessionRoles?.length === 0 && draftToken !== '' && (
                  <div className="text-xs text-red-500">
                    This token does not match any of the roles in the schema.
                  </div>
                )}
              </>
            )}
          </div>
          <Button disabled={!draftToken} type="submit" className="self-end">
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RolePanel({
  possibleRoles = {},
  sessionRoles = [],
}: {
  possibleRoles: Roles;
  sessionRoles: ConsoleSessionRole[];
}) {
  if (Object.keys(possibleRoles).length === 0) {
    return null;
  }
  return (
    <Fragment>
      <div className="text-sm font-medium">Token Roles</div>
      <div className="flex flex-row gap-2">
        {Object.keys(possibleRoles).map((role) => {
          const sessionRole = sessionRoles.find((r) => r.key === role);
          return (
            <div className="flex flex-col gap-2 items-center">
              <RoleCard
                key={role}
                name={role}
                vars={sessionRole?.roleVars ?? {}}
                active={!!sessionRole}
              />
              {!!sessionRole && <Check className="text-green-500" size={20} />}
            </div>
          );
        })}
      </div>
    </Fragment>
  );
}
