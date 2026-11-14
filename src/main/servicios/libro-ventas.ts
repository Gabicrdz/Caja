// Libro de ventas: todas las facturas y notas de crédito de un período, listas para pasarle
// al contador. Las notas de crédito restan. Solo se incluye el ambiente en uso: los
// comprobantes de prueba (homologación) no se mezclan con los reales.
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { BaseDeDatos } from '../db/conexion';
import { comprobantes, pedidos } from '../db/esquema';
import { NOMBRE_COMPROBANTE } from '../arca/tipos';
import { desglosarIva } from '../arca/wsfe';
import { cuitConGuiones } from '@compartido/cuit';
import type { AmbienteArca, FilaLibro, LibroDeVentas } from '@compartido/tipos';

const CONDICION: Record<number, string> = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
  7: 'Sujeto no Categorizado',
};

const ALICUOTA_21 = 5;

export function libroDeVentas(db: BaseDeDatos, rango: { desde: string; hasta: string }, ambiente: AmbienteArca): LibroDeVentas {
  const filasDb = db
    .select({ c: comprobantes, pedidoNumero: pedidos.numero, pedidoFecha: pedidos.fecha })
    .from(comprobantes)
    .innerJoin(pedidos, eq(pedidos.id, comprobantes.pedidoId))
    .where(and(gte(comprobantes.fecha, rango.desde), lte(comprobantes.fecha, rango.hasta), eq(comprobantes.ambiente, ambiente)))
    .orderBy(asc(comprobantes.fecha), asc(comprobantes.id))
    .all();

  const filas: FilaLibro[] = filasDb.map(({ c, pedidoNumero, pedidoFecha }) => {
    const nombre = NOMBRE_COMPROBANTE[c.tipo] ?? `Comprobante ${c.tipo}`;
    const esNota = c.asociadoId !== null;
    const signo = esNota ? -1 : 1;
    // Facturas A y B: el total incluye 21 % de IVA. Factura C (monotributo): sin IVA.
    const conIva = nombre.endsWith('A') || nombre.endsWith('B');
    const { neto, iva } = conIva ? desglosarIva(c.totalCentavos, ALICUOTA_21) : { neto: c.totalCentavos, iva: 0 };
    return {
      fecha: c.fecha,
      comprobante: nombre,
      esNota,
      puntoVenta: c.puntoVenta,
      numero: c.numero,
      numeroCompleto: `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`,
      cliente: c.docTipo === 80 ? `CUIT ${cuitConGuiones(c.docNro)}` : c.docTipo === 96 ? `DNI ${c.docNro}` : 'Consumidor Final',
      condicionIva: CONDICION[c.condicionIvaReceptor] ?? '',
      netoCentavos: signo * neto,
      ivaCentavos: signo * iva,
      totalCentavos: signo * c.totalCentavos,
      cae: c.cae,
      vencimientoCae: c.vencimientoCae,
      pedidoNumero,
      pedidoFecha,
    };
  });

  const suma = (campo: 'netoCentavos' | 'ivaCentavos' | 'totalCentavos') => filas.reduce((s, f) => s + f[campo], 0);
  return {
    desde: rango.desde,
    hasta: rango.hasta,
    ambiente,
    filas,
    facturas: filas.filter((f) => !f.esNota).length,
    notas: filas.filter((f) => f.esNota).length,
    netoCentavos: suma('netoCentavos'),
    ivaCentavos: suma('ivaCentavos'),
    totalCentavos: suma('totalCentavos'),
  };
}
