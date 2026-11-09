import { useEffect, useState } from 'react';
import { ArrowLeft, Ban, Wallet } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import { esquemaMotivo } from '@compartido/esquemas';
import { NOMBRE_ESTADO, NOMBRE_MEDIO, type EstadoPedido, type PedidoDetalle } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { BotonesImpresion } from './botones-impresion';
import { useAnular, useCambiarEstado } from './consultas';
import { destinoDe, siguientePaso } from './tarjeta-pedido';

const ANTERIOR: Partial<Record<EstadoPedido, 'pendiente' | 'en_preparacion' | 'listo'>> = {
  en_preparacion: 'pendiente',
  listo: 'en_preparacion',
  entregado: 'listo',
};

const VARIANTE_ESTADO: Record<EstadoPedido, 'default' | 'mostaza' | 'verde' | 'rojo' | 'contorno'> = {
  pendiente: 'contorno',
  en_preparacion: 'mostaza',
  listo: 'verde',
  entregado: 'default',
  anulado: 'rojo',
};

export function DialogoDetalle({
  pedido: p,
  alCerrar,
  alCobrar,
}: {
  pedido: PedidoDetalle | null;
  alCerrar: () => void;
  /** Abre el cobro; entregar = después de cobrar, marcarlo entregado. */
  alCobrar: (pedido: PedidoDetalle, entregar: boolean) => void;
}) {
  const cambiar = useCambiarEstado();
  const anular = useAnular();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setAnulando(false);
    setMotivo('');
    setError('');
  }, [p?.id]);

  if (!p) return null;
  const paso = siguientePaso(p);
  const anterior = ANTERIOR[p.estado];
  const vuelto = p.pagos.reduce((s, x) => s + x.vueltoCentavos, 0);

  function avanzar() {
    if (!p || !paso) return;
    if (paso.estado === 'entregado' && !p.cobrado) alCobrar(p, true);
    else cambiar.mutate({ id: p.id, estado: paso.estado });
  }

  async function confirmarAnulacion() {
    const r = esquemaMotivo.safeParse(motivo);
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? 'Escribí el motivo.');
      return;
    }
    try {
      await anular.mutateAsync({ id: p!.id, motivo: r.data });
      setAnulando(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && alCerrar()}>
      <DialogContent className="max-w-[680px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="numeros text-3xl">Pedido #{p.numero}</DialogTitle>
            <Badge variant={VARIANTE_ESTADO[p.estado]}>{NOMBRE_ESTADO[p.estado]}</Badge>
            {p.estado !== 'anulado' && !p.cobrado && <Badge variant="mostaza">A cobrar</Badge>}
          </div>
          <DialogDescription>
            {destinoDe(p)} · {p.hora}
            {p.clienteNombre && ` · ${p.clienteNombre}`}
            {p.clienteTelefono && ` · ${p.clienteTelefono}`}
          </DialogDescription>
          {p.tipo === 'delivery' && p.clienteDireccion && <p className="font-semibold">{p.clienteDireccion}</p>}
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {p.estado === 'anulado' && (
            <p className="rounded-lg bg-rojo-suave px-4 py-3 text-[15px] text-rojo">
              <span className="font-semibold">Anulado:</span> {p.motivoAnulacion}
            </p>
          )}

          <ul className="divide-y divide-linea rounded-xl border border-linea">
            {p.items.map((i) => (
              <li key={i.id} className="flex gap-3 px-4 py-3">
                <span className="numeros w-7 font-display text-lg font-semibold">{i.cantidad}×</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">
                    {i.nombre}
                    {i.varianteNombre && <span className="font-normal text-tinta-suave"> · {i.varianteNombre}</span>}
                    {!i.vaACocina && <span className="ml-2 text-[12px] font-normal text-tinta-suave">(no va a cocina)</span>}
                  </span>
                  {i.agregados.length > 0 && (
                    <span className="text-[13px] text-tinta-suave">
                      {i.agregados.map((a) => (a.precioCentavos ? `${a.nombre} (+${pesos(a.precioCentavos)})` : a.nombre)).join(' · ')}
                    </span>
                  )}
                  {i.nota && <span className="text-[13px] italic">“{i.nota}”</span>}
                </div>
                <span className="numeros font-semibold">{pesos(i.totalCentavos)}</span>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-1 text-[15px]">
            {p.envioCentavos > 0 && (
              <>
                <div className="flex justify-between"><dt className="text-tinta-suave">Subtotal</dt><dd className="numeros">{pesos(p.subtotalCentavos)}</dd></div>
                <div className="flex justify-between"><dt className="text-tinta-suave">Envío</dt><dd className="numeros">{pesos(p.envioCentavos)}</dd></div>
              </>
            )}
            <div className="flex items-baseline justify-between">
              <dt className="font-semibold">Total</dt>
              <dd className="numeros font-display text-2xl font-semibold">{pesos(p.totalCentavos)}</dd>
            </div>
            {p.pagos.map((x, k) => (
              <div key={k} className="flex justify-between text-tinta-suave">
                <dt>{NOMBRE_MEDIO[x.medio]}{x.vueltoCentavos > 0 && ` (pagó ${pesos(x.recibidoCentavos)})`}</dt>
                <dd className="numeros">{pesos(x.montoCentavos)}</dd>
              </div>
            ))}
            {vuelto > 0 && (
              <div className="flex justify-between text-tinta-suave"><dt>Vuelto</dt><dd className="numeros">{pesos(vuelto)}</dd></div>
            )}
          </dl>

          {anulando && (
            <div className="flex flex-col gap-2 rounded-xl border border-rojo/40 bg-rojo-suave/50 p-4">
              <label htmlFor="motivo" className="text-sm font-semibold">¿Por qué se anula?</label>
              <Textarea
                id="motivo"
                autoFocus
                rows={2}
                maxLength={140}
                value={motivo}
                aria-invalid={Boolean(error)}
                placeholder="Ej.: el cliente canceló, se cargó dos veces…"
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setError('');
                }}
              />
              {error && <p role="alert" className="text-[13px] font-semibold text-rojo">{error}</p>}
              <p className="text-[13px] text-tinta-suave">
                El pedido no se borra: queda anulado con este motivo y deja de sumar en las ventas del día.
                {p.cobrado && ' Si ya se cobró, acordate de devolver la plata.'}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAnulando(false)}>Cancelar</Button>
                <Button variant="destructive" size="sm" disabled={anular.isPending} onClick={() => void confirmarAnulacion()}>
                  Anular pedido
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <BotonesImpresion pedidoId={p.id} tipo="comanda" deshabilitado={!p.items.some((i) => i.vaACocina)} />
            <BotonesImpresion pedidoId={p.id} tipo="ticket" />
          </div>
        </DialogBody>

        {p.estado !== 'anulado' && !anulando && (
          <DialogFooter className="justify-between">
            <div className="flex gap-1">
              <Button variant="ghost-destructive" onClick={() => setAnulando(true)}>
                <Ban /> Anular
              </Button>
              {anterior && (
                <Button variant="ghost" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ id: p.id, estado: anterior })}>
                  <ArrowLeft /> Volver a {NOMBRE_ESTADO[anterior].toLowerCase()}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!p.cobrado && (
                <Button variant="outline" onClick={() => alCobrar(p, false)}>
                  <Wallet /> Cobrar
                </Button>
              )}
              {paso && (
                <Button disabled={cambiar.isPending} onClick={avanzar}>
                  {paso.texto}
                </Button>
              )}
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
