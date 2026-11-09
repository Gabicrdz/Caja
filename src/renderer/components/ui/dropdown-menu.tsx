import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-lg border border-linea bg-superficie p-1 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.25)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  peligro = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { peligro?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex h-10 cursor-default items-center gap-2.5 rounded-md px-3 text-[15px] outline-none select-none',
        'data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:text-tinta-suave",
        peligro && 'text-rojo data-[highlighted]:bg-rojo-suave [&_svg]:text-rojo',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-linea', className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
