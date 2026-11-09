import { useEffect, useMemo, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { leerPesos, pesos } from '@compartido/dinero';
import type { ResumenCaja } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { BotonesImpresion } from '@/features/pedidos/botones-impresion';
import { useCerrarCaja } from './consultas';
import { CampoPesos } from './campo-pesos';
import { Diferencia } from './resumen-caja';

// Billetes argentinos en circulación (en pesos). Lo que no entra acá va en "Monedas y otros".
const BILLETES = [20000, 10000, 2000, 1000, 500, 200, 100];

/** Cerrar la caja: contar el efectivo (por billetes o el total) y ver la diferencia. */
export function DialogoCierre({ resumen, abierto, alCerrar }: { resumen: ResumenCaja; abierto: boolean; alCerrar: () => void }) {
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [otros, setOtros] = useState('');
  const [nota, setNota] = useState('');
  const [cerrado, setCerrado] = useState<ResumenCaja | null>(null);
  const cerrar = useCerrarCaja();

  useEffect(() => {
    if (abierto) {
      setCantidades({});
      setOtros('');
      setNota('');
      setCerrado(null);
      cerrar.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const contado = useMemo(() => {
    let total = 0;
    for (const b of BILLETES) {
      const n = (cantidades[b] ?? '').trim();
      if (n === '') continue;
      if (!/^\d{1,4}$/.test(n)) return null;
      total += Number(n) * b * 100;
    }
    const resto = otros.trim() === '' ? 0 : leerPesos(otros);
    return resto === null ? null : total + resto;
  }, [cantidades, otros]);

  const esperado = resumen.efectivoEsperadoCentavos;

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[720px]">
        {cerrado ? (
          <div className="flex flex-col items-center gap-4 px-8 pt-10 pb-8 text-center">
            <CircleCheck className="size-14 text-verde" strokeWidth={1.75} />
            <DialogTitle className="text-3xl">Caja cerrada</DialogTitle>
            <p className="text-tinta-suave">
              Debería haber {pesos(cerrado.caja.esperadoCentavos ?? 0)} · contaste {pesos(cerrado.caja.contadoCentavos ?? 0)}
            </p>
            <div className="w-full">
              <Diferencia centavos={cerrado.caja.diferenciaCentavos ?? 0} grande />
            </div>
            <div className="rounded-xl border border-linea px-4 py-3">
              <BotonesImpresion pedidoId={cerrado.caja.id} tipo="cierre" />
            </div>
            <Button size="lg" variant="oscuro" className="mt-2 h-14 w-full" onClick={alCerrar}>
              Listo
            </Button>
          </div>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (contado === null) return;
              cerrar.mutate({ contadoCentavos: contado, nota }, { onSuccess: setCerrado });
            }}
          >
            <DialogHeader>
              <DialogTitle>Cerrar caja</DialogTitle>
              <DialogDescription>Contá el efectivo del cajón. Podés cargar cuántos billetes hay de cada uno, o escribir el total en "Monedas y otros".</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid grid-cols-[1fr_260px] gap-6">
              <div className="flex flex-col gap-2">
                {BILLETES.map((b) => (
                  <label key={b} className="grid grid-cols-[110px_90px_1fr] items-center gap-3">
                    <span className="numeros font-semibold">{pesos(b * 100)}</span>
                    <Input
                      inputMode="numeric"
                      aria-label={`Billetes de ${pesos(b * 100)}`}
                      placeholder="0"
                      value={cantidades[b] ?? ''}
                      onChange={(e) => setCantidades((c) => ({ ...c, [b]: e.target.value.replace(/\D/g, '') }))}
                      className="numeros h-10 text-center"
                    />
                    <span className="numeros text-right text-tinta-suave">
                      {cantidades[b] ? pesos(Number(cantidades[b]) * b * 100) : ''}
                    </span>
                  </label>
                ))}
                <div className="mt-1 grid grid-cols-[110px_1fr] items-center gap-3">
                  <span className="font-semibold">Monedas y otros</span>
                  <CampoPesos etiqueta="Monedas y otros" valor={otros} alCambiar={setOtros} chico />
                </div>
                <label className="mt-3 flex flex-col gap-2">
                  <span className="text-sm font-semibold">Nota (opcional)</span>
                  <Input value={nota} maxLength={140} placeholder="Ej.: faltante por un vuelto mal dado" onChange={(e) => setNota(e.target.value)} />
                </label>
              </div>
              <aside className="flex flex-col gap-3 rounded-xl bg-[#f6f6f3] p-4">
                <div>
                  <p className="text-sm text-tinta-suave">Debería haber</p>
                  <p className="numeros font-display text-2xl font-semibold">{pesos(esperado)}</p>
                </div>
                <div>
                  <p className="text-sm text-tinta-suave">Contado</p>
                  <p className="numeros font-display text-3xl font-semibold">{contado === null ? '—' : pesos(contado)}</p>
                </div>
                {contado !== null && <Diferencia centavos={contado - esperado} />}
                {resumen.sinCobrar.cantidad > 0 && (
                  <p className="text-[13px] font-semibold text-[#7a5a00]">
                    Ojo: {resumen.sinCobrar.cantidad === 1 ? 'queda 1 pedido' : `quedan ${resumen.sinCobrar.cantidad} pedidos`} sin cobrar <span className="whitespace-nowrap">({pesos(resumen.sinCobrar.totalCentavos)})</span>.
                  </p>
                )}
              </aside>
            </DialogBody>
            <DialogFooter>
              {cerrar.error && <p role="alert" className="mr-auto text-sm font-semibold text-rojo">{cerrar.error.message}</p>}
              <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
              <Button type="submit" disabled={contado === null || cerrar.isPending}>Cerrar caja</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
