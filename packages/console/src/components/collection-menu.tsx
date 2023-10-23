import { Button } from 'packages/console/@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from 'packages/console/@/components/ui/dropdown-menu';
import { CaretDown } from '@phosphor-icons/react';
import { TrashSimple } from '@phosphor-icons/react/dist/ssr';

type CollectionMenuProps = {
  onDelete: () => void;
};

export function CollectionMenu(props: CollectionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="p-0 h-auto hover:bg-inherit"
          variant={'ghost'}
          size={'sm'}
        >
          <CaretDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => props.onDelete()}
        >
          <TrashSimple className="w-4 h-4 mr-2" />
          Delete collection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
