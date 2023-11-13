import { ComponentProps } from 'react';
import { Button } from './button';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

export function CloseButton(props: ComponentProps<typeof Button>) {
  const { className, ...buttonProps } = props;
  return (
    <Button
      {...buttonProps}
      className={cn('p-1 h-auto', props.className)}
      variant={'ghost'}
    >
      <X size={16} />
    </Button>
  );
}
