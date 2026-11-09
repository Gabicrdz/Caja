import { Bike, ShoppingBag, Store, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import { NOMBRE_TIPO, type PedidoDetalle, type TipoPedido } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const ICONO_TIPO: Record<TipoPedido, LucideIcon> = {
  mostrador: Store,
  llevar: ShoppingBag,
  delivery: Bike,
  mesa: UtensilsCrossed,
};

export function destinoDe(p: PedidoDetalle): string {
  if (p.tipo === 'mesa') return `Mesa ${p.mesa}`;
  return NOMBRE_TIPO[p.tipo];
}

/** El siguiente paso de un pedido, para el botón de la tarjeta. */
export function siguientePaso(p: PedidoDetalle): { texto: string; estado: 'en_preparacion' | 'listo' | 'entregado' } | null {
  switch (p.estado) {
    case 'pendiente':
      return { texto: 'Preparar', estado: 'en_preparacion' };
    case 'en_preparacion':
      return { texto: 'Está listo', estado: 'listo' };
    case 'listo':
      return { texto: p.cobrado ? 'Entregar' : 'Cobrar y entregar', estado: 'entregado' };
    default:
      return null;
  }
}

export function TarjetaPedido({
  pedido: p,
  ocupado,
  alAbrir,
  alAvanzar,
}: {
  pedido: PedidoDetalle;
  ocupado: boolean;
  alAbrir: () => void;
  alAvanzar: () => void;
}) {
  const Icono = ICONO_TIPO[p.tipo];
  const paso = siguientePaso(p);
  const terminado = p.estado === 'entregado' || p.estado === 'anulado';
  const visibles = p.items.slice(0, 4);
  return (
    <article
      className={cn(
        'relative flex flex-col gap-2.5 rounded-xl border border-linea bg-superficie p-4 transition-colors hover:border-linea-fuerte',
        terminado && 'bg-transparent',
        p.estado === 'anulado' && 'opacity-60',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={alAbrir}
          className="text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          aria-label={`Ver pedido ${p.numero}`}
        >
          <span className="numeros font-display text-[26px] leading-none font-semibold tracking-tight">#{p.numero}</span>
        </button>
        <span className="numeros text-[13px] text-tinta-suave">{p.hora}</span>
      </header>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Icono className="size-4 text-tinta-suave" />
        {destinoDe(p)}
        {p.clienteNombre && <span className="truncate font-normal text-tinta-suave">· {p.clienteNombre}</span>}
      </p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {visibles.map((i) => (
          <li key={i.id} className="truncate">
            <span className="numeros font-semibold">{i.cantidad}×</span> {i.nombre}
            {i.varianteNombre && <span className="text-tinta-suave"> {i.varianteNombre}</span>}
          </li>
        ))}
        {p.items.length > visibles.length && (
          <li className="text-[13px] text-tinta-suave">y {p.items.length - visibles.length} más…</li>
        )}
      </ul>
      <footer className="mt-1 flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="numeros font-display text-lg font-semibold">{pesos(p.totalCentavos)}</span>
          {p.estado === 'anulado' ? (
            <span className="text-[12px] font-semibold text-rojo">Anulado</span>
          ) : !p.cobrado ? (
            <span className="w-fit rounded-full bg-mostaza-suave px-2 py-0.5 text-[12px] font-semibold text-[#7a5a00]">A cobrar</span>
          ) : (
            <span className="text-[12px] text-verde">Cobrado</span>
          )}
        </div>
        {paso && (
          <Button
            size="sm"
            variant={p.estado === 'listo' ? 'default' : 'oscuro'}
            className="relative z-10"
            disabled={ocupado}
            onClick={alAvanzar}
          >
            {paso.texto}
          </Button>
        )}
      </footer>
    </article>
  );
}
