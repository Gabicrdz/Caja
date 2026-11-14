import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPedido } from '../src/compartido/esquemas';
import type { Menu, Usuario } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { crearPedido, obtenerPedido } from '../src/main/servicios/pedidos';
import { anularConNotaDeCredito, contarPendientes, facturarPedido, type Autorizador } from '../src/main/servicios/facturacion';
import { ErrorDeArca } from '../src/main/arca/wsaa';
import { leerRespuestaConsultar, sobreConsultar } from '../src/main/arca/wsfe';
import type { ComprobanteConsultado, DatosComprobante } from '../src/main/arca/tipos';
import { baseNueva, dueñoConCaja } from './ayudantes';

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

function pedido() {
  const p = m.productos.find((x) => x.nombre === 'Medialuna')!;
  return crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'mostrador',
      items: [{ productoId: p.id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' }],
      totalEsperadoCentavos: p.precioCentavos,
      pagos: [{ medio: 'efectivo', montoCentavos: p.precioCentavos }],
    }),
    hoy,
  );
}

/** Un ARCA falso con memoria: lo que autoriza queda guardado aunque la respuesta se "pierda". */
function arca(opciones: { perderRespuestas?: number; consultaCaida?: boolean } = {}) {
  const emitidos: ComprobanteConsultado[] = [];
  let aPerder = opciones.perderRespuestas ?? 0;
  const contador = { autorizar: 0, consultar: 0 };
  const a: Autorizador = {
    config: { activa: true, ambiente: 'homologacion', cuit: '20446474937', puntoVenta: 1, condicionIva: 'monotributo' },
    async autorizar(d: DatosComprobante) {
      contador.autorizar += 1;
      const numero = emitidos.filter((e) => e.tipo === d.tipo).length + 1;
      emitidos.push({ tipo: d.tipo, puntoVenta: 1, numero, docTipo: d.docTipo, docNro: d.docNro || '0', fecha: d.fecha, totalCentavos: d.totalCentavos, cae: `7412345678${String(numero).padStart(4, '0')}`, vencimientoCae: '2026-11-24', resultado: 'A', asociado: d.asociado });
      if (aPerder > 0) {
        aPerder -= 1;
        throw new ErrorDeArca('Se agotó el tiempo de espera de ARCA.');
      }
      const e = emitidos[emitidos.length - 1]!;
      return { resultado: 'A', tipo: e.tipo, puntoVenta: 1, numero, cae: e.cae, vencimientoCae: e.vencimientoCae, observaciones: [] };
    },
    async ultimoAutorizado(tipo) {
      return emitidos.filter((e) => e.tipo === tipo).length;
    },
    async consultar(tipo, numero) {
      contador.consultar += 1;
      if (opciones.consultaCaida) throw new ErrorDeArca('Sin conexión.');
      return emitidos.find((e) => e.tipo === tipo && e.numero === numero) ?? null;
    },
  };
  return { a, emitidos, contador };
}

async function falla(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return '(no falló)';
}

