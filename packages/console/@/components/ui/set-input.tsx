import { Input } from './input';
import { Button } from './button';
import { useState } from 'react';
import { cn } from '../../lib/utils';
import { X } from '@phosphor-icons/react';

type SetInputProps<T> = {
  className?: T;
  value: Set<T>;
  onChange?: (value: Set<T>) => void;
  onAddItem?: (value: T) => void;
  onRemoveItem?: (value: T) => void;
  parse?: (value: string) => T;
  renderItem?: (value: T) => React.ReactNode;
};

export function SetInput(props: SetInputProps<any>) {
  const {
    className,
    value,
    onChange,
    onAddItem,
    onRemoveItem,
    parse,
    renderItem,
  } = props;
  const [draftItem, setDraftItem] = useState('');
  const [error, setError] = useState('');
  return (
    <div className={cn('flex flex-col gap-2 w-full', className)}>
      {value && value.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...value].map((item) => (
            <div
              key={item}
              className="flex flex-row gap-1 text-sm py-1 pl-2 pr-1 bg-secondary rounded-sm"
            >
              {renderItem ? renderItem(item) : String(item)}
              <Button
                variant="ghost"
                className="p-0.5 h-auto"
                type="button"
                onClick={() => {
                  onRemoveItem && onRemoveItem(item);
                  const newSet = new Set(value);
                  newSet.delete(item);
                  onChange && onChange(newSet);
                }}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-row gap-2">
        <Input
          type="text"
          value={draftItem}
          onChange={(e) => {
            setDraftItem(e.target.value);
            setError('');
          }}
        />
        <Button
          variant={'secondary'}
          type="button"
          onClick={() => {
            try {
              const parsedItem = parse ? parse(draftItem) : draftItem;
              onAddItem && onAddItem(parsedItem);
              onChange && onChange(value.add(parsedItem));
              setDraftItem('');
            } catch (e) {
              if (e instanceof Error) setError(e.message);
            }
          }}
        >
          Add
        </Button>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
