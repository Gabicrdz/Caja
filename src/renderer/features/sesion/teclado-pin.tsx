import { useEffect } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

const LARGO_MAXIMO = 6;

/**
 * Teclado numérico grande para tocar con el dedo. También funciona con el
 * teclado de la computadora (números, Retroceso y Enter).
 */
export function TecladoPin({
  valor,
  alCambiar,
  alConfirmar,
  error,
  deshabilitado = false,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  alConfirmar: () => void;
  error?: string;
  deshabilitado?: boolean;
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (deshabilitado) return;
      if (/^\d$/.test(e.key) && valor.length < LARGO_MAXIMO) alCambiar(valor + e.key);
      else if (e.key === 'Backspace') alCambiar(valor.slice(0, -1));
      else if (e.key === 'Enter' && valor.length >= 4) alConfirmar();
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [valor, alCambiar, alConfirmar, deshabilitado]);

  const boton =
    'flex h-16 items-center justify-center rounded-xl text-2xl font-display font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-40';

  return (
    <div className="flex w-[300px] flex-col items-center gap-5">
      <div className="flex h-6 items-center gap-3" aria-label={`PIN: ${valor.length} números`} role="status">
        {Array.from({ length: Math.max(4, valor.length) }, (_, i) => (
          <span
            key={i}
            className={cn('size-3.5 rounded-full border-2 transition-colors', i < valor.length ? 'border-tinta bg-tinta' : 'border-linea-fuerte', error && 'border-rojo bg-rojo/0', error && i < valor.length && 'bg-rojo')}
          />
        ))}
      </div>
      <p role="alert" className="h-5 text-sm font-semibold text-rojo">{error}</p>
      <div className="grid w-full grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} type="button" disabled={deshabilitado || valor.length >= LARGO_MAXIMO} onClick={() => alCambiar(valor + n)} className={cn(boton, 'bg-superficie hover:bg-accent')}>
            {n}
          </button>
        ))}
        <button type="button" aria-label="Borrar" disabled={deshabilitado || !valor} onClick={() => alCambiar(valor.slice(0, -1))} className={cn(boton, 'text-tinta-suave hover:bg-accent')}>
          <Delete className="size-6" />
        </button>
        <button type="button" disabled={deshabilitado || valor.length >= LARGO_MAXIMO} onClick={() => alCambiar(valor + '0')} className={cn(boton, 'bg-superficie hover:bg-accent')}>
          0
        </button>
        <button type="button" disabled={deshabilitado || valor.length < 4} onClick={alConfirmar} className={cn(boton, 'bg-mostaza text-base hover:bg-mostaza-fuerte')}>
          Entrar
        </button>
      </div>
    </div>
  );
}
