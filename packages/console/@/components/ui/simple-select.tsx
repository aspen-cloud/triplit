import {} from './input-label';
import {
  Select as BaseSelect,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from './select';

import { ComponentProps } from 'react';

type SelectWithLabelProps = {
  data: string[];
} & ComponentProps<typeof BaseSelect> &
  ComponentProps<typeof SelectTrigger>;

export function Select({ className, ...props }: SelectWithLabelProps) {
  return (
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
}
