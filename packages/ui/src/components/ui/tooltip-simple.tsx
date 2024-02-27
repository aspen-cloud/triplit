import {
  Tooltip as BaseTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
import React from 'react';

type TooltipProps = {
  children: React.ReactNode;
  label: string | React.ReactNode;
  align?: 'center' | 'start' | 'end';
  hidden?: boolean;
};

export function Tooltip(props: TooltipProps) {
  return (
    <TooltipProvider>
      <BaseTooltip delayDuration={100}>
        <TooltipTrigger asChild>{props.children}</TooltipTrigger>
        <TooltipContent hidden={props.hidden} align={props.align}>
          {props.label}
        </TooltipContent>
      </BaseTooltip>
    </TooltipProvider>
  );
}
