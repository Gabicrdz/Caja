// El libro de ventas como planilla de Excel.
import type { LibroDeVentas } from '@compartido/tipos';
import { crearXlsx, type Celda } from './xlsx';

const texto = (valor: string, estilo: 'encabezado' | 'normal' | 'negrita' = 'normal'): Celda => ({ tipo: 'texto', valor, estilo });
const plata = (centavos: number, estilo: 'moneda' | 'moneda-total' = 'moneda'): Celda => ({ tipo: 'numero', valor: centavos / 100, estilo });

const ENCABEZADOS = ['Fecha', 'Comprobante', 'Número', 'Cliente', 'Condición IVA del cliente', 'Neto gravado', 'IVA', 'Total', 'CAE', 'Vto. CAE', 'Pedido'];

export function xlsxDelLibro(libro: LibroDeVentas, ahora: Date = new Date()): Buffer {
  const filas: (Celda | null)[][] = [ENCABEZADOS.map((e) => texto(e, 'encabezado'))];
  for (const f of libro.filas) {
    filas.push([
      { tipo: 'fecha', valor: f.fecha },
      texto(f.comprobante),
      texto(f.numeroCompleto),
      texto(f.cliente),
      texto(f.condicionIva),
      plata(f.netoCentavos),
      plata(f.ivaCentavos),
      plata(f.totalCentavos),
      texto(f.cae),
      { tipo: 'fecha', valor: f.vencimientoCae },
      texto(`#${f.pedidoNumero} (${f.pedidoFecha.split('-').reverse().join('/')})`),
    ]);
  }
  filas.push([
    texto(`TOTAL (${libro.facturas} facturas, ${libro.notas} notas de crédito)`, 'negrita'),
    texto('', 'negrita'),
    texto('', 'negrita'),
    texto('', 'negrita'),
    texto('', 'negrita'),
    plata(libro.netoCentavos, 'moneda-total'),
    plata(libro.ivaCentavos, 'moneda-total'),
    plata(libro.totalCentavos, 'moneda-total'),
    texto('', 'negrita'),
    texto('', 'negrita'),
    texto('', 'negrita'),
  ]);
  return crearXlsx(
    [{ nombre: libro.ambiente === 'homologacion' ? 'Libro de ventas PRUEBA' : 'Libro de ventas', anchos: [12, 20, 16, 30, 26, 15, 13, 15, 17, 12, 18], filas, conTotales: true }],
    ahora,
  );
}
