// Reportes: todo sale de los pedidos guardados, con SQL "de toda la vida"
// (GROUP BY, SUM, COUNT). Es el mismo SQL que podés probar en DB Browser,
// en la pestaña "Ejecutar SQL", cambiando los ? por fechas entre comillas.
//
// Reglas (iguales que en el resto del sistema):
// - Ventas = pedidos NO anulados, cobrados o "a cobrar" (son ventas igual).
// - Los anulados se informan aparte y no suman.
// - Las fechas son del pedido ('AAAA-MM-DD'), las dos puntas incluidas.
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import type { esquemaRango } from '@compartido/esquemas';
import { MEDIOS_DE_PAGO, TIPOS_PEDIDO, type MedioDePago, type Reporte, type TipoPedido } from '@compartido/tipos';

type Consultable = Pick<BaseDeDatos, '$client'>;
type Rango = z.output<typeof esquemaRango>;

const DIA_MS = 86_400_000;
const aFecha = (f: string) => new Date(`${f}T12:00:00`); // al mediodía: sin líos de horario de verano
const dosCifras = (n: number) => String(n).padStart(2, '0');
const aTexto = (d: Date) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;

export function sumarDias(fecha: string, dias: number): string {
  const d = aFecha(fecha);
  d.setDate(d.getDate() + dias);
  return aTexto(d);
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / DIA_MS) + 1;
}

const NO_ANULADO = `p.fecha BETWEEN ? AND ? AND p.estado <> 'anulado'`;

