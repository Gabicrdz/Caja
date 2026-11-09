import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { ArrowRightLeft, Banknote, CircleAlert, CircleCheck, CreditCard, Plus, QrCode, X, type LucideIcon } from 'lucide-react';
import type { DatosPagos } from '@compartido/esquemas';
import { leerPesos, pesos, pesosParaCampo } from '@compartido/dinero';
import { MEDIOS_DE_PAGO, NOMBRE_MEDIO, type MedioDePago, type PedidoCreado } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BotonesImpresion } from '@/features/pedidos/botones-impresion';

const ICONOS: Record<MedioDePago, LucideIcon> = {
  efectivo: Banknote,
  transferencia: ArrowRightLeft,
  debito: CreditCard,
  credito: CreditCard,
  qr: QrCode,
};

interface FilaPago {
  medio: MedioDePago;
  /** Texto escrito (en pesos). En el modo simple el monto es el total. */
  monto: string;
  /** Solo efectivo: con cuánto pagó. Vacío = justo. */
  recibido: string;
  /** El último pago se completa solo con lo que falta, hasta que lo editen. */
  automatico: boolean;
}

/** Billetes "redondos" que alguien podría dar para pagar este total. */
export function sugerenciasDeBilletes(totalCentavos: number): number[] {
  const pesosTotal = Math.ceil(totalCentavos / 100);
  const sugeridos = new Set<number>();
  for (const paso of [1000, 2000, 5000, 10000, 20000]) {
    const redondeo = Math.ceil(pesosTotal / paso) * paso;
    if (redondeo > pesosTotal) sugeridos.add(redondeo);
  }
  return [...sugeridos].sort((a, b) => a - b).slice(0, 4).map((p) => p * 100);
}

interface Props {
  abierto: boolean;
  totalCentavos: number;
  /** Línea debajo del título: "Mesa 4 · Ana", "Pedido #12"… */
  subtitulo: string;
  /** Guarda el cobro. Devuelve el pedido (con su número y vuelto). */
  alCobrar: (pagos: DatosPagos) => Promise<PedidoCreado>;
  /** Si viene, aparece "Cobrar después" (guarda el pedido sin pagos). */
  alGuardarSinCobrar?: () => Promise<PedidoCreado>;
  /** Texto del botón principal de la pantalla final. */
  textoTerminar?: string;
  /** Sin caja abierta no se puede cobrar (sí "cobrar después"). */
  cajaCerrada?: boolean;
  alAbrirCaja?: () => void;
  alCerrar: () => void;
  alTerminar: (pedido: PedidoCreado) => void;
}

