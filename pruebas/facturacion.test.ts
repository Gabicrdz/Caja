import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPedido, esquemaReceptor } from '../src/compartido/esquemas';
import type { Menu, Usuario } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { anularPedido, crearPedido, obtenerPedido } from '../src/main/servicios/pedidos';
import { anularConNotaDeCredito, contarPendientes, descartarPendiente, facturarPedido, type Autorizador } from '../src/main/servicios/facturacion';
import { ErrorDeArca } from '../src/main/arca/wsaa';
import type { DatosComprobante } from '../src/main/arca/tipos';
import { $, baseNueva, dueñoConCaja } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;
let dueno: Usuario;
const hoy = new Date(2026, 10, 14, 12, 30);

beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
  dueno = dueñoConCaja(db);
});

/** Un pedido de 1 producto; con `cobrado` false queda "para cobrar después". */
function pedido(cobrado = true) {
  const p = m.productos.find((x) => x.nombre === 'Medialuna')!;
  const total = p.precioCentavos;
  return crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'mostrador',
      items: [{ productoId: p.id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' }],
      totalEsperadoCentavos: total,
      pagos: cobrado ? [{ medio: 'efectivo', montoCentavos: total }] : [],
    }),
    hoy,
  );
}

/** Un "ARCA" falso: numera de a uno, y puede fallar. */
function arcaFalso(opciones: { condicionIva?: 'monotributo' | 'responsable_inscripto'; activa?: boolean; falla?: () => string | null; demora?: number } = {}) {
  const llamadas: DatosComprobante[] = [];
  let ultimo = 0;
  const a: Autorizador = {
    config: { activa: opciones.activa ?? true, ambiente: 'homologacion', cuit: '20446474937', puntoVenta: 1, condicionIva: opciones.condicionIva ?? 'monotributo' },
    async autorizar(datos) {
      llamadas.push(datos);
      if (opciones.demora) await new Promise((r) => setTimeout(r, opciones.demora));
      const error = opciones.falla?.();
      if (error) throw new ErrorDeArca(error);
      ultimo += 1;
      return { resultado: 'A', tipo: datos.tipo, puntoVenta: 1, numero: ultimo, cae: '74123456789012', vencimientoCae: '2026-11-24', observaciones: [] };
    },
  };
  return { a, llamadas };
}

async function falla(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return '(no falló)';
}

