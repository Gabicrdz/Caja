// Agenda de clientes de delivery. Se arma sola: cada pedido con teléfono
// crea o actualiza al cliente. Acá se busca, se ordena y se corrige.
import { useState } from 'react';
import { Search, UsersRound } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import type { DatosListarClientes } from '@compartido/esquemas';
import type { Cliente } from '@compartido/tipos';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useClientes } from './consultas';
import { DialogoCliente, fechaCorta } from './dialogo-cliente';

type Orden = NonNullable<DatosListarClientes['orden']>;
const ORDENES: { id: Orden; nombre: string }[] = [
  { id: 'reciente', nombre: 'Recientes' },
  { id: 'pedidos', nombre: 'Más pedidos' },
  { id: 'gastado', nombre: 'Más gastado' },
];

export function PaginaClientes() {
  const [texto, setTexto] = useState('');
  const [orden, setOrden] = useState<Orden>('reciente');
  const [abierto, setAbierto] = useState<Cliente | null>(null);
  const clientes = useClientes({ texto, orden });
  const lista = clientes.data ?? [];

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-8 pt-7 pb-10">
      <header>
        <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">Clientes</h1>
        <p className="mt-2 text-tinta-suave">Se agendan solos cuando cargás un delivery con teléfono. Tocá uno para corregir sus datos.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-[360px]">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" />
          <Input
            aria-label="Buscar cliente"
            placeholder="Buscar por nombre, teléfono o dirección"
            className="pl-10"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
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
        <p className="ml-auto text-[14px] text-tinta-suave">{lista.length === 1 ? '1 cliente' : `${lista.length} clientes`}</p>
      </div>

      {clientes.isError && <p role="alert" className="font-semibold text-rojo">{clientes.error.message}</p>}

      {clientes.isSuccess && lista.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-linea bg-superficie px-8 py-14 text-center">
          <UsersRound className="size-12 text-linea-fuerte" strokeWidth={1.5} />
          <h2 className="font-display text-2xl font-semibold tracking-tight">{texto ? 'Ningún cliente coincide' : 'Todavía no hay clientes'}</h2>
          <p className="max-w-md text-tinta-suave">
            {texto ? 'Probá con otra parte del nombre o del teléfono.' : 'Cargá un pedido de delivery con teléfono en Vender y el cliente aparece acá.'}
          </p>
        </section>
      ) : (
        lista.length > 0 && (
          <div className={cn('overflow-hidden rounded-2xl border border-linea bg-superficie', clientes.isPlaceholderData && 'opacity-60')}>
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
                  <th scope="col" className="py-3 pl-5 font-semibold">Cliente</th>
                  <th scope="col" className="py-3 font-semibold">Teléfono</th>
                  <th scope="col" className="py-3 font-semibold">Dirección</th>
                  <th scope="col" className="py-3 pr-5 text-right font-semibold">Pedidos</th>
                  <th scope="col" className="py-3 pr-5 text-right font-semibold">Gastado</th>
                  <th scope="col" className="py-3 pr-5 text-right font-semibold">Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="relative border-b border-linea last:border-0 hover:bg-[#fafaf8]">
                    <td className="py-3 pl-5">
                      <button
                        type="button"
                        onClick={() => setAbierto(c)}
                        className="text-left font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                      >
                        {c.nombre || <span className="font-normal text-tinta-suave italic">Sin nombre</span>}
                      </button>
                      {c.nota && <p className="text-[13px] text-tinta-suave">{c.nota}</p>}
                    </td>
                    <td className="numeros py-3">{c.telefono}</td>
                    <td className="max-w-[260px] truncate py-3">{c.direccion}</td>
                    <td className="numeros py-3 pr-5 text-right">{c.pedidos}</td>
                    <td className="numeros py-3 pr-5 text-right font-semibold">{pesos(c.gastadoCentavos)}</td>
                    <td className="py-3 pr-5 text-right text-tinta-suave">{c.ultimoPedido ? fechaCorta(c.ultimoPedido) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <DialogoCliente cliente={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}
