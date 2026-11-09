import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import type { EstadoPedido, PedidoDetalle } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fechaISO, sumarDias } from '@/lib/utils';
import { DialogoCobro } from '@/features/vender/dialogo-cobro';
import { useCambiarEstado, useCobrarPedido, usePedidos } from './consultas';
import { DialogoDetalle } from './dialogo-detalle';
import { DialogoImpresion } from './dialogo-impresion';
import { TarjetaPedido, destinoDe, siguientePaso } from './tarjeta-pedido';
import { useCajaActual } from '@/features/caja/consultas';
import { DialogoAbrirCaja } from '@/features/caja/dialogo-abrir-caja';
import { useUsuario } from '@/features/sesion/consultas';

const COLUMNAS: { titulo: string; estados: EstadoPedido[]; vacio: string }[] = [
  { titulo: 'Pendientes', estados: ['pendiente'], vacio: 'Los pedidos nuevos aparecen acá.' },
  { titulo: 'En preparación', estados: ['en_preparacion'], vacio: 'Nada en la cocina.' },
  { titulo: 'Listos', estados: ['listo'], vacio: 'Nada esperando para entregar.' },
  { titulo: 'Entregados y anulados', estados: ['entregado', 'anulado'], vacio: 'Todavía nada.' },
];

export function PaginaPedidos() {
  const hoy = fechaISO();
  const [fecha, setFecha] = useState(hoy);
  const pedidos = usePedidos(fecha);
  const cambiar = useCambiarEstado();
  const cobrar = useCobrarPedido();
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
  const [cobrando, setCobrando] = useState<{ pedido: PedidoDetalle; entregar: boolean } | null>(null);
  const [configurando, setConfigurando] = useState(false);
  const [abriendoCaja, setAbriendoCaja] = useState(false);
  const cajaActual = useCajaActual();
  const { esDueno } = useUsuario();

  const lista = pedidos.data ?? [];
  const abierto = lista.find((p) => p.id === abiertoId) ?? null;
  const resumen = useMemo(() => {
    const validos = lista.filter((p) => p.estado !== 'anulado');
    return {
      cantidad: validos.length,
      total: validos.reduce((s, p) => s + p.totalCentavos, 0),
      aCobrar: validos.filter((p) => !p.cobrado).reduce((s, p) => s + p.totalCentavos, 0),
    };
  }, [lista]);

  function avanzar(p: PedidoDetalle) {
    const paso = siguientePaso(p);
    if (!paso) return;
    if (paso.estado === 'entregado' && !p.cobrado) setCobrando({ pedido: p, entregar: true });
    else cambiar.mutate({ id: p.id, estado: paso.estado });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 px-8 pt-7 pb-5">
        <div>
          <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">Pedidos</h1>
          <p className="mt-2 text-tinta-suave">
            {resumen.cantidad} {resumen.cantidad === 1 ? 'pedido' : 'pedidos'} ·{' '}
            <span className="numeros font-semibold text-tinta">{pesos(resumen.total)}</span>
            {resumen.aCobrar > 0 && (
              <>
                {' '}· <span className="numeros font-semibold text-[#7a5a00]">{pesos(resumen.aCobrar)} a cobrar</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-linea bg-superficie p-1">
            <Button variant="ghost" size="icon-sm" aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}>
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              aria-label="Fecha"
              value={fecha}
              max={hoy}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
              className="h-9 w-[150px] border-0 px-2 text-center focus-visible:ring-0"
            />
            <Button variant="ghost" size="icon-sm" aria-label="Día siguiente" disabled={fecha >= hoy} onClick={() => setFecha(sumarDias(fecha, 1))}>
              <ChevronRight />
            </Button>
            {fecha !== hoy && (
              <Button variant="secondary" size="sm" onClick={() => setFecha(hoy)}>
                Hoy
              </Button>
            )}
          </div>
          {esDueno && (
            <Button variant="outline" onClick={() => setConfigurando(true)}>
              <Printer /> Impresión
            </Button>
          )}
        </div>
      </header>

      {pedidos.isError ? (
        <p className="px-8 text-rojo">No se pudieron cargar los pedidos: {pedidos.error.message}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 px-8 pb-6">
          {COLUMNAS.map((col) => {
            const enColumna = lista
              .filter((p) => col.estados.includes(p.estado))
              // Terminados: los últimos arriba. En curso: el más viejo arriba (se atiende primero).
              .sort((a, b) => (col.estados.includes('entregado') ? b.numero - a.numero : a.numero - b.numero));
            return (
              <section key={col.titulo} aria-label={col.titulo} className="flex min-h-0 flex-col rounded-2xl bg-[#ebece8] p-2">
                <h2 className="flex items-baseline justify-between px-2 pt-1.5 pb-2.5">
                  <span className="font-display text-[17px] font-semibold tracking-tight">{col.titulo}</span>
                  <span className="numeros text-sm font-semibold text-tinta-suave">{enColumna.length}</span>
                </h2>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                  {enColumna.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[13px] text-tinta-suave">{pedidos.isPending ? 'Cargando…' : col.vacio}</p>
                  ) : (
                    enColumna.map((p) => (
                      <TarjetaPedido
                        key={p.id}
                        pedido={p}
                        ocupado={cambiar.isPending}
                        alAbrir={() => setAbiertoId(p.id)}
                        alAvanzar={() => avanzar(p)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <DialogoDetalle
        pedido={abierto}
        alCerrar={() => setAbiertoId(null)}
        alCobrar={(pedido, entregar) => {
          setAbiertoId(null); // un diálogo a la vez
          setCobrando({ pedido, entregar });
        }}
      />
      <DialogoCobro
        abierto={cobrando !== null}
        totalCentavos={cobrando?.pedido.totalCentavos ?? 0}
        subtitulo={cobrando ? `Pedido #${cobrando.pedido.numero} · ${destinoDe(cobrando.pedido)}` : ''}
        textoTerminar={cobrando?.entregar ? 'Marcar entregado' : 'Listo'}
        cajaCerrada={cajaActual.isSuccess && cajaActual.data === null}
        alAbrirCaja={() => {
          setCobrando(null); // un diálogo a la vez
          setAbriendoCaja(true);
        }}
        alCobrar={(pagos) => cobrar.mutateAsync({ id: cobrando!.pedido.id, pagos })}
        alCerrar={() => setCobrando(null)}
        alTerminar={() => {
          if (cobrando?.entregar) cambiar.mutate({ id: cobrando.pedido.id, estado: 'entregado' });
          setCobrando(null);
        }}
      />
      <DialogoImpresion abierto={configurando} alCerrar={() => setConfigurando(false)} />
      <DialogoAbrirCaja abierto={abriendoCaja} alCerrar={() => setAbriendoCaja(false)} />
    </div>
  );
}
