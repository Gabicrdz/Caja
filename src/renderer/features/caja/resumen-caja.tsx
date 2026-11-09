import { plural } from '@/features/menu/textos';
import { pesos } from '@compartido/dinero';
import { MEDIOS_DE_PAGO, NOMBRE_MEDIO, NOMBRE_MOVIMIENTO, type ResumenCaja } from '@compartido/tipos';
import { cn } from '@/lib/utils';

/** Las cuentas de una caja: cobros por medio, efectivo y movimientos. */
export function ResumenDeCaja({ resumen: r }: { resumen: ResumenCaja }) {
  const filaEfectivo = (texto: string, monto: number, signo = '', fuerte = false) => (
    <div className={cn('flex justify-between py-1', fuerte && 'border-t border-linea pt-2 font-semibold')}>
      <span className={fuerte ? '' : 'text-tinta-suave'}>{texto}</span>
      <span className="numeros">
        {signo}
        {pesos(monto)}
      </span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-5">
      <section className="rounded-xl border border-linea bg-superficie p-5">
        <h3 className="mb-3 font-display text-lg font-semibold">Cobros por medio</h3>
        <ul className="flex flex-col">
          {MEDIOS_DE_PAGO.map((m) => (
            <li key={m} className="flex justify-between border-b border-linea py-2 last:border-0">
              <span className={r.porMedio[m].cobros ? '' : 'text-tinta-suave'}>
                {NOMBRE_MEDIO[m]}
                <span className="ml-2 text-[13px] text-tinta-suave">{plural(r.porMedio[m].cobros, 'cobro', 'cobros')}</span>
              </span>
              <span className="numeros font-semibold">{pesos(r.porMedio[m].montoCentavos)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-tinta pt-3">
          <span className="font-semibold">Total cobrado</span>
          <span className="numeros font-display text-2xl font-semibold">{pesos(r.ventasCentavos)}</span>
        </div>
        <p className="mt-2 text-[13px] text-tinta-suave">
          {plural(r.pedidosCobrados, 'pedido cobrado', 'pedidos cobrados')}
          {r.pedidosAnulados > 0 && ` · ${plural(r.pedidosAnulados, 'anulado', 'anulados')} (no suman)`}
          {r.sinCobrar.cantidad > 0 && ` · ${r.sinCobrar.cantidad} sin cobrar por ${pesos(r.sinCobrar.totalCentavos)}`}
        </p>
      </section>

      <section className="rounded-xl border border-linea bg-superficie p-5">
        <h3 className="mb-3 font-display text-lg font-semibold">Efectivo en la caja</h3>
        {filaEfectivo('Fondo inicial', r.caja.fondoCentavos)}
        {filaEfectivo('Cobrado en efectivo', r.porMedio.efectivo.montoCentavos, '+ ')}
        {r.ingresosCentavos > 0 && filaEfectivo('Ingresos', r.ingresosCentavos, '+ ')}
        {r.retirosCentavos > 0 && filaEfectivo('Retiros', r.retirosCentavos, '− ')}
        {r.gastosCentavos > 0 && filaEfectivo('Gastos', r.gastosCentavos, '− ')}
        <div className="mt-2 flex items-baseline justify-between border-t border-tinta pt-3">
          <span className="font-semibold">{r.caja.cerradaEn ? 'Debería haber' : 'Debería haber ahora'}</span>
          <span className="numeros font-display text-2xl font-semibold">{pesos(r.caja.esperadoCentavos ?? r.efectivoEsperadoCentavos)}</span>
        </div>
        {r.caja.contadoCentavos !== null && (
          <>
            <div className="flex justify-between py-1">
              <span className="text-tinta-suave">Contado</span>
              <span className="numeros font-semibold">{pesos(r.caja.contadoCentavos)}</span>
            </div>
            <Diferencia centavos={r.caja.diferenciaCentavos ?? 0} />
          </>
        )}
      </section>

      {r.movimientos.length > 0 && (
        <section className="col-span-2 rounded-xl border border-linea bg-superficie p-5">
          <h3 className="mb-2 font-display text-lg font-semibold">Movimientos</h3>
          <ul className="divide-y divide-linea">
            {r.movimientos.map((m) => (
              <li key={m.id} className="flex items-center gap-4 py-2.5">
                <span className="numeros w-12 text-[13px] text-tinta-suave">{m.hora}</span>
                <span className={cn('w-20 text-sm font-semibold', m.tipo === 'ingreso' ? 'text-verde' : 'text-rojo')}>{NOMBRE_MOVIMIENTO[m.tipo]}</span>
                <span className="flex-1">{m.motivo}</span>
                <span className="text-[13px] text-tinta-suave">{m.usuario}</span>
                <span className="numeros w-28 text-right font-semibold">
                  {m.tipo === 'ingreso' ? '+ ' : '− '}
                  {pesos(m.montoCentavos)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Diferencia({ centavos, grande = false }: { centavos: number; grande?: boolean }) {
  const texto = centavos === 0 ? 'Sin diferencia' : centavos > 0 ? `Sobran ${pesos(centavos)}` : `Faltan ${pesos(-centavos)}`;
  return (
    <p
      className={cn(
        'mt-2 rounded-lg px-3 py-2 text-center font-semibold',
        grande && 'font-display text-2xl',
        centavos === 0 ? 'bg-verde-suave text-verde' : centavos > 0 ? 'bg-mostaza-suave text-[#7a5a00]' : 'bg-rojo-suave text-rojo',
      )}
    >
      {texto}
    </p>
  );
}