export function DialogoCobro({
  abierto,
  totalCentavos,
  subtitulo,
  alCobrar,
  alGuardarSinCobrar,
  textoTerminar = 'Nuevo pedido',
  cajaCerrada = false,
  alAbrirCaja,
  alCerrar,
  alTerminar,
}: Props) {
  const [filas, setFilas] = useState<FilaPago[]>([]);
  const [hecho, setHecho] = useState<PedidoCreado | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const campoRecibido = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) {
      setFilas([{ medio: 'efectivo', monto: '', recibido: '', automatico: true }]);
      setHecho(null);
      setError('');
      setGuardando(false);
    }
  }, [abierto]);

  async function guardar(accion: () => Promise<PedidoCreado>) {
    setGuardando(true);
    setError('');
    try {
      setHecho(await accion());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const dividido = filas.length > 1;
  const calculo = useMemo(() => {
    // Lo que suman los pagos escritos a mano; el automático completa el resto.
    const fijos = filas.filter((f) => !f.automatico).reduce((s, f) => s + (leerPesos(f.monto) ?? 0), 0);
    const pagos = filas.map((f) => {
      const monto = f.automatico ? Math.max(0, totalCentavos - fijos) : leerPesos(f.monto);
      const recibido = f.medio === 'efectivo' && f.recibido.trim() !== '' ? leerPesos(f.recibido) : monto;
      return { ...f, montoCentavos: monto, recibidoCentavos: recibido };
    });
    const asignado = pagos.reduce((s, p) => s + (p.montoCentavos ?? 0), 0);
    const vuelto = pagos.reduce(
      (s, p) => s + (p.recibidoCentavos !== null && p.montoCentavos !== null ? Math.max(0, p.recibidoCentavos - p.montoCentavos) : 0),
      0,
    );
    let problema: string | null = null;
    if (pagos.some((p) => p.montoCentavos === null || p.montoCentavos <= 0)) problema = 'Revisá los montos.';
    else if (pagos.some((p) => p.recibidoCentavos === null)) problema = 'Revisá con cuánto paga.';
    else if (pagos.some((p) => p.recibidoCentavos! < p.montoCentavos!)) problema = 'Con eso no alcanza.';
    else if (asignado < totalCentavos) problema = `Falta asignar ${pesos(totalCentavos - asignado)}.`;
    else if (asignado > totalCentavos) problema = `Sobran ${pesos(asignado - totalCentavos)}: los pagos superan el total.`;
    return { pagos, asignado, vuelto, problema };
  }, [filas, dividido, totalCentavos]);

  function cambiar(i: number, cambios: Partial<FilaPago>) {
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
  }

  /** Agrega otro pago: el que estaba automático queda fijo con su monto actual. */
  function dividir() {
    setFilas((fs) => {
      const fijadas = fs.map((f, i) =>
        f.automatico
          ? { ...f, automatico: false, monto: dividido ? pesosParaCampo(calculo.pagos[i]?.montoCentavos ?? 0) : '' }
          : f,
      );
      const otro: MedioDePago = fs[0]?.medio === 'efectivo' ? 'transferencia' : 'efectivo';
      return [...fijadas, { medio: otro, monto: '', recibido: '', automatico: true }];
    });
  }

  function confirmar() {
    if (calculo.problema || guardando || cajaCerrada) return;
    void guardar(() =>
      alCobrar(
        calculo.pagos.map((p) => ({
          medio: p.medio,
          montoCentavos: p.montoCentavos!,
          ...(p.medio === 'efectivo' ? { recibidoCentavos: p.recibidoCentavos! } : {}),
        })),
      ),
    );
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(abrir) => {
        if (abrir) return;
        if (hecho) alTerminar(hecho);
        else alCerrar();
      }}
    >
      <DialogContent className="max-w-[640px]" mostrarCerrar={!hecho}>
        {hecho ? (
          <PedidoListo pedido={hecho} texto={textoTerminar} alTerminar={() => alTerminar(hecho)} />
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              confirmar();
            }}
          >
            <DialogHeader>
              <DialogTitle>Cobrar</DialogTitle>
              <p className="text-sm text-tinta-suave">{subtitulo}</p>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-6">
              <div className="flex items-end justify-between rounded-xl bg-[#f6f6f3] px-5 py-4">
                <span className="text-[15px] font-semibold text-tinta-suave">Total a cobrar</span>
                <span className="numeros font-display text-[40px] leading-none font-semibold tracking-tight">{pesos(totalCentavos)}</span>
              </div>

              {filas.map((f, i) => (
                <fieldset key={i} className={cn('flex flex-col gap-3', dividido && 'rounded-xl border border-linea p-4')}>
                  <div className="flex items-center justify-between">
                    <legend className="text-sm font-semibold">{dividido ? `Pago ${i + 1}` : 'Medio de pago'}</legend>
                    {dividido && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar pago ${i + 1}`}
                        onClick={() =>
                          setFilas((fs) => {
                            const quedan = fs.filter((_, j) => j !== i);
                            // El último que queda pasa a completar lo que falte.
                            return quedan.map((f, j) => (j === quedan.length - 1 ? { ...f, automatico: true } : f));
                          })
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  <div role="radiogroup" aria-label={`Medio del pago ${i + 1}`} className="grid grid-cols-5 gap-2">
                    {MEDIOS_DE_PAGO.map((m) => {
                      const Icono = ICONOS[m];
                      const activo = f.medio === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={activo}
                          onClick={() => {
                            cambiar(i, { medio: m, recibido: '' });
                            if (m === 'efectivo') setTimeout(() => campoRecibido.current?.focus(), 0);
                          }}
                          className={cn(
                            'flex h-[66px] flex-col items-center justify-center gap-1 rounded-lg border text-[13px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                            activo ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-linea-fuerte',
                          )}
                        >
                          <Icono className="size-5" />
                          {NOMBRE_MEDIO[m]}
                        </button>
                      );
                    })}
                  </div>
                  <div className={cn('grid gap-3', dividido ? 'grid-cols-2' : 'grid-cols-1')}>
                    {dividido && (
                      <CampoPesos
                        etiqueta={f.automatico ? 'Monto (lo que falta)' : 'Monto'}
                        valor={f.automatico ? pesosParaCampo(calculo.pagos[i]?.montoCentavos ?? 0) : f.monto}
                        alCambiar={(monto) => cambiar(i, { monto, automatico: false })}
                      />
                    )}
                    {f.medio === 'efectivo' && (
                      <CampoPesos
                        ref={i === 0 ? campoRecibido : undefined}
                        etiqueta="¿Con cuánto paga?"
                        valor={f.recibido}
                        placeholder="Justo"
                        alCambiar={(recibido) => cambiar(i, { recibido })}
                      />
                    )}
                  </div>
                  {f.medio === 'efectivo' && !dividido && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => cambiar(i, { recibido: '' })}>
                        Justo
                      </Button>
                      {sugerenciasDeBilletes(totalCentavos).map((b) => (
                        <Button key={b} size="sm" variant="secondary" className="numeros" onClick={() => cambiar(i, { recibido: pesosParaCampo(b) })}>
                          {pesos(b)}
                        </Button>
                      ))}
                    </div>
                  )}
                </fieldset>
              ))}

              {filas.length < 5 && (
                <Button variant="outline" size="sm" className="self-start" onClick={dividir}>
                  <Plus /> {dividido ? 'Agregar otro pago' : 'Pagar con dos medios'}
                </Button>
              )}
            </DialogBody>

            <DialogFooter className="flex-col items-stretch gap-3">
              {cajaCerrada && (
                <p role="status" className="flex items-center justify-between gap-3 rounded-lg bg-mostaza-suave px-4 py-3 text-[15px] font-medium text-[#7a5a00]">
                  <span>La caja está cerrada: abrila para poder cobrar{alGuardarSinCobrar ? ', o guardá el pedido para cobrar después' : ''}.</span>
                  {alAbrirCaja && (
                    <Button size="sm" variant="oscuro" onClick={alAbrirCaja}>
                      Abrir caja
                    </Button>
                  )}
                </p>
              )}
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg bg-rojo-suave px-4 py-3 text-[15px] font-medium text-rojo">
                  <CircleAlert className="mt-0.5 size-[18px] shrink-0" /> {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-4">
                <div aria-live="polite">
                  {calculo.problema ? (
                    <span className="text-[15px] font-semibold text-rojo">{calculo.problema}</span>
                  ) : calculo.vuelto > 0 ? (
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] font-semibold">Vuelto</span>
                      <span className="numeros font-display text-3xl font-semibold">{pesos(calculo.vuelto)}</span>
                    </span>
                  ) : (
                    <span className="text-[15px] text-tinta-suave">Sin vuelto</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {alGuardarSinCobrar ? (
                    <Button variant="outline" size="lg" disabled={guardando} onClick={() => void guardar(alGuardarSinCobrar)}>
                      Cobrar después
                    </Button>
                  ) : (
                    <Button variant="outline" size="lg" onClick={alCerrar}>
                      Volver
                    </Button>
                  )}
                  <Button type="submit" size="lg" className="min-w-[200px]" disabled={Boolean(calculo.problema) || guardando || cajaCerrada}>
                    {guardando ? 'Guardando…' : 'Confirmar cobro'}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CampoPesos({
  etiqueta,
  valor,
  alCambiar,
  placeholder = '0',
  ref,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  placeholder?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const invalido = valor.trim() !== '' && leerPesos(valor) === null;
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{etiqueta}</span>
      <span className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-tinta-suave">$</span>
        <Input
          ref={ref}
          aria-label={etiqueta}
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          placeholder={placeholder}
          aria-invalid={invalido}
          onChange={(e) => alCambiar(e.target.value)}
          className="numeros h-14 pl-8 text-right font-display text-2xl font-semibold"
        />
      </span>
    </label>
  );
}

function PedidoListo({ pedido, texto, alTerminar }: { pedido: PedidoCreado; texto: string; alTerminar: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 px-8 pt-10 pb-8 text-center">
      <CircleCheck className={cn('size-14', pedido.cobrado ? 'text-verde' : 'text-mostaza-fuerte')} strokeWidth={1.75} />
      <div className="flex flex-col gap-1">
        <DialogTitle className="text-3xl">Pedido #{pedido.numero}</DialogTitle>
        <p className="text-tinta-suave">
          {pedido.cobrado ? `Cobrado ${pesos(pedido.totalCentavos)}` : `Guardado sin cobrar · ${pesos(pedido.totalCentavos)}`}
        </p>
      </div>
      {pedido.vueltoCentavos > 0 && (
        <div className="flex w-full flex-col items-center gap-1 rounded-xl bg-mostaza px-6 py-5">
          <span className="text-sm font-semibold">Vuelto para dar</span>
          <span className="numeros font-display text-5xl leading-none font-semibold tracking-tight">{pesos(pedido.vueltoCentavos)}</span>
        </div>
      )}
      <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-linea px-4 py-3">
        <BotonesImpresion pedidoId={pedido.id} tipo="comanda" />
        <BotonesImpresion pedidoId={pedido.id} tipo="ticket" />
      </div>
      <Button size="lg" variant="oscuro" autoFocus className="mt-1 h-14 w-full text-[17px]" onClick={alTerminar}>
        {texto}
      </Button>
    </div>
  );
}
