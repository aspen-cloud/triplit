import React from 'react';
import { cn } from '../../lib/utils';

type FormFieldProps = {
  label?: string | React.ReactNode;
  description?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

export function FormField(props: FormFieldProps) {
  const { label, description, error, children, className } = props;
  return (
    <div className={cn('flex flex-col gap-2 w-full', className)}>
      {label && <label className="text-sm font-medium">{label}</label>}
      {description && (
        <p className="text-xs text-zinc-500 font-medium">{description}</p>
      )}
      {children}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}
