import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-11 w-full min-w-0 rounded-md border border-input bg-superficie px-3 text-[15px] transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/70',
        'focus-visible:border-tinta focus-visible:ring-[3px] focus-visible:ring-ring/15',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
