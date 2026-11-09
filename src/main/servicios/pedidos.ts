// Guardar un pedido cobrado. La ventana manda QUÉ se pidió (ids, cantidades,
// pagos); los precios los vuelve a calcular el main con el menú de la base.
// Nunca confiamos en un precio que venga de la ventana.
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { pagos, pedidoItemAgregados, pedidoItems, pedidos } from '../db/esquema';
import type { esquemaEstado, esquemaPagos, esquemaPedido } from '@compartido/esquemas';
import { armarLinea, type Linea } from '@compartido/precios';
import { pesos } from '@compartido/dinero';
import {
  NOMBRE_MEDIO,
  type PedidoCreado,
  type PedidoDetalle,
  type ResumenDelDia,
} from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { obtenerMenu } from './menu';
import { fechaLocal, horaLocal } from './fechas';

type PedidoValidado = z.output<typeof esquemaPedido>;
type PagosValidados = z.output<typeof esquemaPagos>;
type Tx = Parameters<Parameters<BaseDeDatos['transaction']>[0]>[0];

const ahoraSql = sql`(datetime('now', 'localtime'))`;

/**
 * Revisa que los pagos sumen justo el total y calcula el vuelto.
 * Solo el efectivo puede recibir de más (el vuelto sale de ahí).
 */
function calcularPagos(lista: PagosValidados, totalCentavos: number) {
  const suma = lista.reduce((s, p) => s + p.montoCentavos, 0);
  if (suma !== totalCentavos) {
    throw new ErrorDeUsuario(`Los pagos suman ${pesos(suma)} y el total es ${pesos(totalCentavos)}.`);
  }
  return lista.map((p) => {
    const recibidoCentavos = p.recibidoCentavos ?? p.montoCentavos;
    if (p.medio !== 'efectivo' && recibidoCentavos !== p.montoCentavos) {
      throw new ErrorDeUsuario(`Con ${NOMBRE_MEDIO[p.medio].toLowerCase()} no hay vuelto: se cobra el monto justo.`);
    }
    if (recibidoCentavos < p.montoCentavos) {
      throw new ErrorDeUsuario(`Con ${pesos(recibidoCentavos)} en efectivo no alcanza para ${pesos(p.montoCentavos)}.`);
    }
    return { ...p, recibidoCentavos, vueltoCentavos: recibidoCentavos - p.montoCentavos };
  });
}

function guardarPagos(tx: Tx, pedidoId: number, lista: ReturnType<typeof calcularPagos>): void {
  for (const p of lista) {
    tx.insert(pagos)
      .values({
        pedidoId,
        medio: p.medio,
        montoCentavos: p.montoCentavos,
        recibidoCentavos: p.recibidoCentavos,
        vueltoCentavos: p.vueltoCentavos,
      })
      .run();
  }
}

