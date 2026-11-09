// Todos los productos vendidos en el período, para buscar y ordenar.
// Sirve para decidir: qué conviene promocionar, qué sacar del menú, qué
// comprar más.
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import type { VentasDeProducto } from '@compartido/tipos';
import { Input } from '@/components/ui/input';
import { porcentaje } from '@/components/graficos/barras';
import { cn, normalizar } from '@/lib/utils';

const ORDENES = [
  { id: 'ventas', nombre: 'Más plata' },
  { id: 'cantidad', nombre: 'Más unidades' },
  { id: 'nombre', nombre: 'A-Z' },
] as const;
type Orden = (typeof ORDENES)[number]['id'];

export function TablaProductos({ productos }: { productos: VentasDeProducto[] }) {
  const [texto, setTexto] = useState('');
  const [orden, setOrden] = useState<Orden>('ventas');
  const total = productos.reduce((s, p) => s + p.ventasCentavos, 0);
  const maximo = Math.max(0, ...productos.map((p) => p.ventasCentavos));

  // Primero se ordena TODO (así el # es el puesto real) y después se filtra.
  const filas = useMemo(() => {
    const ordenados = [...productos]; // 'ventas': ya viene ordenada del main
    if (orden === 'cantidad') ordenados.sort((a, b) => b.cantidad - a.cantidad || b.ventasCentavos - a.ventasCentavos);
    if (orden === 'nombre') ordenados.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const conPuesto = ordenados.map((p, i) => ({ ...p, puesto: i + 1 }));
    const t = normalizar(texto.trim());
    return t ? conPuesto.filter((p) => normalizar(`${p.nombre} ${p.categoria}`).includes(t)) : conPuesto;
  }, [productos, texto, orden]);

  if (!productos.length) {
    return <p className="rounded-2xl border border-linea bg-superficie px-6 py-10 text-center text-tinta-suave">No se vendió ningún producto en este período.</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" />
          <Input aria-label="Buscar producto" placeholder="Buscar producto o categoría" className="pl-10" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <div role="radiogroup" aria-label="Ordenar por" className="flex gap-1 rounded-xl bg-secondary p-1">
          {ORDENES.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={orden === o.id}
              onClick={() => setOrden(o.id)}
              className={cn(
                'h-9 rounded-lg px-3.5 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-tinta/30',
                orden === o.id ? 'bg-superficie shadow-sm' : 'text-tinta-suave hover:text-tinta',
              )}
            >
              {o.nombre}
            </button>
          ))}
        </div>
        <p className="ml-auto text-[14px] text-tinta-suave">
          {productos.length} productos · {pesos(total)}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-linea bg-superficie">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
              <th scope="col" className="w-12 py-3 pl-5 font-semibold">#</th>
              <th scope="col" className="py-3 font-semibold">Producto</th>
              <th scope="col" className="py-3 pr-6 text-right font-semibold">Unidades</th>
              <th scope="col" className="py-3 pr-4 text-right font-semibold">Ventas</th>
              <th scope="col" className="w-[230px] py-3 pr-5 font-semibold">Parte del total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.productoId} className="border-b border-linea last:border-0">
                <td className="numeros py-2.5 pl-5 text-tinta-suave">{p.puesto}</td>
                <td className="py-2.5">
                  <span className="font-semibold">{p.nombre}</span>
                  {p.categoria && <span className="ml-2 text-[13px] text-tinta-suave">{p.categoria}</span>}
                </td>
                <td className="numeros py-2.5 pr-6 text-right">{p.cantidad.toLocaleString('es-AR')}</td>
                <td className="numeros py-2.5 pr-4 text-right font-semibold">{pesos(p.ventasCentavos)}</td>
                <td className="py-2.5 pr-5">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-dato" style={{ width: `${maximo ? (p.ventasCentavos / maximo) * 100 : 0}%` }} />
                    </div>
                    <span className="numeros w-12 text-right text-[13px] text-tinta-suave">{porcentaje(p.ventasCentavos, total)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filas.length && <p className="px-5 py-6 text-tinta-suave">Ningún producto coincide con "{texto}".</p>}
      </div>
    </section>
  );
}
