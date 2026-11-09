import { SlidersHorizontal } from 'lucide-react';
import type { Producto } from '@compartido/tipos';
import { pesos } from '@compartido/dinero';
import { cn } from '@/lib/utils';

/** Las fichas grandes para tocar con el dedo. */
export function GrillaProductos({
  productos,
  alTocar,
}: {
  productos: Producto[];
  alTocar: (p: Producto) => void;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-3">
      {productos.map((p) => {
        const conOpciones = p.variantes.length > 0 || p.gruposIds.length > 0;
        const precio =
          p.variantes.length > 0
            ? `desde ${pesos(Math.min(...p.variantes.map((v) => v.precioCentavos)))}`
            : pesos(p.precioCentavos);
        return (
          <li key={p.id}>
            <button
              type="button"
              disabled={!p.disponible}
              onClick={() => alTocar(p)}
              aria-label={`${p.nombre}, ${p.disponible ? precio : 'agotado'}`}
              className={cn(
                'group relative flex h-[118px] w-full flex-col justify-between rounded-xl border border-linea bg-superficie p-3.5 text-left outline-none transition-[transform,border-color,box-shadow]',
                'hover:border-linea-fuerte hover:shadow-[0_2px_0_var(--linea-fuerte)] active:translate-y-px active:shadow-none',
                'focus-visible:border-tinta focus-visible:ring-[3px] focus-visible:ring-ring/20',
                'disabled:cursor-not-allowed disabled:bg-[#f7f7f5]',
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={cn('line-clamp-2 font-display text-[16px] leading-tight font-semibold tracking-tight', !p.disponible && 'text-tinta-suave')}>
                  {p.nombre}
                </span>
                {p.codigo && (
                  <span className="numeros shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-bold text-tinta-suave">
                    {p.codigo}
                  </span>
                )}
              </span>
              <span className="flex items-end justify-between gap-2">
                {p.disponible ? (
                  <span className="numeros text-[15px] font-semibold">{precio}</span>
                ) : (
                  <span className="rounded-full bg-rojo-suave px-2 py-0.5 text-xs font-semibold text-rojo">Agotado</span>
                )}
                {conOpciones && p.disponible && (
                  <SlidersHorizontal className="size-4 text-tinta-suave" aria-label="Tiene opciones para elegir" />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
