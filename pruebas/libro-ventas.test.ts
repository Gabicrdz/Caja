import { inflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPedido } from '../src/compartido/esquemas';
import type { Menu, Usuario } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { crearPedido } from '../src/main/servicios/pedidos';
import { anularConNotaDeCredito, facturarPedido, type Autorizador } from '../src/main/servicios/facturacion';
import { libroDeVentas } from '../src/main/servicios/libro-ventas';
import { xlsxDelLibro } from '../src/main/exportar/libro-xlsx';
import { crc32, crearXlsx, fechaComoNumero, letraDeColumna } from '../src/main/exportar/xlsx';
import { baseNueva, dueñoConCaja } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;
let dueno: Usuario;
const dia = (d: number) => new Date(2026, 10, d, 12, 0);

beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
  dueno = dueñoConCaja(db);
});

function pedido(cantidad = 1) {
  const p = m.productos.find((x) => x.nombre === 'Medialuna')!;
  return crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'mostrador',
      items: [{ productoId: p.id, varianteId: null, opcionesIds: [], cantidad, nota: '' }],
      totalEsperadoCentavos: p.precioCentavos * cantidad,
      pagos: [{ medio: 'efectivo', montoCentavos: p.precioCentavos * cantidad }],
    }),
    dia(14),
  );
}

function arca(condicionIva: 'monotributo' | 'responsable_inscripto' = 'monotributo', ambiente: 'homologacion' | 'produccion' = 'homologacion'): Autorizador {
  let n = 0;
  return {
    config: { activa: true, ambiente, cuit: '20446474937', puntoVenta: 1, condicionIva },
    async autorizar(d) {
      n += 1;
      return { resultado: 'A', tipo: d.tipo, puntoVenta: 1, numero: n, cae: '74123456789012', vencimientoCae: '2026-11-30', observaciones: [] };
    },
  };
}

describe('libro de ventas', () => {
  it('lista facturas y notas de crédito del período; las notas restan', async () => {
    const a = arca();
    const p1 = pedido(2);
    const p2 = pedido(1);
    await facturarPedido(db, a, p1.id, null, dueno.id, dia(14));
    await facturarPedido(db, a, p2.id, { docTipo: 96, docNro: '30123456', condicionIva: 5 }, dueno.id, dia(15));
    await anularConNotaDeCredito(db, a, p2.id, 'error', dueno.id, dia(16));
    const libro = libroDeVentas(db, { desde: '2026-11-01', hasta: '2026-11-30' }, 'homologacion');
    expect(libro.filas.map((f) => [f.fecha, f.comprobante, f.numeroCompleto, f.cliente])).toEqual([
      ['2026-11-14', 'Factura C', '0001-00000001', 'Consumidor Final'],
      ['2026-11-15', 'Factura C', '0001-00000002', 'DNI 30123456'],
      ['2026-11-16', 'Nota de Crédito C', '0001-00000003', 'DNI 30123456'],
    ]);
    expect(libro.facturas).toBe(2);
    expect(libro.notas).toBe(1);
    expect(libro.filas[2]!.totalCentavos).toBe(-libro.filas[1]!.totalCentavos);
    expect(libro.totalCentavos).toBe(libro.filas[0]!.totalCentavos);
    // Factura C: sin IVA, todo es neto.
    expect(libro.ivaCentavos).toBe(0);
    expect(libro.netoCentavos).toBe(libro.totalCentavos);
    expect(libro.filas[0]!.pedidoNumero).toBe(p1.numero);
  });

  it('respeta el rango de fechas y el ambiente', async () => {
    const a = arca();
    await facturarPedido(db, a, pedido().id, null, dueno.id, dia(14));
    await facturarPedido(db, a, pedido().id, null, dueno.id, dia(20));
    expect(libroDeVentas(db, { desde: '2026-11-15', hasta: '2026-11-30' }, 'homologacion').filas).toHaveLength(1);
    expect(libroDeVentas(db, { desde: '2026-11-14', hasta: '2026-11-14' }, 'homologacion').filas).toHaveLength(1);
    expect(libroDeVentas(db, { desde: '2026-11-01', hasta: '2026-11-30' }, 'produccion').filas).toHaveLength(0);
  });

  it('responsable inscripto: separa neto e IVA (21 %)', async () => {
    const a = arca('responsable_inscripto');
    const p = pedido(10);
    await facturarPedido(db, a, p.id, { docTipo: 80, docNro: '30712345678', condicionIva: 1 }, dueno.id, dia(14));
    const f = libroDeVentas(db, { desde: '2026-11-14', hasta: '2026-11-14' }, 'homologacion').filas[0]!;
    expect(f.comprobante).toBe('Factura A');
    expect(f.cliente).toBe('CUIT 30-71234567-8');
    expect(f.condicionIva).toBe('IVA Responsable Inscripto');
    expect(f.netoCentavos + f.ivaCentavos).toBe(f.totalCentavos);
    expect(f.ivaCentavos).toBe(f.totalCentavos - Math.round((f.totalCentavos * 100) / 121));
  });

  it('un período sin facturas da un libro vacío', () => {
    const libro = libroDeVentas(db, { desde: '2026-11-01', hasta: '2026-11-30' }, 'homologacion');
    expect(libro).toMatchObject({ filas: [], facturas: 0, notas: 0, totalCentavos: 0 });
  });
});

