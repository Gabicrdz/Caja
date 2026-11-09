import { useEffect, useRef } from 'react';
import { Bike, CircleAlert, ShoppingBag, Store, Trash2, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { leerPesos, pesos, pesosParaCampo } from '@compartido/dinero';
import { NOMBRE_TIPO, type TipoPedido } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCarrito, type ItemCarrito } from './carrito';
import { Contador } from './dialogo-armar';
import { SugerenciasCliente } from './sugerencias-cliente';
import type { RenglonCalculado } from './totales';

const ICONOS: Record<TipoPedido, LucideIcon> = {
  mostrador: Store,
  llevar: ShoppingBag,
  delivery: Bike,
  mesa: UtensilsCrossed,
};

interface Props {
  renglones: RenglonCalculado[];
  subtotalCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  unidades: number;
  hayProblemas: boolean;
  /** Dato que falta para poder cobrar (dirección, mesa…). */
  falta: string | null;
  envioPorDefecto: number;
  alEditar: (item: ItemCarrito) => void;
  alCobrar: () => void;
}

export function PanelPedido({
  renglones,
  subtotalCentavos,
  envioCentavos,
  totalCentavos,
  unidades,
  hayProblemas,
  falta,
  envioPorDefecto,
  alEditar,
  alCobrar,
}: Props) {
  const carrito = useCarrito();
  const vacio = renglones.length === 0;

  return (
    <aside aria-label="Pedido" className="flex h-full min-h-0 flex-col border-l border-linea bg-superficie">
      {/* ── Tipo de pedido ── */}
      <div className="flex flex-col gap-3 border-b border-linea px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Pedido</h2>
          {!vacio && (
            <span className="text-[13px] text-tinta-suave">
              {unidades} {unidades === 1 ? 'producto' : 'productos'}
            </span>
          )}
        </div>
        <div role="radiogroup" aria-label="Tipo de pedido" className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1">
          {(Object.keys(NOMBRE_TIPO) as TipoPedido[]).map((tipo) => {
            const Icono = ICONOS[tipo];
            const activo = carrito.tipo === tipo;
            return (
              <button
                key={tipo}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => carrito.cambiarDatos({ tipo })}
                className={cn(
                  'flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-md text-[12px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                  activo ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta-suave hover:text-tinta',
                )}
              >
                <Icono className="size-[18px]" />
                {NOMBRE_TIPO[tipo]}
              </button>
            );
          })}
        </div>
        <DatosDelPedido envioPorDefecto={envioPorDefecto} />
      </div>

      {/* ── Renglones ── */}
      {vacio ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <ShoppingBag className="size-9 text-linea-fuerte" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold">Pedido vacío</p>
          <p className="text-sm text-tinta-suave">Tocá un producto o escribí su código para agregarlo.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-linea overflow-y-auto">
          {renglones.map((r) => (
            <Renglon key={r.item.clave} renglon={r} alEditar={() => alEditar(r.item)} />
          ))}
        </ul>
      )}

      {/* ── Total y cobro ── */}
      <div className="flex flex-col gap-3 border-t border-linea bg-[#fafaf8] px-5 pt-4 pb-5">
        {carrito.tipo === 'delivery' && (
          <dl className="flex flex-col gap-1 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Subtotal</dt>
              <dd className="numeros">{pesos(subtotalCentavos)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta-suave">Envío</dt>
              <dd className="numeros">{pesos(envioCentavos)}</dd>
            </div>
          </dl>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">Total</span>
          <span className="numeros font-display text-[34px] leading-none font-semibold tracking-tight">{pesos(totalCentavos)}</span>
        </div>
        {falta && !vacio && !hayProblemas && (
          <p role="status" className="flex items-start gap-2 text-[13px] font-semibold text-[#7a5a00]">
            <CircleAlert className="mt-px size-4 shrink-0" /> {falta}
          </p>
        )}
        {hayProblemas && (
          <p role="alert" className="flex items-start gap-2 text-[13px] font-semibold text-rojo">
            <CircleAlert className="mt-px size-4 shrink-0" /> Hay productos que ya no se pueden vender: quitalos o cambialos.
          </p>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="outline" size="lg" disabled={vacio} onClick={carrito.vaciar} aria-label="Vaciar pedido" className="px-4">
            <Trash2 />
          </Button>
          <Button size="lg" className="h-14 justify-between text-[17px]" disabled={vacio || hayProblemas || falta !== null} onClick={alCobrar}>
            <span>Cobrar</span>
            <span className="flex items-center gap-2">
              <span className="numeros font-display">{pesos(totalCentavos)}</span>
              <kbd className="rounded bg-black/10 px-1.5 py-0.5 font-sans text-[11px] font-bold">F2</kbd>
            </span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function DatosDelPedido({ envioPorDefecto }: { envioPorDefecto: number }) {
  const c = useCarrito();
  if (c.tipo === 'mesa') {
    return (
      <Input
        aria-label="Número de mesa"
        placeholder="Número de mesa"
        maxLength={10}
        value={c.mesa}
        onChange={(e) => c.cambiarDatos({ mesa: e.target.value })}
      />
    );
  }
  if (c.tipo === 'delivery') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {/* Primero el teléfono: con eso se encuentra al cliente si ya pidió */}
        <Input aria-label="Teléfono" placeholder="Teléfono" inputMode="tel" maxLength={30} value={c.clienteTelefono} onChange={(e) => c.cambiarDatos({ clienteTelefono: e.target.value })} />
        <Input aria-label="Nombre del cliente" placeholder="Nombre" maxLength={60} value={c.clienteNombre} onChange={(e) => c.cambiarDatos({ clienteNombre: e.target.value })} />
        <SugerenciasCliente />
        <Input aria-label="Dirección" placeholder="Dirección (obligatoria)" maxLength={120} className="col-span-2" value={c.clienteDireccion} onChange={(e) => c.cambiarDatos({ clienteDireccion: e.target.value })} />
        <CampoEnvio valor={c.envioCentavos ?? envioPorDefecto} alCambiar={(v) => c.cambiarDatos({ envioCentavos: v })} />
      </div>
    );
  }
  return (
    <Input
      aria-label="Nombre para llamarlo"
      placeholder="Nombre para llamarlo (opcional)"
      maxLength={60}
      value={c.clienteNombre}
      onChange={(e) => c.cambiarDatos({ clienteNombre: e.target.value })}
    />
  );
}

/** El envío se escribe como texto y se guarda en centavos al salir del campo. */
function CampoEnvio({ valor, alCambiar }: { valor: number; alCambiar: (centavos: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = pesosParaCampo(valor);
  }, [valor]);
  return (
    <label className="col-span-2 flex items-center justify-between gap-3 text-sm">
      <span className="text-tinta-suave">Costo de envío</span>
      <span className="relative w-36">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-suave">$</span>
        <Input
          ref={ref}
          aria-label="Costo de envío"
          inputMode="decimal"
          defaultValue={pesosParaCampo(valor)}
          className="numeros h-10 pl-7 text-right font-semibold"
          onBlur={(e) => {
            const centavos = leerPesos(e.target.value);
            if (centavos === null) e.target.value = pesosParaCampo(valor);
            else alCambiar(centavos);
          }}
        />
      </span>
    </label>
  );
}

function Renglon({ renglon, alEditar }: { renglon: RenglonCalculado; alEditar: () => void }) {
  const { item, linea, problema } = renglon;
  const cambiarCantidad = useCarrito((s) => s.cambiarCantidad);
  const resaltado = useCarrito((s) => s.ultimaClave === item.clave);
  const nombre = linea ? linea.producto.nombre : 'Producto que ya no está';
  return (
    <li
      key={`${item.clave}-${item.cantidad}`}
      className={cn('flex gap-3 px-5 py-3', resaltado && 'animate-[resaltar_900ms_ease-out]', problema && 'bg-rojo-suave/60')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button type="button" onClick={alEditar} className="text-left outline-none focus-visible:underline" disabled={!linea}>
          <span className="font-semibold">{nombre}</span>
          {linea?.variante && <span className="text-tinta-suave"> · {linea.variante.nombre}</span>}
        </button>
        {linea && linea.agregados.length > 0 && (
          <p className="text-[13px] leading-snug text-tinta-suave">
            {linea.agregados.map((a, i) => (
              <span key={a.opcion.id} className="whitespace-nowrap">
                {i > 0 && ' · '}
                {a.opcion.nombre}
                {a.opcion.precioCentavos > 0 && ` (+${pesos(a.opcion.precioCentavos)})`}
              </span>
            ))}
          </p>
        )}
        {item.nota && <p className="text-[13px] text-tinta italic">“{item.nota}”</p>}
        {problema && <p className="text-[13px] font-semibold text-rojo">{problema}</p>}
        <div className="mt-1.5">
          <Contador chico minimo={0} valor={item.cantidad} etiqueta={nombre} alCambiar={(n) => cambiarCantidad(item.clave, n)} />
        </div>
      </div>
      <span className="numeros pt-0.5 font-display text-[17px] font-semibold">{linea ? pesos(linea.totalCentavos) : '—'}</span>
    </li>
  );
}
