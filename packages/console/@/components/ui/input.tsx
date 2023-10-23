import * as React from 'react';

import { cn } from 'packages/console/@/lib/utils';
import { InputLabel } from './input-label';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    let baseInput = (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (props.label) {
      return (
        <div className="flex flex-col w-full">
          <InputLabel value={props.label} />
          {baseInput}
        </div>
      );
    }
    return baseInput;
  }
);
Input.displayName = 'Input';

export { Input };
