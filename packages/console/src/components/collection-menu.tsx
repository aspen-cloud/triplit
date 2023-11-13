import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@triplit/ui';
import { CaretDown } from '@phosphor-icons/react';
import { Trash, Plus } from 'lucide-react';

type CollectionMenuProps = {
  onDelete: () => void;
  onAddAttribute: () => void;
};

export function CollectionMenu(props: CollectionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="p-0 h-auto hover:bg-inherit text-primary/40"
          variant={'ghost'}
          size={'sm'}
        >
          <CaretDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => props.onAddAttribute()}>
          <Plus className="w-4 h-4 mr-2" />
          Add attribute
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onSelect={() => props.onDelete()}
        >
          <Trash className="w-4 h-4 mr-2" />
          Delete collection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
