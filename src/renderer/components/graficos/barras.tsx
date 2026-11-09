// Barras horizontales para "partes de un total" con pocas categorías (medios
// de pago, tipo de pedido, productos). Con nombres largos se leen mejor que
// columnas, y cada barra lleva su valor en la punta.
import { cn } from '@/lib/utils';

export interface Barra {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Texto chico al lado del valor ("12 cobros", "× 24"). */
  detalle?: string;
}

interface Props {
  barras: Barra[];
  formatear: (valor: number) => string;
  /** Muestra el % de cada una sobre el total. */
  conPorcentaje?: boolean;
  /** Las que valen 0 se ven apagadas (útil para saber que existen). */
  mostrarCeros?: boolean;
}

export function porcentaje(parte: number, total: number): string {
  if (!total) return '0 %';
  const p = (parte / total) * 100;
  return `${p < 10 && p > 0 ? p.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : Math.round(p)} %`;
}

export function BarrasHorizontales({ barras, formatear, conPorcentaje = false, mostrarCeros = true }: Props) {
  const visibles = mostrarCeros ? barras : barras.filter((b) => b.valor > 0);
  const maximo = Math.max(0, ...visibles.map((b) => b.valor));
  const total = visibles.reduce((s, b) => s + b.valor, 0);
  return (
    <ul className="flex flex-col gap-3.5">
      {visibles.map((b) => {
        const ancho = maximo ? (b.valor / maximo) * 100 : 0;
        return (
          <li key={b.clave} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5', !b.valor && 'text-tinta-suave')}>
            <span className="truncate text-[14px]">{b.etiqueta}</span>
            <span className="numeros text-right text-[14px] font-semibold">
              {formatear(b.valor)}
              {conPorcentaje && <span className="ml-2 inline-block w-11 text-[12px] font-normal text-tinta-suave">{porcentaje(b.valor, total)}</span>}
            </span>
            <div className="col-span-2 flex items-center gap-2">
              {/* Base recta a la izquierda, punta redondeada a la derecha */}
              <div className="h-2.5 flex-1">
                {b.valor > 0 && <div className="h-full rounded-r bg-dato" style={{ width: `max(${ancho}%, 3px)` }} />}
              </div>
              {b.detalle && <span className="w-20 shrink-0 text-right text-[12px] text-tinta-suave">{b.detalle}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