describe('recuperar una factura que ARCA autorizó y no se guardó', () => {
  it('si se pierde la respuesta, el reintento recupera la factura en vez de emitir otra', async () => {
    const { a, emitidos, contador } = arca({ perderRespuestas: 1 });
    const { id } = pedido();
    expect(await falla(facturarPedido(db, a, id, null, dueno.id, hoy))).toContain('Queda pendiente');
    expect(contarPendientes(db)).toBe(1);
    expect(emitidos).toHaveLength(1); // ARCA sí la emitió

    const c = await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(c).toMatchObject({ numeroCompleto: '0001-00000001', cae: '74123456780001' });
    expect(emitidos).toHaveLength(1); // no se emitió una segunda
    expect(contador.autorizar).toBe(1);
    expect(contarPendientes(db)).toBe(0);
    expect(obtenerPedido(db, id).comprobante?.cae).toBe('74123456780001');
  });

  it('el comprobante recuperado conserva la fecha con la que ARCA lo emitió', async () => {
    const { a } = arca({ perderRespuestas: 1 });
    const { id } = pedido();
    await falla(facturarPedido(db, a, id, null, dueno.id, hoy));
    const mañana = new Date(2026, 10, 15, 9, 0);
    const c = await facturarPedido(db, a, id, null, dueno.id, mañana);
    expect(c.fecha).toBe('2026-11-14');
  });

  it('si se corta después de que ARCA autorizó (antes de guardar), queda pendiente para reintentar', async () => {
    const { a } = arca();
    const { id } = pedido();
    // La respuesta llega, pero el pedido queda pendiente mientras se espera (el "intento" ya está anotado).
    const original = a.autorizar.bind(a);
    let pendientesDurante = -1;
    a.autorizar = async (d) => {
      pendientesDurante = contarPendientes(db);
      return original(d);
    };
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(pendientesDurante).toBe(1);
    expect(contarPendientes(db)).toBe(0);
  });

  it('un intento normal (el primero) no consulta nada extra a ARCA', async () => {
    const { a, contador } = arca();
    await facturarPedido(db, a, pedido().id, null, dueno.id, hoy);
    expect(contador.consultar).toBe(0);
  });

  it('no adopta un comprobante que no coincide (otro importe): emite uno nuevo', async () => {
    const { a, emitidos, contador } = arca({ perderRespuestas: 1 });
    const { id } = pedido();
    await falla(facturarPedido(db, a, id, null, dueno.id, hoy));
    emitidos[0]!.totalCentavos += 100; // en ARCA quedó otro importe
    const c = await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(c.numero).toBe(2);
    expect(contador.autorizar).toBe(2);
  });

  it('si ARCA no deja consultar, se sigue con el flujo normal', async () => {
    const { a, contador } = arca({ perderRespuestas: 1, consultaCaida: true });
    const { id } = pedido();
    await falla(facturarPedido(db, a, id, null, dueno.id, hoy));
    const c = await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(c.numero).toBe(2); // sin poder revisar, emite otra (queda a revisar por el contador)
    expect(contador.autorizar).toBe(2);
  });

  it('no se adopta un número que la Caja ya tiene guardado para otro pedido', async () => {
    const { a, emitidos } = arca();
    const uno = await facturarPedido(db, a, pedido().id, null, dueno.id, hoy); // #1 guardada
    const { id } = pedido();
    // Un intento fallido de otro pedido, mismo importe y cliente
    db.$client.prepare("INSERT INTO facturas_pendientes (pedido_id, doc_tipo, doc_nro, condicion_iva_receptor, ultimo_error) VALUES (?, 99, '0', 5, 'x')").run(id);
    const c = await facturarPedido(db, a, id, null, dueno.id, hoy);
    expect(c.numero).toBe(2);
    expect(uno.numero).toBe(1);
    expect(emitidos).toHaveLength(2);
  });
});

