// Facturar un pedido ya cobrado con ARCA. ARCA se usa a través de un "autorizador"
// (en el programa es ServicioArca; en las pruebas, uno falso), así esto se prueba sin internet.
//
// Reglas que importan:
// - El pedido se cobra SIEMPRE, con o sin factura. Si ARCA falla, el cobro queda firme y la
//   factura queda "pendiente" con el motivo, para reintentar.
// - Una factura autorizada no se borra ni se edita (es un documento fiscal).
// - Un pedido no puede tener dos facturas: mientras se está facturando, se bloquea el segundo intento.
import { and, eq, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { BaseDeDatos } from '../db/conexion';
import { comprobantes, facturasPendientes } from '../db/esquema';
import { notaDeCreditoDe, tipoDeFactura } from '../arca/servicio';
import { ErrorDeArca } from '../arca/wsaa';
import type { ComprobanteAutorizado, DatosComprobante } from '../arca/tipos';
import type { ComprobanteResumen, EstadoArca, PedidoDetalle } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { fechaLocal } from './fechas';
import { anularPedido, obtenerPedido } from './pedidos';

export interface Receptor {
  docTipo: number;
  docNro: string;
  /** Condición frente al IVA del cliente (1 RI, 4 exento, 5 consumidor final, 6 monotributo). */
  condicionIva: number;
}

export const CONSUMIDOR_FINAL: Receptor = { docTipo: 99, docNro: '0', condicionIva: 5 };

export interface Autorizador {
  config: Pick<EstadoArca, 'activa' | 'ambiente' | 'cuit' | 'puntoVenta' | 'condicionIva'>;
  autorizar(datos: DatosComprobante): Promise<ComprobanteAutorizado>;
}

const ahoraSql = sql`(datetime('now', 'localtime'))`;
/** Pedidos que se están facturando en este momento (evita facturar dos veces con un doble clic). */
const enCurso = new Set<number>();

function resumenDe(pedido: PedidoDetalle | undefined): ComprobanteResumen | null {
  return pedido?.comprobante ?? null;
}

export function facturarPedido(
  db: BaseDeDatos,
  autorizador: Autorizador,
  pedidoId: number,
  receptor: Receptor | null,
  usuarioId: number | null,
  ahora: Date = new Date(),
): Promise<ComprobanteResumen> {
  return (async () => {
    const config = autorizador.config;
    if (!config.activa) throw new ErrorDeUsuario('La facturación con ARCA no está activada. Se enciende en Ajustes.');
    const pedido = obtenerPedido(db, pedidoId);
    if (pedido.estado === 'anulado') throw new ErrorDeUsuario(`El pedido #${pedido.numero} está anulado.`);
    if (!pedido.cobrado) throw new ErrorDeUsuario(`El pedido #${pedido.numero} todavía no está cobrado. Cobralo y después facturalo.`);
    if (pedido.comprobante) throw new ErrorDeUsuario(`El pedido #${pedido.numero} ya tiene la ${pedido.comprobante.nombre} ${pedido.comprobante.numeroCompleto}.`);
    if (enCurso.has(pedidoId)) throw new ErrorDeUsuario(`El pedido #${pedido.numero} ya se está facturando. Esperá un momento.`);

    // Si no se indica cliente, se usa el del intento anterior (reintento) o consumidor final.
    const anterior = db.select().from(facturasPendientes).where(eq(facturasPendientes.pedidoId, pedidoId)).get();
    const cliente: Receptor =
      receptor ?? (anterior ? { docTipo: anterior.docTipo, docNro: anterior.docNro, condicionIva: anterior.condicionIvaReceptor } : CONSUMIDOR_FINAL);

    const datos: DatosComprobante = {
      tipo: tipoDeFactura(config, cliente.condicionIva),
      concepto: 1,
      docTipo: cliente.docTipo,
      docNro: cliente.docNro,
      condicionIvaReceptor: cliente.condicionIva,
      fecha: fechaLocal(ahora),
      totalCentavos: pedido.totalCentavos,
    };

    enCurso.add(pedidoId);
    try {
      let autorizado: ComprobanteAutorizado;
      try {
        autorizado = await autorizador.autorizar(datos);
      } catch (e) {
        const motivo = e instanceof ErrorDeArca || e instanceof Error ? e.message : 'Error desconocido.';
        db.insert(facturasPendientes)
          .values({ pedidoId, docTipo: cliente.docTipo, docNro: cliente.docNro, condicionIvaReceptor: cliente.condicionIva, ultimoError: motivo })
          .onConflictDoUpdate({
            target: facturasPendientes.pedidoId,
            set: {
              docTipo: cliente.docTipo,
              docNro: cliente.docNro,
              condicionIvaReceptor: cliente.condicionIva,
              ultimoError: motivo,
              intentos: sql`${facturasPendientes.intentos} + 1`,
              actualizadoEn: ahoraSql,
            },
          })
          .run();
        throw new ErrorDeUsuario(`El pedido #${pedido.numero} está cobrado, pero no se pudo facturar: ${motivo} Queda pendiente para reintentar.`);
      }

      db.transaction((tx) => {
        tx.insert(comprobantes)
          .values({
            pedidoId,
            tipo: autorizado.tipo,
            puntoVenta: autorizado.puntoVenta,
            numero: autorizado.numero,
            fecha: datos.fecha,
            totalCentavos: datos.totalCentavos,
            docTipo: datos.docTipo,
            docNro: datos.docNro,
            condicionIvaReceptor: datos.condicionIvaReceptor,
            cae: autorizado.cae,
            vencimientoCae: autorizado.vencimientoCae,
            ambiente: config.ambiente,
            cuitEmisor: config.cuit,
            usuarioId,
          })
          .run();
        tx.delete(facturasPendientes).where(eq(facturasPendientes.pedidoId, pedidoId)).run();
      });
      const resumen = resumenDe(obtenerPedido(db, pedidoId));
      if (!resumen) throw new ErrorDeUsuario('La factura se emitió pero no se pudo guardar. Avisale a quien te instaló el sistema.');
      return resumen;
    } finally {
      enCurso.delete(pedidoId);
    }
  })();
}

/** "No quiero facturar este pedido": saca el pendiente (el pedido sigue cobrado). */
export function descartarPendiente(db: BaseDeDatos, pedidoId: number): void {
  db.delete(facturasPendientes).where(eq(facturasPendientes.pedidoId, pedidoId)).run();
}

/** Cuántos pedidos quedaron sin facturar por un error de ARCA. */
export function contarPendientes(db: BaseDeDatos): number {
  return db.select().from(facturasPendientes).all().length;
}

/** Facturas (no notas de crédito) de un pedido. */
export function facturasDe(db: BaseDeDatos, pedidoId: number) {
  return db
    .select()
    .from(comprobantes)
    .where(and(eq(comprobantes.pedidoId, pedidoId), isNull(comprobantes.asociadoId)))
    .all();
}

/**
 * Anula un pedido. Si no tenía factura, se anula directo. Si la tenía, primero se pide
 * a ARCA la nota de crédito (misma letra, mismo importe, asociada a la factura) y
 * recién cuando ARCA la autoriza se anula el pedido, todo junto. Si ARCA falla, el
 * pedido queda como estaba y se puede probar de nuevo.
 */
export async function anularConNotaDeCredito(
  db: BaseDeDatos,
  autorizador: Autorizador,
  pedidoId: number,
  motivo: string,
  usuarioId: number | null,
  ahora: Date = new Date(),
): Promise<ComprobanteResumen | null> {
  const pedido = obtenerPedido(db, pedidoId);
  const factura = pedido.comprobante;
  if (!factura) {
    anularPedido(db, pedidoId, motivo, usuarioId);
    return null;
  }
  if (pedido.estado === 'anulado') throw new ErrorDeUsuario(`El pedido #${pedido.numero} ya estaba anulado.`);
  const config = autorizador.config;
  const nombre = `${factura.nombre} ${factura.numeroCompleto}`;
  if (!config.activa) {
    throw new ErrorDeUsuario(`Para anular el pedido #${pedido.numero} hay que emitir una nota de crédito de la ${nombre}. Activá la facturación en Ajustes.`);
  }
  // La nota de crédito tiene que salir por el mismo CUIT, punto de venta y ambiente que la factura.
  if (config.ambiente !== factura.ambiente || config.cuit !== factura.cuitEmisor || config.puntoVenta !== factura.puntoVenta) {
    const donde = factura.ambiente === 'homologacion' ? 'pruebas (homologación)' : 'producción';
    throw new ErrorDeUsuario(
      `La ${nombre} se emitió en ${donde}, con el CUIT ${factura.cuitEmisor} y el punto de venta ${factura.puntoVenta}. La nota de crédito tiene que salir con los mismos datos: revisá Ajustes → ARCA.`,
    );
  }
  if (enCurso.has(pedidoId)) throw new ErrorDeUsuario(`El pedido #${pedido.numero} se está procesando. Esperá un momento.`);

  const fila = db.select().from(comprobantes).where(eq(comprobantes.id, factura.id)).get();
  if (!fila) throw new ErrorDeUsuario('No se encontró la factura de este pedido.');
  const datos: DatosComprobante = {
    tipo: notaDeCreditoDe(fila.tipo),
    concepto: 1,
    docTipo: fila.docTipo,
    docNro: fila.docNro,
    condicionIvaReceptor: fila.condicionIvaReceptor,
    fecha: fechaLocal(ahora),
    totalCentavos: fila.totalCentavos,
    asociado: { tipo: fila.tipo, puntoVenta: fila.puntoVenta, numero: fila.numero },
  };

  enCurso.add(pedidoId);
  try {
    let autorizado: ComprobanteAutorizado;
    try {
      autorizado = await autorizador.autorizar(datos);
    } catch (e) {
      const motivoError = e instanceof Error ? e.message : 'Error desconocido.';
      throw new ErrorDeUsuario(`No se pudo emitir la nota de crédito de la ${nombre}: ${motivoError} El pedido NO se anuló; probá de nuevo.`);
    }
    db.transaction((tx) => {
      tx.insert(comprobantes)
        .values({
          pedidoId,
          tipo: autorizado.tipo,
          puntoVenta: autorizado.puntoVenta,
          numero: autorizado.numero,
          fecha: datos.fecha,
          totalCentavos: datos.totalCentavos,
          docTipo: datos.docTipo,
          docNro: datos.docNro,
          condicionIvaReceptor: datos.condicionIvaReceptor,
          cae: autorizado.cae,
          vencimientoCae: autorizado.vencimientoCae,
          ambiente: config.ambiente,
          cuitEmisor: config.cuit,
          asociadoId: fila.id,
          usuarioId,
        })
        .run();
      anularPedido(db, pedidoId, motivo, usuarioId, true);
    });
    return obtenerPedido(db, pedidoId).notaDeCredito;
  } finally {
    enCurso.delete(pedidoId);
  }
}
