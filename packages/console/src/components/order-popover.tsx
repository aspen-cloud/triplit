import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'packages/console/@/components/ui/popover';
import { useMemo, useState } from 'react';
import { Button } from 'packages/console/@/components/ui/button';
import { Code } from 'packages/console/@/components/ui/code';
import { Select } from 'packages/console/@/components/ui/simple-select';
import { CloseButton } from 'packages/console/@/components/ui/close-button';
import { QueryOrder } from '../../../db/src/query';

type OrderPopoverProps = {
  collection: string;
  uniqueAttributes: Set<string>;
  collectionSchema: any;
  order: QueryOrder<any>;
  onSubmit: (order: QueryOrder<any>) => void;
};

export function OrderPopover(props: OrderPopoverProps) {
  const { collection, uniqueAttributes, collectionSchema, order, onSubmit } =
    props;

  const [draftOrder, setDraftOrder] = useState<Map<string, string>>(
    new Map(order)
  );
  const orderableAttributes: string[] = useMemo(() => {
    const nonSetAttributes = collectionSchema
      ? [...uniqueAttributes].filter(
          (attr) =>
            !collectionSchema.schema?.properties?.[attr].type.startsWith('set_')
        )
      : [...uniqueAttributes];
    const notAlreadyOrdered = nonSetAttributes.filter(
      (attr) => !draftOrder?.has(attr)
    );
    return notAlreadyOrdered;
  }, [uniqueAttributes, collectionSchema, draftOrder]);
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
          className={hasOrders ? 'bg-blue-500 hover:bg-blue-600' : ''}
        >
          <span className="mr-2">Order</span>
          <span className={hasOrders ? '' : 'text-zinc-500'}>
            {order.length ?? 0}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-3 w-full">
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
            value={
              orderableAttributes.length > 0
                ? `Pick an${
                    draftOrder.size > 0 ? 'other' : ''
                  } attribute to order by`
                : 'No attributes to order by'
            }
            data={orderableAttributes}
            disabled={orderableAttributes.length === 0}
            onValueChange={(value) => {
              if (!value) return;
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