describe('recuperar una nota de crédito que ARCA emitió y no se guardó', () => {
  it('si se pierde la respuesta, el reintento recupera la nota y anula el pedido', async () => {
    const { a, emitidos } = arca();
    const { id } = pedido();
    await facturarPedido(db, a, id, null, dueno.id, hoy);
    const perdida = arca();
    // Mismo ARCA, pero ahora la próxima respuesta se pierde
    let pierde = true;
    const original = a.autorizar.bind(a);
    a.autorizar = async (d) => {
      const r = await original(d);
      if (pierde && d.asociado) {
        pierde = false;
        throw new ErrorDeArca('Se agotó el tiempo de espera de ARCA.');
      }
      return r;
    };
    void perdida;
    expect(await falla(anularConNotaDeCredito(db, a, id, 'error', dueno.id, hoy))).toContain('El pedido NO se anuló');
    expect(obtenerPedido(db, id).estado).not.toBe('anulado');
    expect(emitidos.filter((e) => e.tipo === 13)).toHaveLength(1);

    const nota = await anularConNotaDeCredito(db, a, id, 'error', dueno.id, hoy);
    expect(nota).toMatchObject({ nombre: 'Nota de Crédito C', numeroCompleto: '0001-00000001' });
    expect(emitidos.filter((e) => e.tipo === 13)).toHaveLength(1); // no hay una segunda nota
    expect(obtenerPedido(db, id).estado).toBe('anulado');
  });

  it('una nota de otra factura no se confunde con la de este pedido', async () => {
    const { a, emitidos } = arca();
    const uno = pedido();
    const dos = pedido();
    await facturarPedido(db, a, uno.id, null, dueno.id, hoy);
    await facturarPedido(db, a, dos.id, null, dueno.id, hoy);
    // En ARCA existe una nota de crédito asociada a la factura #2 (que no es la del pedido 1)
    emitidos.push({ tipo: 13, puntoVenta: 1, numero: 1, docTipo: 99, docNro: '0', fecha: '2026-11-14', totalCentavos: uno.totalCentavos, cae: '74123456789999', vencimientoCae: '2026-11-24', resultado: 'A', asociado: { tipo: 11, puntoVenta: 1, numero: 2 } });
    const nota = await anularConNotaDeCredito(db, a, uno.id, 'error', dueno.id, hoy);
    expect(nota?.numero).toBe(2); // emitió una propia
  });
});

describe('FECompConsultar (el mensaje y la respuesta)', () => {
  const cred = { cuit: '20446474937', ticket: { token: 'T', sign: 'S', venceMs: 0 } };

  it('arma el pedido con el orden que pide ARCA', () => {
    const xml = sobreConsultar(cred, 1, 11, 7);
    expect(xml).toContain('<ar:FECompConsultar>');
    expect(xml).toContain('<ar:FeCompConsReq><ar:CbteTipo>11</ar:CbteTipo><ar:CbteNro>7</ar:CbteNro><ar:PtoVta>1</ar:PtoVta></ar:FeCompConsReq>');
  });

  const respuesta = (extra = '') =>
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult><ResultGet><Concepto>1</Concepto><DocTipo>96</DocTipo><DocNro>30123456</DocNro><CbteDesde>7</CbteDesde><CbteHasta>7</CbteHasta><CbteFch>20261114</CbteFch><ImpTotal>1234.50</ImpTotal><ImpNeto>1234.50</ImpNeto><Resultado>A</Resultado><CodAutorizacion>86461069119998</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261124</FchVto><FchProceso>20261114103000</FchProceso>${extra}</ResultGet></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>`;

  it('lee el comprobante (importe exacto, fechas y CAE)', () => {
    const c = leerRespuestaConsultar(respuesta(), 11, 1, 7)!;
    expect(c).toMatchObject({ tipo: 11, puntoVenta: 1, numero: 7, docTipo: 96, docNro: '30123456', fecha: '2026-11-14', totalCentavos: 123450, cae: '86461069119998', vencimientoCae: '2026-11-24', resultado: 'A' });
    expect(c.asociado).toBe(undefined);
  });

  it('lee el comprobante asociado de una nota de crédito', () => {
    const c = leerRespuestaConsultar(respuesta('<CbtesAsoc><CbteAsoc><Tipo>11</Tipo><PtoVta>1</PtoVta><Nro>5</Nro><Cuit>20446474937</Cuit><CbteFch>20261114</CbteFch></CbteAsoc></CbtesAsoc>'), 13, 1, 7)!;
    expect(c.asociado).toEqual({ tipo: 11, puntoVenta: 1, numero: 5 });
  });

  it('un número que no existe (602) da null; otros errores se propagan', () => {
    const err = (codigo: number) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult><Errors><Err><Code>${codigo}</Code><Msg>No existen datos</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>`;
    expect(leerRespuestaConsultar(err(602), 11, 1, 99)).toBe(null);
    let mensaje = '';
    try {
      leerRespuestaConsultar(err(600), 11, 1, 99);
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain('Facturación Electrónica');
  });
});