export function obtenerReporte(db: Consultable, { desde, hasta }: Rango): Reporte {
  const c = db.$client;
  const r = [desde, hasta];
  const fila = <T>(consulta: string, ...params: unknown[]) => c.prepare(consulta).get(...params) as T;
  const filas = <T>(consulta: string, ...params: unknown[]) => c.prepare(consulta).all(...params) as T[];

  // 1) Totales
  const totales = fila<{ pedidos: number; ventas: number; envio: number }>(
    `SELECT count(*) AS pedidos, coalesce(sum(p.total_centavos), 0) AS ventas, coalesce(sum(p.envio_centavos), 0) AS envio
     FROM pedidos p WHERE ${NO_ANULADO}`,
    ...r,
  );
  const anulados = fila<{ cantidad: number; total: number }>(
    `SELECT count(*) AS cantidad, coalesce(sum(p.total_centavos), 0) AS total
     FROM pedidos p WHERE p.fecha BETWEEN ? AND ? AND p.estado = 'anulado'`,
    ...r,
  );
  const sinCobrar = fila<{ cantidad: number; total: number }>(
    `SELECT count(*) AS cantidad, coalesce(sum(p.total_centavos), 0) AS total
     FROM pedidos p WHERE ${NO_ANULADO} AND p.cobrado = 0`,
    ...r,
  );

  // 2) El período anterior, del mismo largo (ej.: estos 7 días contra los 7 de antes)
  const dias = diasEntre(desde, hasta);
  const antHasta = sumarDias(desde, -1);
  const antDesde = sumarDias(desde, -dias);
  const anterior = fila<{ pedidos: number; ventas: number }>(
    `SELECT count(*) AS pedidos, coalesce(sum(p.total_centavos), 0) AS ventas FROM pedidos p WHERE ${NO_ANULADO}`,
    antDesde,
    antHasta,
  );

  // 3) Por día: completamos los días sin ventas con 0 (si no, el gráfico "salta" días)
  const porFecha = new Map(
    filas<{ fecha: string; pedidos: number; ventas: number }>(
      `SELECT p.fecha, count(*) AS pedidos, sum(p.total_centavos) AS ventas
       FROM pedidos p WHERE ${NO_ANULADO} GROUP BY p.fecha`,
      ...r,
    ).map((f) => [f.fecha, f]),
  );
  const porDia = Array.from({ length: dias }, (_, i) => {
    const fecha = sumarDias(desde, i);
    const f = porFecha.get(fecha);
    return { fecha, pedidos: f?.pedidos ?? 0, ventasCentavos: f?.ventas ?? 0 };
  });

  // 4) Por hora del día (0 a 23)
  const porHoraMapa = new Map(
    filas<{ hora: number; pedidos: number; ventas: number }>(
      `SELECT CAST(substr(p.hora, 1, 2) AS INTEGER) AS hora, count(*) AS pedidos, sum(p.total_centavos) AS ventas
       FROM pedidos p WHERE ${NO_ANULADO} GROUP BY 1`,
      ...r,
    ).map((f) => [f.hora, f]),
  );
  const porHora = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    pedidos: porHoraMapa.get(hora)?.pedidos ?? 0,
    ventasCentavos: porHoraMapa.get(hora)?.ventas ?? 0,
  }));

  // 5) Por medio de pago (lo cobrado; los "a cobrar" todavía no tienen pagos)
  const medios = new Map(
    filas<{ medio: MedioDePago; cobros: number; monto: number }>(
      `SELECT pg.medio, count(*) AS cobros, sum(pg.monto_centavos) AS monto
       FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
       WHERE ${NO_ANULADO} GROUP BY pg.medio`,
      ...r,
    ).map((f) => [f.medio, f]),
  );
  const porMedio = MEDIOS_DE_PAGO.map((medio) => ({
    medio,
    cobros: medios.get(medio)?.cobros ?? 0,
    montoCentavos: medios.get(medio)?.monto ?? 0,
  }));

  // 6) Por tipo de pedido
  const tipos = new Map(
    filas<{ tipo: TipoPedido; pedidos: number; ventas: number }>(
      `SELECT p.tipo, count(*) AS pedidos, sum(p.total_centavos) AS ventas
       FROM pedidos p WHERE ${NO_ANULADO} GROUP BY p.tipo`,
      ...r,
    ).map((f) => [f.tipo, f]),
  );
  const porTipo = TIPOS_PEDIDO.map((tipo) => ({
    tipo,
    pedidos: tipos.get(tipo)?.pedidos ?? 0,
    ventasCentavos: tipos.get(tipo)?.ventas ?? 0,
  }));

  // 7) Por usuario (quién tomó el pedido)
  const porUsuario = filas<{ usuarioId: number | null; nombre: string; pedidos: number; ventasCentavos: number }>(
    `SELECT p.usuario_id AS usuarioId, coalesce(u.nombre, 'Sin usuario') AS nombre,
            count(*) AS pedidos, sum(p.total_centavos) AS ventasCentavos
     FROM pedidos p LEFT JOIN usuarios u ON u.id = p.usuario_id
     WHERE ${NO_ANULADO} GROUP BY p.usuario_id ORDER BY ventasCentavos DESC`,
    ...r,
  );

  // 8) Productos: cantidad y plata (incluye agregados, no el envío).
  //    El nombre es el ACTUAL del producto (si lo renombraron, se agrupa igual).
  const productos = filas<{ productoId: number; nombre: string; categoria: string; cantidad: number; ventasCentavos: number }>(
    `SELECT i.producto_id AS productoId, coalesce(pr.nombre, max(i.nombre)) AS nombre, coalesce(cat.nombre, '') AS categoria,
            sum(i.cantidad) AS cantidad, sum(i.total_centavos) AS ventasCentavos
     FROM pedido_items i
     JOIN pedidos p ON p.id = i.pedido_id
     LEFT JOIN productos pr ON pr.id = i.producto_id
     LEFT JOIN categorias cat ON cat.id = pr.categoria_id
     WHERE ${NO_ANULADO}
     GROUP BY i.producto_id
     ORDER BY ventasCentavos DESC, cantidad DESC`,
    ...r,
  );

  // 9) Clientes: cuántos pidieron, y cuántos pidieron por PRIMERA vez en el período
  const clientes = fila<{ conPedidos: number; nuevos: number }>(
    `SELECT count(*) AS conPedidos, coalesce(sum(primero >= ?), 0) AS nuevos FROM (
       SELECT p.cliente_id,
              (SELECT min(p2.fecha) FROM pedidos p2 WHERE p2.cliente_id = p.cliente_id AND p2.estado <> 'anulado') AS primero
       FROM pedidos p WHERE ${NO_ANULADO} AND p.cliente_id IS NOT NULL GROUP BY p.cliente_id
     )`,
    desde,
    ...r,
  );

  return {
    desde,
    hasta,
    dias,
    pedidos: totales.pedidos,
    ventasCentavos: totales.ventas,
    // Redondeado a pesos enteros: "$ 27.417" se lee mejor que "$ 27.416,67".
    ticketPromedioCentavos: totales.pedidos ? Math.round(totales.ventas / totales.pedidos / 100) * 100 : 0,
    envioCentavos: totales.envio,
    anulados: { cantidad: anulados.cantidad, totalCentavos: anulados.total },
    sinCobrar: { cantidad: sinCobrar.cantidad, totalCentavos: sinCobrar.total },
    anterior: { desde: antDesde, hasta: antHasta, pedidos: anterior.pedidos, ventasCentavos: anterior.ventas },
    porDia,
    porHora,
    porMedio,
    porTipo,
    porUsuario,
    productos,
    clientes,
  };
}
