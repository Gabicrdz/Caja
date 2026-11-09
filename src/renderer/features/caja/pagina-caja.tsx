import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Lock, Receipt, Wallet } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import type { Caja, TipoMovimiento } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BotonesImpresion } from '@/features/pedidos/botones-impresion';
import { useUsuario } from '@/features/sesion/consultas';
import { useCajaActual, useHistorialCajas, useResumenDeCaja } from './consultas';
import { DialogoAbrirCaja } from './dialogo-abrir-caja';
import { DialogoCierre } from './dialogo-cierre';
import type { ResumenCaja } from '@compartido/tipos';
import { DialogoMovimiento } from './dialogo-movimiento';
import { Diferencia, ResumenDeCaja } from './resumen-caja';

const fechaHora = (m: string) => `${m.slice(8, 10)}/${m.slice(5, 7)} ${m.slice(11, 16)}`;

export function PaginaCaja() {
  const { esDueno } = useUsuario();
  const actual = useCajaActual();
  const historial = useHistorialCajas(esDueno);
  const [abriendo, setAbriendo] = useState(false);
  // Guardamos el resumen al abrir el diálogo: al cerrar la caja, `actual` pasa a null
  // y el diálogo tiene que seguir en pantalla para mostrar el resultado.
  const [cerrando, setCerrando] = useState<ResumenCaja | null>(null);
  const [movimiento, setMovimiento] = useState<TipoMovimiento | null>(null);
  const [viendo, setViendo] = useState<number | null>(null);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-8 pt-7 pb-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">Caja</h1>
          <p className="mt-2 text-tinta-suave">
            {actual.data
              ? `Abierta el ${fechaHora(actual.data.caja.abiertaEn)} por ${actual.data.caja.abiertaPor}`
              : 'Abrí la caja al empezar el turno y cerrala al terminar.'}
          </p>
        </div>
        {actual.data && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMovimiento('ingreso')}>
              <ArrowDownToLine /> Ingreso
            </Button>
            <Button variant="outline" onClick={() => setMovimiento('gasto')}>
              <Receipt /> Gasto
            </Button>
            {esDueno && (
              <Button variant="outline" onClick={() => setMovimiento('retiro')}>
                <ArrowUpFromLine /> Retiro
              </Button>
            )}
            <Button onClick={() => setCerrando(actual.data ?? null)}>
              <Lock /> Cerrar caja
            </Button>
          </div>
        )}
      </header>

      {actual.isPending ? (
        <p className="text-tinta-suave">Cargando…</p>
      ) : actual.isError ? (
        <p className="text-rojo">{actual.error.message}</p>
      ) : actual.data ? (
        <>
          <ResumenDeCaja resumen={actual.data} />
          <div className="flex justify-end">
            <BotonesImpresion pedidoId={actual.data.caja.id} tipo="cierre" />
          </div>
        </>
      ) : (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-linea bg-superficie px-8 py-14 text-center">
          <Wallet className="size-12 text-linea-fuerte" strokeWidth={1.5} />
          <h2 className="font-display text-3xl font-semibold tracking-tight">La caja está cerrada</h2>
          <p className="max-w-md text-tinta-suave">Para cobrar hay que abrir la caja. Contá el cambio que hay en el cajón y cargalo como fondo inicial.</p>
          <Button size="lg" onClick={() => setAbriendo(true)}>
            Abrir caja
          </Button>
        </section>
      )}

      {esDueno && (historial.data?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Cajas anteriores</h2>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
            {historial.data!.map((c) => (
              <FilaHistorial key={c.id} caja={c} alVer={() => setViendo(c.id)} />
            ))}
          </ul>
        </section>
      )}

      <DialogoAbrirCaja abierto={abriendo} alCerrar={() => setAbriendo(false)} />
      <DialogoMovimiento tipo={movimiento} alCerrar={() => setMovimiento(null)} />
      {cerrando && <DialogoCierre resumen={cerrando} abierto alCerrar={() => setCerrando(null)} />}
      <DetalleCaja id={viendo} alCerrar={() => setViendo(null)} />
    </div>
  );
}

function FilaHistorial({ caja: c, alVer }: { caja: Caja; alVer: () => void }) {
  return (
    <li>
      <button type="button" onClick={alVer} className="grid w-full grid-cols-[1fr_auto_auto_190px] items-center gap-6 px-5 py-3.5 text-left outline-none hover:bg-[#fafaf8] focus-visible:bg-[#fafaf8]">
        <span>
          <span className="font-semibold">{fechaHora(c.abiertaEn)} → {c.cerradaEn ? fechaHora(c.cerradaEn) : ''}</span>
          <span className="ml-3 text-[13px] text-tinta-suave">
            {c.abiertaPor}
            {c.cerradaPor && c.cerradaPor !== c.abiertaPor ? ` / ${c.cerradaPor}` : ''}
          </span>
        </span>
        <span className="text-[13px] text-tinta-suave">Esperado <span className="numeros font-semibold text-tinta">{pesos(c.esperadoCentavos ?? 0)}</span></span>
        <span className="text-[13px] text-tinta-suave">Contado <span className="numeros font-semibold text-tinta">{pesos(c.contadoCentavos ?? 0)}</span></span>
        <span className="[&>p]:mt-0 [&>p]:py-1 [&>p]:text-sm"><Diferencia centavos={c.diferenciaCentavos ?? 0} /></span>
      </button>
    </li>
  );
}

function DetalleCaja({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
  const resumen = useResumenDeCaja(id);
  return (
    <Dialog open={id !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Caja del {resumen.data ? fechaHora(resumen.data.caja.abiertaEn) : ''}</DialogTitle>
          {resumen.data?.caja.nota && <p className="text-tinta-suave">Nota: {resumen.data.caja.nota}</p>}
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {resumen.data ? <ResumenDeCaja resumen={resumen.data} /> : <p className="text-tinta-suave">Cargando…</p>}
          {id !== null && (
            <div className="flex justify-end">
              <BotonesImpresion pedidoId={id} tipo="cierre" />
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
