// Copias de seguridad de la base de datos.
//
// Por qué importan: TODO el negocio (ventas, caja, clientes) vive en un solo
// archivo, caja.db. Si la compu se rompe o le entra un virus, sin copia se
// pierde todo. Por eso:
// - Copia automática una vez por día, al abrir el programa (se guardan 10).
// - Copia manual cuando el dueño quiera (por ejemplo, a un pendrive).
// - Restaurar: volver a una copia (antes se hace una copia de lo actual).
//
// Para copiar usamos `.backup()` de better-sqlite3 y NO copiamos el archivo
// a mano: con la base abierta (y en modo WAL) una copia "a mano" puede quedar
// a medias. `.backup()` copia página por página de forma segura.
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import type { BaseDeDatos } from '../db/conexion';
import { VERSION_BASE } from '../db/conexion';
import { ErrorDeUsuario } from './errores';
import { fechaLocal, horaLocal } from './fechas';

export const COPIAS_AUTOMATICAS_A_GUARDAR = 10;
const PREFIJO_AUTOMATICA = 'caja-automatica-';

export interface InfoCopia {
  ruta: string;
  nombre: string;
  /** 'AAAA-MM-DD HH:MM' de la última modificación del archivo */
  fecha: string;
  bytes: number;
}

export interface ResumenDeCopia {
  version: number;
  pedidos: number;
  productos: number;
  ultimoPedido: string | null;
}

const dosCifras = (n: number) => String(n).padStart(2, '0');
/** "caja-2026-11-10-2311.db" */
export function nombreDeCopia(ahora: Date = new Date(), prefijo = 'caja-'): string {
  return `${prefijo}${fechaLocal(ahora)}-${dosCifras(ahora.getHours())}${dosCifras(ahora.getMinutes())}.db`;
}

function info(ruta: string): InfoCopia {
  const datos = statSync(ruta);
  return {
    ruta,
    nombre: path.basename(ruta),
    fecha: `${fechaLocal(datos.mtime)} ${horaLocal(datos.mtime)}`,
    bytes: datos.size,
  };
}

/** Hace una copia completa y consistente de la base en `destino`. */
export async function hacerCopia(db: BaseDeDatos, destino: string): Promise<InfoCopia> {
  mkdirSync(path.dirname(destino), { recursive: true });
  await db.$client.backup(destino);
  return info(destino);
}

/** Las copias automáticas que hay en la carpeta, de la más nueva a la más vieja. */
export function copiasAutomaticas(carpeta: string): InfoCopia[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((n) => n.startsWith(PREFIJO_AUTOMATICA) && n.endsWith('.db'))
    .sort()
    .reverse()
    .map((n) => info(path.join(carpeta, n)));
}

/**
 * Si hoy todavía no hay copia automática, la hace. Después borra las más
 * viejas para que queden solo las últimas 10 (no llenar el disco).
 * Devuelve la copia nueva, o null si ya había una de hoy.
 */
export async function copiaAutomatica(db: BaseDeDatos, carpeta: string, ahora: Date = new Date()): Promise<InfoCopia | null> {
  const deHoy = `${PREFIJO_AUTOMATICA}${fechaLocal(ahora)}`;
  if (copiasAutomaticas(carpeta).some((c) => c.nombre.startsWith(deHoy))) return null;
  const nueva = await hacerCopia(db, path.join(carpeta, nombreDeCopia(ahora, PREFIJO_AUTOMATICA)));
  for (const vieja of copiasAutomaticas(carpeta).slice(COPIAS_AUTOMATICAS_A_GUARDAR)) rmSync(vieja.ruta, { force: true });
  return nueva;
}

/**
 * Abre la copia SOLO PARA LEER y revisa que de verdad sea una base de la Caja
 * (y no, por ejemplo, la del gimnasio o un archivo cualquiera).
 */
export function revisarCopia(ruta: string): ResumenDeCopia {
  if (!existsSync(ruta)) throw new ErrorDeUsuario('No se encontró el archivo.');
  let base: Database.Database | null = null;
  try {
    base = new Database(ruta, { readonly: true, fileMustExist: true });
    const version = Number(base.pragma('user_version', { simple: true }));
    const tablas = new Set(
      (base.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name),
    );
    const esDeLaCaja = ['pedidos', 'productos', 'categorias', 'configuracion'].every((t) => tablas.has(t));
    if (!esDeLaCaja || version < 1) throw new ErrorDeUsuario('Ese archivo no es una copia de la Caja.');
    if (version > VERSION_BASE) {
      throw new ErrorDeUsuario('Esa copia es de una versión más nueva del programa. Actualizá la Caja antes de restaurarla.');
    }
    const n = (consulta: string) => (base!.prepare(consulta).get() as { n: number | string | null }).n;
    return {
      version,
      pedidos: Number(n('SELECT count(*) AS n FROM pedidos')),
      productos: Number(n('SELECT count(*) AS n FROM productos WHERE activo = 1')),
      ultimoPedido: (n('SELECT max(fecha) AS n FROM pedidos') as string | null) ?? null,
    };
  } catch (error) {
    if (error instanceof ErrorDeUsuario) throw error;
    // better-sqlite3 tira "file is not a database" con archivos que no son SQLite
    throw new ErrorDeUsuario('Ese archivo no es una copia de la Caja (o está dañado).');
  } finally {
    base?.close();
  }
}

/**
 * Pone la copia en el lugar de la base actual. La base TIENE QUE ESTAR
 * CERRADA antes (en Windows un archivo abierto no se puede reemplazar).
 * Borra también los archivos -wal y -shm de la base vieja: si quedaran,
 * SQLite intentaría "mezclarlos" con la copia restaurada.
 */
export function reemplazarBase(copia: string, rutaBase: string): void {
  if (path.resolve(copia).toLowerCase() === path.resolve(rutaBase).toLowerCase()) {
    throw new ErrorDeUsuario('Ese es el archivo que la Caja está usando ahora: elegí una copia.');
  }
  for (const extra of ['-wal', '-shm']) rmSync(rutaBase + extra, { force: true });
  copyFileSync(copia, rutaBase);
}

export function descripcionDeCopia(r: ResumenDeCopia): string {
  const pedidos = r.pedidos === 1 ? '1 pedido' : `${r.pedidos.toLocaleString('es-AR')} pedidos`;
  return `${pedidos} y ${r.productos} productos${r.ultimoPedido ? `; último pedido del ${r.ultimoPedido.split('-').reverse().join('/')}` : ''}`;
}
