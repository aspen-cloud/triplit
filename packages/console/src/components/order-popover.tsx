import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Code,
  CloseButton,
  Button,
} from '@triplit/ui';
import { useState } from 'react';
import { Collection, OrderStatement } from '@triplit/entity-db';

type OrderPopoverProps = {
  collection: string;
  uniqueAttributes: Set<string>;
  collectionSchema?: Collection;
  order: OrderStatement<any, any>;
  onSubmit: (order: OrderStatement<any, any>) => void;
};

export function OrderPopover(props: OrderPopoverProps) {
  const { collection, uniqueAttributes, collectionSchema, order, onSubmit } =
    props;
  const [key, setKey] = useState(+new Date());

  const [draftOrder, setDraftOrder] = useState<Map<string, string>>(
    new Map(order)
  );

  const orderableAttributes = Array.from(
    collectionSchema
      ? Object.entries(collectionSchema.schema.properties).reduce(
          (prev, [name, def]) => {
            if (
              def.type !== 'query' &&
              def.type !== 'set' &&
              !draftOrder.has(name)
            )
              prev.push(name);
            return prev;
          },
          [] as string[]
        )
      : uniqueAttributes
  );
  const hasOrders = order.length > 0;
  return (
    <Popover
      onOpenChange={() => {
        setDraftOrder(new Map(order));
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size={'sm'}
          variant={'secondary'}
          className={`${
            hasOrders
              ? 'bg-blue-300 hover:bg-blue-200 dark:bg-blue-500 dark:hover:bg-blue-600'
              : ''
          } py-1 h-auto`}
        >
          <span className="mr-2">Order</span>
          <span className={hasOrders ? '' : 'text-zinc-500'}>
            {order.length ?? 0}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex flex-col gap-3 min-w-[280px]"
      >
        {draftOrder.size > 0 ? (
          Array.from(draftOrder).map(([attribute, direction]) => (
            <div key={attribute} className="flex flex-row gap-1 items-center">
              <p className="text-sm w-full truncate ml-2">{attribute}</p>
              <Select
                className="w-[85px]"
                value={direction}
                data={['ASC', 'DESC']}
                onValueChange={(value) => {
                  setDraftOrder((prev) => {
                    const newOrder = new Map(prev);
                    newOrder.set(attribute, value);

                    return newOrder;
                  });
                }}
              />
              <CloseButton
                onClick={() => {
                  setDraftOrder((prev) => {
                    const newOrder = new Map(prev);
                    newOrder.delete(attribute);

                    return newOrder;
                  });
                }}
              />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No sorts applied to <Code>{collection}</Code>
          </p>
        )}
        <form
          className="flex flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(Array.from(draftOrder));
          }}
        >
          <Select
            key={key}
            placeholder="Select an attribute"
            data={orderableAttributes}
            disabled={orderableAttributes.length === 0}
            onValueChange={(value) => {
              if (!value) return;
              setKey(+new Date());
              setDraftOrder((prev) => {
                const newOrder = new Map(prev);
                newOrder.set(value, 'ASC');
                return newOrder;
              });
            }}
          />
          <Button type="submit">Apply</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