export function crearPedido(db: BaseDeDatos, datos: PedidoValidado, ahora: Date = new Date()): PedidoCreado {
  return db.transaction((tx) => {
    // 1) Volver a armar cada renglón con los precios de la base.
    const menu = obtenerMenu(tx);
    const categoriasActivas = new Set(menu.categorias.filter((c) => c.activa).map((c) => c.id));
    const lineas: (Linea & { nota: string; cantidad: number })[] = datos.items.map((item) => {
      const r = armarLinea(menu, item);
      if (!r.ok) throw new ErrorDeUsuario(r.error);
      if (!r.valor.producto.disponible) {
        throw new ErrorDeUsuario(`"${r.valor.producto.nombre}" está agotado. Sacalo del pedido.`);
      }
      if (!categoriasActivas.has(r.valor.producto.categoriaId)) {
        throw new ErrorDeUsuario(`"${r.valor.producto.nombre}" está en una categoría oculta.`);
      }
      return { ...r.valor, nota: item.nota, cantidad: item.cantidad };
    });

    // 2) Totales.
    const subtotalCentavos = lineas.reduce((s, l) => s + l.totalCentavos, 0);
    const envioCentavos = datos.tipo === 'delivery' ? datos.envioCentavos : 0;
    const totalCentavos = subtotalCentavos + envioCentavos;
    if (totalCentavos !== datos.totalEsperadoCentavos) {
      throw new ErrorDeUsuario(
        `El total cambió (ahora es ${pesos(totalCentavos)}): alguien modificó precios del menú mientras armabas el pedido. Revisalo y cobrá de nuevo.`,
      );
    }

    // 3) Pagos: sin pagos = "cobrar después". Si hay, tienen que cerrar justo.
    const cobrado = datos.pagos.length > 0 || totalCentavos === 0;
    const pagosCalculados = datos.pagos.length > 0 ? calcularPagos(datos.pagos, totalCentavos) : [];

    // 4) Número del día y guardado (todo dentro de la misma transacción).
    const fecha = fechaLocal(ahora);
    const { siguiente } = tx
      .select({ siguiente: sql<number>`coalesce(max(${pedidos.numero}), 0) + 1` })
      .from(pedidos)
      .where(eq(pedidos.fecha, fecha))
      .get()!;
    const numero = Number(siguiente);
    const pedidoId = tx
      .insert(pedidos)
      .values({
        numero,
        fecha,
        hora: horaLocal(ahora),
        tipo: datos.tipo,
        mesa: datos.tipo === 'mesa' ? datos.mesa : '',
        clienteNombre: datos.clienteNombre,
        clienteTelefono: datos.clienteTelefono,
        clienteDireccion: datos.tipo === 'delivery' ? datos.clienteDireccion : '',
        nota: datos.nota,
        subtotalCentavos,
        envioCentavos,
        totalCentavos,
        cobrado,
      })
      .returning({ id: pedidos.id })
      .get().id;

    lineas.forEach((l, orden) => {
      const itemId = tx
        .insert(pedidoItems)
        .values({
          pedidoId,
          productoId: l.producto.id,
          varianteId: l.variante?.id ?? null,
          nombre: l.producto.nombre,
          varianteNombre: l.variante?.nombre ?? '',
          cantidad: l.cantidad,
          unitarioCentavos: l.unitarioCentavos,
          agregadosCentavos: l.agregadosCentavos,
          totalCentavos: l.totalCentavos,
          nota: l.nota,
          vaACocina: l.producto.vaACocina,
          orden,
        })
        .returning({ id: pedidoItems.id })
        .get().id;
      for (const a of l.agregados) {
        tx.insert(pedidoItemAgregados)
          .values({
            itemId,
            opcionId: a.opcion.id,
            grupoNombre: a.grupo.nombre,
            nombre: a.opcion.nombre,
            precioCentavos: a.opcion.precioCentavos,
          })
          .run();
      }
    });

    guardarPagos(tx, pedidoId, pagosCalculados);

    return {
      id: pedidoId,
      numero,
      totalCentavos,
      vueltoCentavos: pagosCalculados.reduce((s, p) => s + p.vueltoCentavos, 0),
      cobrado,
    };
  });
}

/** Cuántos pedidos y cuánta plata va el día (sin contar los anulados). */
export function resumenDelDia(db: BaseDeDatos, ahora: Date = new Date()): ResumenDelDia {
  const fecha = fechaLocal(ahora);
  const fila = db
    .select({
      pedidos: sql<number>`count(*)`,
      totalCentavos: sql<number>`coalesce(sum(${pedidos.totalCentavos}), 0)`,
    })
    .from(pedidos)
    .where(and(eq(pedidos.fecha, fecha), ne(pedidos.estado, 'anulado')))
    .get();
  return { fecha, pedidos: Number(fila?.pedidos ?? 0), totalCentavos: Number(fila?.totalCentavos ?? 0) };
}

// ───────────────────────── Pantalla Pedidos ─────────────────────────

