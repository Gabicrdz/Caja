// La factura de un pedido: el comprobante emitido, o el aviso de pendiente con
// "Reintentar" / "No facturar", o el botón para facturar ahora.
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, FileCheck2, Loader2, Receipt } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import type { DatosReceptor } from '@compartido/esquemas';
import type { ComprobanteResumen } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDescartarPendiente, useEstadoFacturacion, useFacturar } from './consultas';
import { RECEPTOR_INICIAL, SelectorReceptor, validarReceptor, type BorradorReceptor } from './selector-receptor';

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function TarjetaComprobante({ c, anulada = false }: { c: ComprobanteResumen; anulada?: boolean }) {
  return (
    <section
      aria-label={c.nombre}
      className={`flex flex-col gap-1 rounded-xl border px-4 py-3 text-left ${anulada ? 'border-linea bg-[#f6f6f3]' : 'border-verde/40 bg-verde-suave/40'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-2 font-semibold ${anulada ? 'text-tinta-suave line-through' : ''}`}>
          <FileCheck2 className={`size-[18px] ${anulada ? 'text-tinta-suave' : 'text-verde'}`} /> {c.nombre} {c.numeroCompleto}
        </span>
        <span className="flex gap-1.5">
          {anulada && <Badge variant="rojo">Anulada</Badge>}
          {c.ambiente === 'homologacion' && <Badge variant="mostaza">De prueba</Badge>}
        </span>
      </div>
      <dl className="numeros grid grid-cols-[auto_1fr] gap-x-3 text-[13px] text-tinta-suave">
        <dt>CAE</dt>
        <dd>{c.cae}</dd>
        <dt>Vence</dt>
        <dd>{fechaCorta(c.vencimientoCae)}</dd>
        <dt>Total</dt>
        <dd>{pesos(c.totalCentavos)}</dd>
      </dl>
    </section>
  );
}

export function BloqueFactura({
  pedidoId,
  cobrado,
  anulado = false,
  comprobante,
  notaDeCredito = null,
  pendiente,
  facturarAlAbrir,
}: {
  pedidoId: number;
  cobrado: boolean;
  anulado?: boolean;
  comprobante: ComprobanteResumen | null;
  /** La nota de crédito que anuló la factura. */
  notaDeCredito?: ComprobanteResumen | null;
  pendiente: string | null;
  /** Si viene, factura sola al mostrarse (recién cobrado con "Facturar" tildado). */
  facturarAlAbrir?: DatosReceptor;
}) {
  const estado = useEstadoFacturacion();
  const facturar = useFacturar();
  const descartar = useDescartarPendiente();
  const [borrador, setBorrador] = useState<BorradorReceptor>(RECEPTOR_INICIAL);
  const [eligiendo, setEligiendo] = useState(false);
  const [errorCampos, setErrorCampos] = useState('');
  const [emitido, setEmitido] = useState<ComprobanteResumen | null>(null);
  const [fallo, setFallo] = useState('');
  const arrancado = useRef(false);

  async function emitir(receptor: DatosReceptor | null) {
    setFallo('');
    try {
      setEmitido(await facturar.mutateAsync({ pedidoId, receptor }));
      setEligiendo(false);
    } catch (e) {
      setFallo((e as Error).message);
    }
  }

  useEffect(() => {
    if (facturarAlAbrir && !arrancado.current) {
      arrancado.current = true;
      void emitir(facturarAlAbrir);
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c = emitido ?? comprobante;
  if (c) {
    return (
      <div className="flex flex-col gap-2">
        <TarjetaComprobante c={c} anulada={Boolean(notaDeCredito)} />
        {notaDeCredito && <TarjetaComprobante c={notaDeCredito} />}
      </div>
    );
  }

  // Sin facturación activa, o pedido que no se puede facturar: no se muestra nada.
  if (!cobrado || anulado || !estado.data?.activa) return null;

  const motivo = fallo ? fallo : pendiente;
  // Si acaba de fallar, el servidor ya lo dejó como pendiente aunque la lista aún no se haya refrescado.
  const hayPendiente = Boolean(pendiente) || fallo !== '';
  const ocupado = facturar.isPending;

  function confirmar() {
    const r = validarReceptor(borrador);
    if ('error' in r) {
      setErrorCampos(r.error);
      return;
    }
    setErrorCampos('');
    void emitir(r.receptor);
  }

  return (
    <section aria-label="Factura" className="flex flex-col gap-3 rounded-xl border border-linea px-4 py-3 text-left">
      {ocupado ? (
        <p role="status" className="flex items-center gap-2 text-[15px] font-semibold">
          <Loader2 className="size-[18px] animate-spin" /> Pidiéndole el CAE a ARCA…
        </p>
      ) : (
        <>
          {motivo && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-rojo-suave px-3 py-2 text-[14px] font-medium text-rojo">
              <CircleAlert className="mt-0.5 size-[18px] shrink-0" /> <span>{fallo ? fallo : `Factura pendiente: ${pendiente}`}</span>
            </p>
          )}
          {!estado.data.lista && (
            <p className="text-[14px] text-tinta-suave">
              La facturación está activada pero faltan datos o el certificado. Completalo en Ajustes → ARCA.
            </p>
          )}
          {eligiendo && <SelectorReceptor valor={borrador} alCambiar={setBorrador} error={errorCampos} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[14px] text-tinta-suave">
              <Receipt className="size-4" /> Este pedido no tiene factura.
            </span>
            <div className="flex gap-2">
              {hayPendiente && (
                <Button size="sm" variant="ghost" disabled={descartar.isPending} onClick={() => descartar.mutate(pedidoId)}>
                  No facturar
                </Button>
              )}
              {eligiendo ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEligiendo(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={confirmar}>
                    Emitir factura
                  </Button>
                </>
              ) : hayPendiente ? (
                <>
                  <Button size="sm" variant="outline" disabled={!estado.data.lista} onClick={() => setEligiendo(true)}>
                    Cambiar cliente
                  </Button>
                  <Button size="sm" disabled={!estado.data.lista} onClick={() => void emitir(null)}>
                    Reintentar
                  </Button>
                </>
              ) : (
                <Button size="sm" disabled={!estado.data.lista} onClick={() => setEligiendo(true)}>
                  Facturar
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
