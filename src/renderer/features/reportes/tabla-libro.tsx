// Libro de ventas: las facturas y notas de crédito del período, listas para el contador.
import { FileSpreadsheet } from 'lucide-react';
import { pesos } from '@compartido/dinero';
import type { LibroDeVentas } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const fecha = (iso: string) => iso.split('-').reverse().join('/');

export function TablaLibro({
  libro,
  exportando,
  alExportar,
}: {
  libro: LibroDeVentas;
  exportando: boolean;
  alExportar: () => void;
}) {
  const prueba = libro.ambiente === 'homologacion';
  return (
    <section aria-label="Libro de ventas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[15px] text-tinta-suave">
          <span>
            <b className="text-tinta">{libro.facturas}</b> {libro.facturas === 1 ? 'factura' : 'facturas'}
          </span>
          <span>
            <b className="text-tinta">{libro.notas}</b> {libro.notas === 1 ? 'nota de crédito' : 'notas de crédito'}
          </span>
          {prueba && <Badge variant="mostaza">Comprobantes de prueba</Badge>}
        </div>
        <Button onClick={alExportar} disabled={exportando || libro.filas.length === 0}>
          <FileSpreadsheet /> {exportando ? 'Guardando…' : 'Exportar a Excel'}
        </Button>
      </div>

      {libro.filas.length === 0 ? (
        <p className="rounded-2xl border border-linea bg-superficie px-6 py-10 text-center text-tinta-suave">
          No hay facturas en este período{prueba ? ' (solo se muestran las de prueba)' : ''}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea bg-superficie">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-linea text-left text-[13px] text-tinta-suave">
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Comprobante</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 text-right font-semibold">Neto</th>
                <th className="px-4 py-3 text-right font-semibold">IVA</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Pedido</th>
              </tr>
            </thead>
            <tbody>
              {libro.filas.map((f) => (
                <tr key={`${f.comprobante}-${f.numeroCompleto}`} className="border-b border-linea last:border-0">
                  <td className="numeros px-4 py-2.5">{fecha(f.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('font-semibold', f.esNota && 'text-rojo')}>{f.comprobante}</span>
                    <span className="numeros ml-2 text-tinta-suave">{f.numeroCompleto}</span>
                  </td>
                  <td className="px-4 py-2.5">{f.cliente}</td>
                  <td className="numeros px-4 py-2.5 text-right">{pesos(f.netoCentavos)}</td>
                  <td className="numeros px-4 py-2.5 text-right">{pesos(f.ivaCentavos)}</td>
                  <td className={cn('numeros px-4 py-2.5 text-right font-semibold', f.esNota && 'text-rojo')}>{pesos(f.totalCentavos)}</td>
                  <td className="numeros px-4 py-2.5 text-tinta-suave">#{f.pedidoNumero}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-linea-fuerte font-semibold">
                <td className="px-4 py-3" colSpan={3}>
                  Total del período
                </td>
                <td className="numeros px-4 py-3 text-right">{pesos(libro.netoCentavos)}</td>
                <td className="numeros px-4 py-3 text-right">{pesos(libro.ivaCentavos)}</td>
                <td className="numeros px-4 py-3 text-right">{pesos(libro.totalCentavos)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
