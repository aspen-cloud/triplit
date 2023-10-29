import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CaretDown, PencilSimple } from '@phosphor-icons/react';
import { TrashSimple } from '@phosphor-icons/react/dist/ssr';

type ColumnMenuProps = {
  onEdit: () => void;
  onDelete: () => void;
};

export function ColumnMenu(props: ColumnMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="p-0 text-primary/30 hover:text-primary hover:bg-inherit"
          variant={'ghost'}
          size={'sm'}
        >
          <CaretDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => props.onEdit()}>
          <PencilSimple className="w-4 h-4 mr-2" />
          Edit attribute
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-600"
          onSelect={() => props.onDelete()}
        >
          <TrashSimple className="w-4 h-4 mr-2" />
          Delete attribute
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