/** Lee un .zip armado por nosotros: nombre → contenido. */
function desempaquetar(zip: Buffer): Record<string, string> {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cantidad = zip.readUInt16LE(fin + 10);
  let pos = zip.readUInt32LE(fin + 16);
  const salida: Record<string, string> = {};
  for (let i = 0; i < cantidad; i++) {
    const crc = zip.readUInt32LE(pos + 16);
    const comprimido = zip.readUInt32LE(pos + 20);
    const largoNombre = zip.readUInt16LE(pos + 28);
    const local = zip.readUInt32LE(pos + 42);
    const nombre = zip.subarray(pos + 46, pos + 46 + largoNombre).toString('utf8');
    const datos = zip.subarray(local + 30 + zip.readUInt16LE(local + 26), local + 30 + zip.readUInt16LE(local + 26) + comprimido);
    const crudo = inflateRawSync(datos);
    expect(crc32(crudo)).toBe(crc);
    salida[nombre] = crudo.toString('utf8');
    pos += 46 + largoNombre;
  }
  return salida;
}

describe('archivo de Excel', () => {
  it('funciones básicas: CRC, columnas y fechas', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect([0, 1, 25, 26, 27, 701, 702].map(letraDeColumna)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(fechaComoNumero('1900-03-01')).toBe(61);
    expect(fechaComoNumero('2026-11-14')).toBe(46340);
  });

  it('arma un .xlsx válido con las hojas, estilos y datos escapados', () => {
    const zip = crearXlsx(
      [{ nombre: 'Hoja: <1>', anchos: [10], filas: [[{ tipo: 'texto', valor: 'A & B <c> "d"', estilo: 'encabezado' }], [{ tipo: 'numero', valor: -12.5 }]] }],
      new Date(2026, 10, 14),
    );
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    const a = desempaquetar(zip);
    expect(Object.keys(a).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
    expect(a['xl/workbook.xml']).toContain('name="Hoja  &lt;1&gt;"'); // los dos puntos no se permiten en nombres de hoja
    expect(a['xl/worksheets/sheet1.xml']).toContain('A &amp; B &lt;c&gt; &quot;d&quot;');
    expect(a['xl/worksheets/sheet1.xml']).toContain('<v>-12.5</v>');
  });

  it('el libro de ventas sale como planilla con encabezado, filas y totales', async () => {
    const a = arca();
    await facturarPedido(db, a, pedido(2).id, null, dueno.id, dia(14));
    const libro = libroDeVentas(db, { desde: '2026-11-01', hasta: '2026-11-30' }, 'homologacion');
    const archivos = desempaquetar(xlsxDelLibro(libro, dia(14)));
    const hoja = archivos['xl/worksheets/sheet1.xml']!;
    expect(hoja).toContain('Condición IVA del cliente');
    expect(hoja).toContain('Factura C');
    expect(hoja).toContain('0001-00000001');
    expect(hoja).toContain(`<v>${fechaComoNumero('2026-11-14')}</v>`);
    expect(hoja).toContain(`<v>${libro.totalCentavos / 100}</v>`);
    expect(hoja).toContain('TOTAL (1 facturas, 0 notas de crédito)');
    expect(hoja).toContain('<autoFilter ref="A1:K2"/>'); // la fila de totales queda afuera del filtro
    expect(archivos['xl/workbook.xml']).toContain('Libro de ventas PRUEBA');
  });
});