describe('facturar un pedido', () => {
  it('Factura C a consumidor final: guarda número, CAE y vencimiento', async () => {
    const { a, llamadas } = arcaFalso();
    const { id, totalCentavos } = pedido();
    const c = await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(c).toMatchObject({ nombre: 'Factura C', numeroCompleto: '0001-00000001', cae: '74123456789012', vencimientoCae: '2026-11-24', totalCentavos, ambiente: 'homologacion', docTipo: 99 });
    expect(llamadas[0]).toMatchObject({ tipo: 11, docTipo: 99, docNro: '0', condicionIvaReceptor: 5, fecha: '2026-11-14', totalCentavos });
    expect(obtenerPedido(db, id).comprobante?.cae).toBe('74123456789012');
  });

  it('numera de a uno con ARCA', async () => {
    const { a } = arcaFalso();
    const uno = await facturarPedido(db, a, pedido().id, null, dueno.id, hoy);
    const dos = await facturarPedido(db, a, pedido().id, null, dueno.id, hoy);
    expect([uno.numero, dos.numero]).toEqual([1, 2]);
  });

  it('un pedido no se factura dos veces', async () => {
    const { a, llamadas } = arcaFalso();
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(await falla(facturarPedido(db, a, id, null, dueno.id, hoy))).toContain('ya tiene la Factura C');
    expect(llamadas).toHaveLength(1);
  });

  it('un doble clic no emite dos facturas', async () => {
    const { a, llamadas } = arcaFalso({ demora: 30 });
    const { id } = pedido();
    const resultados = await Promise.allSettled([facturarPedido(db, a, id, null, dueno.id, hoy), facturarPedido(db, a, id, null, dueno.id, hoy)]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(llamadas).toHaveLength(1);
    expect(db.$client.prepare('SELECT count(*) AS n FROM comprobantes').get()).toEqual({ n: 1 });
  });

  it('no factura pedidos sin cobrar ni anulados, ni con la facturación apagada', async () => {
    const { a, llamadas } = arcaFalso();
    expect(await falla(facturarPedido(db, a, pedido(false).id, null, dueno.id, hoy))).toContain('todavía no está cobrado');
    const anulado = pedido();
    anularPedido(db, anulado.id, 'error', dueno.id);
    expect(await falla(facturarPedido(db, a, anulado.id, null, dueno.id, hoy))).toContain('está anulado');
    const apagada = arcaFalso({ activa: false });
    expect(await falla(facturarPedido(db, apagada.a, pedido().id, null, dueno.id, hoy))).toContain('no está activada');
    expect(llamadas).toHaveLength(0);
    expect(apagada.llamadas).toHaveLength(0);
  });

  it('un pedido cobrado después también se puede facturar', async () => {
    const { a } = arcaFalso();
    const { id } = pedido(false);
    db.$client.prepare('UPDATE pedidos SET cobrado = 1 WHERE id = ?').run(id);
    expect((await facturarPedido(db, a, id, null, dueno.id, hoy)).numero).toBe(1);
  });
});

describe('quién es el cliente y qué letra sale', () => {
  it('el monotributista siempre emite C, aunque el cliente tenga CUIT', async () => {
    const { a, llamadas } = arcaFalso();
    const receptor = esquemaReceptor.parse({ tipo: 'cuit', numero: '20446474937', condicionIva: 1 });
    await facturarPedido(db, a, pedido().id, receptor, dueno.id, hoy);
    expect(llamadas[0]!.tipo).toBe(11);
  });

  it('el responsable inscripto emite B a consumidor final y A a otro inscripto', async () => {
    const { a, llamadas } = arcaFalso({ condicionIva: 'responsable_inscripto' });
    await facturarPedido(db, a, pedido().id, null, dueno.id, hoy);
    await facturarPedido(db, a, pedido().id, { docTipo: 80, docNro: '20446474937', condicionIva: 1 }, dueno.id, hoy);
    expect(llamadas.map((l) => l.tipo)).toEqual([6, 1]);
    expect(llamadas[1]).toMatchObject({ docTipo: 80, docNro: '20446474937', condicionIvaReceptor: 1 });
  });

  it('valida lo que se escribe del cliente', () => {
    expect(esquemaReceptor.parse({ tipo: 'consumidor_final', numero: 'lo que sea' })).toEqual({ docTipo: 99, docNro: '0', condicionIva: 5 });
    expect(esquemaReceptor.parse({ tipo: 'dni', numero: '30.123.456' })).toEqual({ docTipo: 96, docNro: '30123456', condicionIva: 5 });
    expect(() => esquemaReceptor.parse({ tipo: 'dni', numero: '123' })).toThrow('DNI');
    expect(esquemaReceptor.parse({ tipo: 'cuit', numero: '20-44647493-7', condicionIva: 6 })).toEqual({ docTipo: 80, docNro: '20446474937', condicionIva: 6 });
    expect(() => esquemaReceptor.parse({ tipo: 'cuit', numero: '20-44647493-1', condicionIva: 1 })).toThrow('CUIT del cliente');
    expect(() => esquemaReceptor.parse({ tipo: 'cuit', numero: '20446474937', condicionIva: 99 })).toThrow('condición');
  });
});

describe('cuando ARCA falla', () => {
  it('el pedido queda cobrado y la factura pendiente, con el motivo', async () => {
    const { a } = arcaFalso({ falla: () => 'ARCA no responde.' });
    const { id } = pedido();
    const mensaje = await falla(facturarPedido(db, a, id, { docTipo: 96, docNro: '30123456', condicionIva: 5 }, dueno.id, hoy));
    expect(mensaje).toContain('está cobrado, pero no se pudo facturar');
    expect(mensaje).toContain('ARCA no responde.');
    const p = obtenerPedido(db, id);
    expect(p.cobrado).toBe(true);
    expect(p.comprobante).toBeNull();
    expect(p.facturaPendiente).toBe('ARCA no responde.');
    expect(contarPendientes(db)).toBe(1);
  });

  it('el reintento usa el cliente del primer intento y limpia el pendiente', async () => {
    let cae = false;
    const { a, llamadas } = arcaFalso({ falla: () => (cae ? null : 'ARCA no responde.') });
    const { id } = pedido();
    await falla(facturarPedido(db, a, id, { docTipo: 96, docNro: '30123456', condicionIva: 5 }, dueno.id, hoy));
    await falla(facturarPedido(db, a, id, null, dueno.id, hoy));
    expect(db.$client.prepare('SELECT intentos FROM facturas_pendientes').get()).toEqual({ intentos: 2 });
    cae = true;
    const c = await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(c.docNro).toBe('30123456');
    expect(llamadas[2]).toMatchObject({ docTipo: 96, docNro: '30123456' });
    expect(contarPendientes(db)).toBe(0);
    expect(obtenerPedido(db, id).facturaPendiente).toBeNull();
  });

  it('se puede descartar el pendiente (el pedido sigue cobrado)', async () => {
    const { a } = arcaFalso({ falla: () => 'x' });
    const { id } = pedido();
    await falla(facturarPedido(db, a, id, null, dueno.id, hoy));
    descartarPendiente(db, id);
    expect(contarPendientes(db)).toBe(0);
    expect(obtenerPedido(db, id).cobrado).toBe(true);
  });

  it('después de un fallo se puede volver a intentar (no queda "en curso")', async () => {
    let falla1 = true;
    const { a } = arcaFalso({ falla: () => (falla1 ? 'x' : null) });
    const { id } = pedido();
    await falla(facturarPedido(db, a, id, null, dueno.id, hoy));
    falla1 = false;
    expect((await facturarPedido(db, a, id, null, dueno.id, hoy)).numero).toBe(1);
  });
});

describe('una factura no se borra', () => {
  it('no deja anular un pedido facturado: hace falta una nota de crédito', async () => {
    const { a } = arcaFalso();
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(() => anularPedido(db, id, 'se equivocó', dueno.id)).toThrow('nota de crédito');
    expect(obtenerPedido(db, id).estado).not.toBe('anulado');
  });

  it('la base no deja repetir el número de un comprobante', async () => {
    const { a } = arcaFalso();
    await facturarPedido(db, a, pedido().id, null, dueno.id, hoy);
    const intento = () =>
      db.$client
        .prepare(
          "INSERT INTO comprobantes (pedido_id, tipo, punto_venta, numero, fecha, total_centavos, doc_tipo, condicion_iva_receptor, cae, vencimiento_cae, ambiente, cuit_emisor) VALUES (1, 11, 1, 1, '2026-11-14', 100, 99, 5, 'x', '2026-11-24', 'homologacion', '20446474937')",
        )
        .run();
    expect(intento).toThrow('UNIQUE');
  });
});

describe('anular con nota de crédito', () => {
  it('un pedido sin factura se anula directo, sin tocar ARCA', async () => {
    const { a, llamadas } = arcaFalso();
    const { id } = pedido();
    expect(await anularConNotaDeCredito(db, a, id, 'error', dueno.id, hoy)).toBeNull();
    expect(obtenerPedido(db, id).estado).toBe('anulado');
    expect(llamadas).toHaveLength(0);
  });

  it('pide la nota de crédito a ARCA (misma letra, mismo importe, asociada) y recién ahí anula', async () => {
    const { a, llamadas } = arcaFalso({ condicionIva: 'responsable_inscripto' });
    const { id, totalCentavos } = pedido();
    const receptor = { docTipo: 80, docNro: '20446474937', condicionIva: 1 };
    const factura = await facturarPedido(db, a, id, receptor, dueno.id, hoy);
    const nota = await anularConNotaDeCredito(db, a, id, 'el cliente canceló', dueno.id, hoy);
    expect(llamadas[1]).toMatchObject({
      tipo: 3,
      docTipo: 80,
      docNro: '20446474937',
      condicionIvaReceptor: 1,
      totalCentavos,
      asociado: { tipo: 1, puntoVenta: 1, numero: factura.numero },
    });
    expect(nota).toMatchObject({ nombre: 'Nota de Crédito A', totalCentavos });
    const p = obtenerPedido(db, id);
    expect(p.estado).toBe('anulado');
    expect(p.motivoAnulacion).toBe('el cliente canceló');
    expect(p.comprobante?.numero).toBe(factura.numero);
    expect(p.notaDeCredito?.numero).toBe(nota!.numero);
    expect(db.$client.prepare('SELECT asociado_id AS a FROM comprobantes WHERE id = ?').get(nota!.id)).toEqual({ a: factura.id });
  });

  it('en Factura C la nota de crédito es C', async () => {
    const { a, llamadas } = arcaFalso();
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    await anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy);
    expect(llamadas[1]!.tipo).toBe(13);
  });

  it('si ARCA falla, el pedido NO se anula y se puede reintentar', async () => {
    let cae = true;
    const { a } = arcaFalso({ falla: () => (cae ? null : 'ARCA no responde.') });
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    cae = false;
    const mensaje = await falla(anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy));
    expect(mensaje).toContain('El pedido NO se anuló');
    expect(mensaje).toContain('ARCA no responde.');
    expect(obtenerPedido(db, id).estado).not.toBe('anulado');
    expect(obtenerPedido(db, id).notaDeCredito).toBeNull();
    cae = true;
    expect((await anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy))?.nombre).toBe('Nota de Crédito C');
    expect(obtenerPedido(db, id).estado).toBe('anulado');
  });

  it('no emite dos notas de crédito para el mismo pedido', async () => {
    const { a, llamadas } = arcaFalso();
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    await anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy);
    expect(await falla(anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy))).toContain('ya estaba anulado');
    expect(llamadas).toHaveLength(2);
  });

  it('un doble clic emite una sola nota de crédito', async () => {
    const { a, llamadas } = arcaFalso({ demora: 30 });
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    const r = await Promise.allSettled([anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy), anularConNotaDeCredito(db, a, id, 'x', dueno.id, hoy)]);
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(llamadas).toHaveLength(2);
  });

  it('la nota tiene que salir por el mismo CUIT, punto de venta y ambiente que la factura', async () => {
    const { a } = arcaFalso();
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    const otroAmbiente = arcaFalso();
    otroAmbiente.a.config.ambiente = 'produccion';
    expect(await falla(anularConNotaDeCredito(db, otroAmbiente.a, id, 'x', dueno.id, hoy))).toContain('pruebas (homologación)');
    const otroPunto = arcaFalso();
    otroPunto.a.config.puntoVenta = 2;
    expect(await falla(anularConNotaDeCredito(db, otroPunto.a, id, 'x', dueno.id, hoy))).toContain('punto de venta 1');
    const apagada = arcaFalso({ activa: false });
    expect(await falla(anularConNotaDeCredito(db, apagada.a, id, 'x', dueno.id, hoy))).toContain('Activá la facturación');
    expect(obtenerPedido(db, id).estado).not.toBe('anulado');
    expect(otroAmbiente.llamadas.length + otroPunto.llamadas.length + apagada.llamadas.length).toBe(0);
  });
});
