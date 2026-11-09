import type { Ref } from 'react';
import { leerPesos } from '@compartido/dinero';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Campo grande para escribir un importe en pesos ("20.000", "1.500,50"). */
export function CampoPesos({
  etiqueta,
  valor,
  alCambiar,
  placeholder = '0',
  autoFocus,
  ref,
  chico = false,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
  chico?: boolean;
}) {
  const invalido = valor.trim() !== '' && leerPesos(valor) === null;
  return (
    <span className="relative block">
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-tinta-suave">$</span>
      <Input
        ref={ref}
        aria-label={etiqueta}
        autoFocus={autoFocus}
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        placeholder={placeholder}
        aria-invalid={invalido}
        onChange={(e) => alCambiar(e.target.value)}
        className={cn('numeros pl-8 text-right font-display font-semibold', chico ? 'h-11 text-lg' : 'h-14 text-2xl')}
      />
    </span>
  );
}
