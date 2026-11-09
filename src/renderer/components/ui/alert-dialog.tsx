import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { variantesBoton } from './button';

const AlertDialog = AlertDialogPrimitive.Root;

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#141516]/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <AlertDialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-48px)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-superficie p-6 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.35)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn('font-display text-xl font-semibold', className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn('text-[15px] text-tinta-suave', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mt-2 flex justify-end gap-2', className)} {...props} />;
}

function AlertDialogAction({
  className,
  peligro = false,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & { peligro?: boolean }) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(variantesBoton({ variant: peligro ? 'destructive' : 'default' }), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(variantesBoton({ variant: 'outline' }), className)} {...props} />;
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
};
