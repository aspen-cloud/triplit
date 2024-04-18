import {} from './input-label';
import {
  Select as BaseSelect,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from './select';
import { InputLabel } from './input-label';

import { ComponentProps } from 'react';

type SelectDataItem = string | { value: string; label: string };

type SelectData = SelectDataItem[];

type SelectWithLabelProps = {
  data?: SelectData;
  groupedData?: [string, SelectData][];
  label?: string;
} & ComponentProps<typeof BaseSelect> &
  ComponentProps<typeof SelectTrigger>;

export function Select({ className, ...props }: SelectWithLabelProps) {
  let baseInput = (
    <BaseSelect {...props}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="overflow-y-auto max-h-[50vh]">
        {props.data &&
          props.data.map((item, i) => <SmartSelectItem key={i} item={item} />)}
        {props.groupedData &&
          props.groupedData.map(([groupLabel, data]) => (
            <SelectGroup key={groupLabel}>
              <SelectLabel className="-mx-6">{groupLabel}</SelectLabel>
              {data.map((item, i) => (
                <SmartSelectItem key={`${i}_${groupLabel}`} item={item} />
              ))}
            </SelectGroup>
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

function SmartSelectItem({ item }: { item: SelectDataItem }) {
  let [value, label] =
    typeof item === 'object' && 'value' in item && 'label' in item
      ? [item.value!, item.label]
      : [item, item];
  return <SelectItem value={value!}>{label}</SelectItem>;
}
