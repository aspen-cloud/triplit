'use client';

import * as React from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Command, CommandGroup, CommandInput, CommandItem } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export function Combobox({
  data,
  value,
  onChangeValue,
  onAddValue,
  className,
  placeholder,
}: {
  data: string[];
  value: string;
  onChangeValue: (value: string) => void;
  onAddValue: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const [query, setQuery] = React.useState('');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-[200px] justify-between', className)}
        >
          {value ? data.find((item) => item === value) : 'Select item...'}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={placeholder ?? 'Search...'}
            className="h-9"
          />
          <CommandGroup>
            {data
              .filter((item) => item.includes(query))
              .map((item) => (
                <CommandItem
                  key={item}
                  value={item}
                  onSelect={() => {
                    onChangeValue(item === value ? '' : item);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {item}
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      value === item ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            {query && (
              <CommandItem
                key={'query'}
                onSelect={() => {
                  onChangeValue(query === value ? '' : query);
                  onAddValue(query);
                  setQuery('');
                  setOpen(false);
                }}
                value={query}
              >
                Add: {query}
                <Plus className={'ml-auto h-4 w-4'} />
              </CommandItem>
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
