import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@triplit/ui';
import { Clipboard } from 'lucide-react';
import superjson from 'superjson';

export function CopyValueMenu({
  value,
  children,
}: {
  value: any;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          className="text-xs"
          onClick={async () => {
            const stringifiedValue = JSON.stringify(
              superjson.serialize(value).json
            );
            await navigator.clipboard.writeText(stringifiedValue);
          }}
        >
          <Clipboard size={14} className="mr-1.5" /> Copy cell value
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
