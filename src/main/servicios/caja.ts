// La caja (un "turno"): se abre con un fondo de cambio, se cobran pedidos,
// se registran ingresos, retiros y gastos, y al cerrar se cuenta el efectivo
// para compararlo con lo que el sistema dice que debería haber (arqueo).
import { and, asc, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { cajas, movimientosCaja, pagos, pedidos, usuarios } from '../db/esquema';
import type { esquemaCerrarCaja, esquemaMovimiento } from '@compartido/esquemas';
import { MEDIOS_DE_PAGO, type Caja, type ResumenCaja, type Usuario } from '@compartido/tipos';
import { pesos } from '@compartido/dinero';
import { ErrorDeUsuario } from './errores';
import { momentoLocal } from './fechas';

type Lector = Pick<BaseDeDatos, 'select'>;

const quienAbrio = alias(usuarios, 'quien_abrio');
const quienCerro = alias(usuarios, 'quien_cerro');

function leerCajas(db: Lector, condicion: ReturnType<typeof eq> | undefined, limite = 1): Caja[] {
  return db
    .select({
      id: cajas.id,
      abiertaEn: cajas.abiertaEn,
      abiertaPor: quienAbrio.nombre,
      fondoCentavos: cajas.fondoCentavos,
      cerradaEn: cajas.cerradaEn,
      cerradaPor: quienCerro.nombre,
      esperadoCentavos: cajas.esperadoCentavos,
      contadoCentavos: cajas.contadoCentavos,
      diferenciaCentavos: cajas.diferenciaCentavos,
      nota: cajas.nota,
    })
    .from(cajas)
    .innerJoin(quienAbrio, eq(quienAbrio.id, cajas.abiertaPor))
    .leftJoin(quienCerro, eq(quienCerro.id, cajas.cerradaPor))
    .where(condicion)
    .orderBy(desc(cajas.id))
    .limit(limite)
    .all();
}

export function cajaAbierta(db: Lector): Caja | null {
  return leerCajas(db, isNull(cajas.cerradaEn))[0] ?? null;
}

export function historialDeCajas(db: Lector, limite = 30): Caja[] {
  return leerCajas(db, sql`${cajas.cerradaEn} IS NOT NULL`, limite);
}

export function abrirCaja(db: BaseDeDatos, fondoCentavos: number, usuario: Usuario, ahora: Date = new Date()): Caja {
  return db.transaction((tx) => {
    if (cajaAbierta(tx)) throw new ErrorDeUsuario('Ya hay una caja abierta.');
    tx.insert(cajas).values({ abiertaEn: momentoLocal(ahora), abiertaPor: usuario.id, fondoCentavos }).run();
    return cajaAbierta(tx)!;
  });
}

export function registrarMovimiento(
  db: BaseDeDatos,
  datos: z.output<typeof esquemaMovimiento>,
  usuario: Usuario,
  ahora: Date = new Date(),
): void {
  // Primero el permiso, después el estado: así el cajero recibe el motivo real.
  if (datos.tipo === 'retiro' && usuario.rol !== 'dueno') throw new ErrorDeUsuario('Los retiros los hace solo el dueño.');
  db.transaction((tx) => {
    const caja = cajaAbierta(tx);
    if (!caja) throw new ErrorDeUsuario('No hay una caja abierta.');
    if (datos.tipo !== 'ingreso') {
      // No se puede sacar más efectivo del que hay.
      const disponible = resumenDeCaja(tx, caja.id).efectivoEsperadoCentavos;
      if (datos.montoCentavos > disponible) {
        throw new ErrorDeUsuario(`En la caja debería haber ${pesos(disponible)} en efectivo: no alcanza para sacar ${pesos(datos.montoCentavos)}.`);
      }
    }
    tx.insert(movimientosCaja)
      .values({ cajaId: caja.id, tipo: datos.tipo, montoCentavos: datos.montoCentavos, motivo: datos.motivo, usuarioId: usuario.id, creadoEn: momentoLocal(ahora) })
      .run();
  });
}

/** Todo lo que pasó en una caja (abierta o cerrada). */
export function resumenDeCaja(db: Lector, cajaId: number): ResumenCaja {
  const caja = leerCajas(db, eq(cajas.id, cajaId))[0];
  if (!caja) throw new ErrorDeUsuario('Esa caja no existe.');

  // Cobros de esta caja, sin los de pedidos anulados (esa plata se devolvió).
  const cobros = db
    .select({ medio: pagos.medio, monto: pagos.montoCentavos, pedidoId: pagos.pedidoId })
    .from(pagos)
    .innerJoin(pedidos, eq(pedidos.id, pagos.pedidoId))
    .where(and(eq(pagos.cajaId, cajaId), ne(pedidos.estado, 'anulado')))
    .all();
  const anulados = db
    .select({ n: sql<number>`count(DISTINCT ${pedidos.id})` })
    .from(pagos)
    .innerJoin(pedidos, eq(pedidos.id, pagos.pedidoId))
    .where(and(eq(pagos.cajaId, cajaId), eq(pedidos.estado, 'anulado')))
    .get();

  const porMedio = Object.fromEntries(MEDIOS_DE_PAGO.map((m) => [m, { cobros: 0, montoCentavos: 0 }])) as ResumenCaja['porMedio'];
  for (const c of cobros) {
    porMedio[c.medio].cobros += 1;
    porMedio[c.medio].montoCentavos += c.monto;
  }

  const movimientos = db
    .select({
      id: movimientosCaja.id,
      tipo: movimientosCaja.tipo,
      montoCentavos: movimientosCaja.montoCentavos,
      motivo: movimientosCaja.motivo,
      usuario: usuarios.nombre,
      hora: sql<string>`substr(${movimientosCaja.creadoEn}, 12, 5)`,
    })
    .from(movimientosCaja)
    .innerJoin(usuarios, eq(usuarios.id, movimientosCaja.usuarioId))
    .where(eq(movimientosCaja.cajaId, cajaId))
    .orderBy(asc(movimientosCaja.id))
    .all();
  const suma = (tipo: string) => movimientos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.montoCentavos, 0);

  // Pedidos tomados desde que se abrió la caja que todavía no se cobraron.
  const desde = caja.abiertaEn.slice(0, 10);
  const sinCobrar = db
    .select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${pedidos.totalCentavos}), 0)` })
    .from(pedidos)
    .where(
      and(
        eq(pedidos.cobrado, false),
        ne(pedidos.estado, 'anulado'),
        gte(pedidos.fecha, desde),
        caja.cerradaEn ? sql`${pedidos.creadoEn} <= ${caja.cerradaEn}` : undefined,
      ),
    )
    .get();

  const ingresosCentavos = suma('ingreso');
  const retirosCentavos = suma('retiro');
  const gastosCentavos = suma('gasto');
  return {
    caja,
    porMedio,
    ventasCentavos: cobros.reduce((s, c) => s + c.monto, 0),
    pedidosCobrados: new Set(cobros.map((c) => c.pedidoId)).size,
    pedidosAnulados: Number(anulados?.n ?? 0),
    sinCobrar: { cantidad: Number(sinCobrar?.n ?? 0), totalCentavos: Number(sinCobrar?.total ?? 0) },
    movimientos,
    ingresosCentavos,
    retirosCentavos,
    gastosCentavos,
    efectivoEsperadoCentavos:
      caja.fondoCentavos + porMedio.efectivo.montoCentavos + ingresosCentavos - retirosCentavos - gastosCentavos,
  };
}

/** Cierra la caja: guarda lo esperado, lo contado y la diferencia (+ sobra, − falta). */
export function cerrarCaja(
  db: BaseDeDatos,
  datos: z.output<typeof esquemaCerrarCaja>,
  usuario: Usuario,
  ahora: Date = new Date(),
): ResumenCaja {
  return db.transaction((tx) => {
    const caja = cajaAbierta(tx);
    if (!caja) throw new ErrorDeUsuario('No hay una caja abierta.');
    const esperado = resumenDeCaja(tx, caja.id).efectivoEsperadoCentavos;
    tx.update(cajas)
      .set({
        cerradaEn: momentoLocal(ahora),
        cerradaPor: usuario.id,
        esperadoCentavos: esperado,
        contadoCentavos: datos.contadoCentavos,
        diferenciaCentavos: datos.contadoCentavos - esperado,
        nota: datos.nota,
      })
      .where(eq(cajas.id, caja.id))
      .run();
    return resumenDeCaja(tx, caja.id);
  });
}