/** Todos los pedidos de un día (o algunos por id), con renglones, agregados y pagos. */
export function listarPedidos(db: Pick<BaseDeDatos, 'select'>, filtro: { fecha: string } | { ids: number[] }): PedidoDetalle[] {
  const filas = db
    .select()
    .from(pedidos)
    .where('fecha' in filtro ? eq(pedidos.fecha, filtro.fecha) : inArray(pedidos.id, filtro.ids.length ? filtro.ids : [-1]))
    .orderBy(asc(pedidos.numero))
    .all();
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.id);
  const items = db.select().from(pedidoItems).where(inArray(pedidoItems.pedidoId, ids)).orderBy(asc(pedidoItems.orden)).all();
  const agregados = items.length
    ? db
        .select()
        .from(pedidoItemAgregados)
        .where(inArray(pedidoItemAgregados.itemId, items.map((i) => i.id)))
        .orderBy(asc(pedidoItemAgregados.id))
        .all()
    : [];
  const listaPagos = db.select().from(pagos).where(inArray(pagos.pedidoId, ids)).orderBy(asc(pagos.id)).all();

  return filas.map((f) => ({
    id: f.id,
    numero: f.numero,
    fecha: f.fecha,
    hora: f.hora,
    tipo: f.tipo,
    mesa: f.mesa,
    clienteNombre: f.clienteNombre,
    clienteTelefono: f.clienteTelefono,
    clienteDireccion: f.clienteDireccion,
    nota: f.nota,
    subtotalCentavos: f.subtotalCentavos,
    envioCentavos: f.envioCentavos,
    totalCentavos: f.totalCentavos,
    estado: f.estado,
    cobrado: f.cobrado,
    motivoAnulacion: f.motivoAnulacion,
    items: items
      .filter((i) => i.pedidoId === f.id)
      .map((i) => ({
        id: i.id,
        nombre: i.nombre,
        varianteNombre: i.varianteNombre,
        cantidad: i.cantidad,
        unitarioCentavos: i.unitarioCentavos,
        agregadosCentavos: i.agregadosCentavos,
        totalCentavos: i.totalCentavos,
        nota: i.nota,
        vaACocina: i.vaACocina,
        agregados: agregados
          .filter((a) => a.itemId === i.id)
          .map((a) => ({ grupoNombre: a.grupoNombre, nombre: a.nombre, precioCentavos: a.precioCentavos })),
      })),
    pagos: listaPagos
      .filter((p) => p.pedidoId === f.id)
      .map((p) => ({
        medio: p.medio,
        montoCentavos: p.montoCentavos,
        recibidoCentavos: p.recibidoCentavos,
        vueltoCentavos: p.vueltoCentavos,
      })),
  }));
}

export function obtenerPedido(db: Pick<BaseDeDatos, 'select'>, id: number): PedidoDetalle {
  const [pedido] = listarPedidos(db, { ids: [id] });
  if (!pedido) throw new ErrorDeUsuario('Ese pedido no existe.');
  return pedido;
}

/**
 * Mueve un pedido entre pendiente → en preparación → listo → entregado.
 * Se puede volver un paso atrás (por si se tocó sin querer), pero un pedido
 * no se entrega sin estar cobrado y uno anulado ya no se mueve.
 */
export function cambiarEstado(db: BaseDeDatos, id: number, estado: z.output<typeof esquemaEstado>): void {
  db.transaction((tx) => {
    const pedido = obtenerPedido(tx, id);
    if (pedido.estado === 'anulado') throw new ErrorDeUsuario(`El pedido #${pedido.numero} está anulado.`);
    if (pedido.estado === estado) return;
    if (estado === 'entregado' && !pedido.cobrado) {
      throw new ErrorDeUsuario(`El pedido #${pedido.numero} todavía no está cobrado. Cobralo antes de entregarlo.`);
    }
    tx.update(pedidos).set({ estado, actualizadoEn: ahoraSql }).where(eq(pedidos.id, id)).run();
  });
}

/** Anular no borra: el pedido queda con su motivo y deja de sumar en el día. */
export function anularPedido(db: BaseDeDatos, id: number, motivo: string): void {
  db.transaction((tx) => {
    const pedido = obtenerPedido(tx, id);
    if (pedido.estado === 'anulado') throw new ErrorDeUsuario(`El pedido #${pedido.numero} ya estaba anulado.`);
    tx.update(pedidos)
      .set({ estado: 'anulado', motivoAnulacion: motivo, anuladoEn: ahoraSql, actualizadoEn: ahoraSql })
      .where(eq(pedidos.id, id))
      .run();
  });
}

/** Cobra un pedido que se había guardado para cobrar después. */
export function cobrarPedido(db: BaseDeDatos, id: number, lista: PagosValidados): PedidoCreado {
  return db.transaction((tx) => {
    const pedido = obtenerPedido(tx, id);
    if (pedido.estado === 'anulado') throw new ErrorDeUsuario(`El pedido #${pedido.numero} está anulado.`);
    if (pedido.cobrado) throw new ErrorDeUsuario(`El pedido #${pedido.numero} ya estaba cobrado.`);
    if (lista.length === 0) throw new ErrorDeUsuario('Elegí cómo paga.');
    const calculados = calcularPagos(lista, pedido.totalCentavos);
    guardarPagos(tx, id, calculados);
    tx.update(pedidos).set({ cobrado: true, actualizadoEn: ahoraSql }).where(eq(pedidos.id, id)).run();
    return {
      id,
      numero: pedido.numero,
      totalCentavos: pedido.totalCentavos,
      vueltoCentavos: calculados.reduce((s, p) => s + p.vueltoCentavos, 0),
      cobrado: true,
    };
  });
}

