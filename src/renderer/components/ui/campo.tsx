import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

/** Etiqueta + campo + ayuda o error debajo, siempre con el mismo espaciado. */
function Campo({
  etiqueta,
  htmlFor,
  ayuda,
  error,
  className,
  children,
}: {
  etiqueta: React.ReactNode;
  htmlFor?: string;
  ayuda?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={htmlFor}>{etiqueta}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-rojo">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-[13px] text-tinta-suave">{ayuda}</p>
      ) : null}
    </div>
  );
}

export { Campo };
