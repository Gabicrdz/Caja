import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const variantesInsignia = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-tinta',
        verde: 'bg-verde-suave text-verde',
        rojo: 'bg-rojo-suave text-rojo',
        mostaza: 'bg-mostaza-suave text-[#7a5a00]',
        contorno: 'border border-linea-fuerte text-tinta-suave',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof variantesInsignia>) {
  return <span data-slot="badge" className={cn(variantesInsignia({ variant }), className)} {...props} />;
}

export { Badge };
