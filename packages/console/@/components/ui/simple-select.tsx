import {} from './input-label';
import {
  Select as BaseSelect,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from './select';
import { InputLabel } from './input-label';

import { ComponentProps } from 'react';

type SelectWithLabelProps = {
  data: string[];
  label?: string;
} & ComponentProps<typeof BaseSelect> &
  ComponentProps<typeof SelectTrigger>;

export function Select({ className, ...props }: SelectWithLabelProps) {
  let baseInput = (
    <BaseSelect {...props}>
      <SelectTrigger className={className}>
        <SelectValue>{props.value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {props.data.map((value) => (
          <SelectItem key={value} value={value}>
            {value}
          </SelectItem>
        ))}
      </SelectContent>
    </BaseSelect>
  );
  if (props.label)
    return (
      <div className="flex flex-col w-full">
        <InputLabel value={props.label} />
        {baseInput}
      </div>
    );
  return baseInput;
}
