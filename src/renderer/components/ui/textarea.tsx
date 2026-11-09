import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full resize-none rounded-md border border-input bg-superficie px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground/70',
        'focus-visible:border-tinta focus-visible:ring-[3px] focus-visible:ring-ring/15',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
