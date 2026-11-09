// Abre la base SQLite, aplica las migraciones y entrega el objeto de Drizzle.
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as esquema from './esquema';
import { MIGRACIONES } from './migraciones';

/** La base para Drizzle, con `$client` para llegar al better-sqlite3 de abajo. */
export type BaseDeDatos = BetterSQLite3Database<typeof esquema> & { $client: Database.Database };

let sqlite: Database.Database | null = null;
let db: BaseDeDatos | null = null;
let rutaActual = '';

export const VERSION_BASE = MIGRACIONES.length;

/** Abre (o crea) la base en `ruta`. Con ':memory:' queda en memoria (pruebas). */
export function abrirBaseDeDatos(ruta: string): BaseDeDatos {
  if (db) return db;
  const conexion = new Database(ruta);
  try {
    conexion.pragma('journal_mode = WAL');
    conexion.pragma('foreign_keys = ON');
    aplicarMigraciones(conexion);
  } catch (error) {
    // Si algo falla al abrir, cerramos el archivo: si no, queda "tomado"
    // y Windows no deja moverlo, borrarlo ni volver a abrirlo bien.
    conexion.close();
    throw error;
  }
  sqlite = conexion;
  rutaActual = ruta;
  db = drizzle(conexion, { schema: esquema });
  return db;
}

function aplicarMigraciones(conexion: Database.Database): void {
  const actual = Number(conexion.pragma('user_version', { simple: true }));
  if (actual > MIGRACIONES.length) {
    throw new Error(
      `La base de datos es de una versión más nueva del sistema (${actual}). Actualizá el programa.`,
    );
  }
  MIGRACIONES.slice(actual).forEach((migracion, i) => {
    const version = actual + i + 1;
    // Cada paso va en una transacción: se aplica entero o no se aplica nada.
    conexion.transaction(() => {
      conexion.exec(migracion.sql);
      conexion.pragma(`user_version = ${version}`);
    })();
    console.log(`Migración ${version} aplicada: ${migracion.nombre}`);
  });
}

export function obtenerDb(): BaseDeDatos {
  if (!db) throw new Error('La base de datos no está abierta.');
  return db;
}

export function rutaBaseDeDatos(): string {
  return rutaActual;
}

export function cerrarBaseDeDatos(): void {
  sqlite?.close();
  sqlite = null;
  db = null;
  rutaActual = '';
}
