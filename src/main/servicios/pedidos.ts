// Guardar un pedido cobrado. La ventana manda QUÉ se pidió (ids, cantidades,
// pagos); los precios los vuelve a calcular el main con el menú de la base.
// Nunca confiamos en un precio que venga de la ventana.
import { and, eq, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { pagos, pedidoItemAgregados, pedidoItems, pedidos } from '../db/esquema';
import type { esquemaPedido } from '@compartido/esquemas';
import { armarLinea, type Linea } from '@compartido/precios';
import { pesos } from '@compartido/dinero';
import { NOMBRE_MEDIO, type PedidoCreado, type ResumenDelDia } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { obtenerMenu } from './menu';
import { fechaLocal, horaLocal } from './fechas';

type PedidoValidado = z.output<typeof esquemaPedido>;

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

    // 3) Pagos: tienen que sumar justo el total. El vuelto sale del efectivo.
    const sumaPagos = datos.pagos.reduce((s, p) => s + p.montoCentavos, 0);
    if (sumaPagos !== totalCentavos) {
      throw new ErrorDeUsuario(`Los pagos suman ${pesos(sumaPagos)} y el total es ${pesos(totalCentavos)}.`);
    }
    const pagosCalculados = datos.pagos.map((p) => {
      const recibidoCentavos = p.recibidoCentavos ?? p.montoCentavos;
      if (p.medio !== 'efectivo' && recibidoCentavos !== p.montoCentavos) {
        throw new ErrorDeUsuario(`Con ${NOMBRE_MEDIO[p.medio].toLowerCase()} no hay vuelto: se cobra el monto justo.`);
      }
      if (recibidoCentavos < p.montoCentavos) {
        throw new ErrorDeUsuario(
          `Con ${pesos(recibidoCentavos)} en efectivo no alcanza para ${pesos(p.montoCentavos)}.`,
        );
      }
      return { ...p, recibidoCentavos, vueltoCentavos: recibidoCentavos - p.montoCentavos };
    });

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

    for (const p of pagosCalculados) {
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

    return {
      id: pedidoId,
      numero,
      totalCentavos,
      vueltoCentavos: pagosCalculados.reduce((s, p) => s + p.vueltoCentavos, 0),
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
