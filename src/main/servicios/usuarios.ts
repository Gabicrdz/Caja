// Usuarios con PIN. El PIN NUNCA se guarda: se guarda el resultado de pasarlo
// por scrypt (una función "lenta a propósito") junto con una sal al azar.
// Para revisar un PIN se repite la cuenta y se comparan los resultados.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { usuarios } from '../db/esquema';
import type { esquemaUsuario } from '@compartido/esquemas';
import type { Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';

type UsuarioValidado = z.output<typeof esquemaUsuario>;

export function hashDePin(pin: string, sal: string = randomBytes(16).toString('hex')) {
  const hash = scryptSync(pin, sal, 32).toString('hex');
  return { hash, sal };
}

export function pinCorrecto(pin: string, hash: string, sal: string): boolean {
  const calculado = Buffer.from(hashDePin(pin, sal).hash, 'hex');
  const guardado = Buffer.from(hash, 'hex');
  // timingSafeEqual tarda lo mismo acierte o no (no da pistas por el tiempo).
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}

const columnas = { id: usuarios.id, nombre: usuarios.nombre, rol: usuarios.rol };

export function listarUsuarios(db: Pick<BaseDeDatos, 'select'>): Usuario[] {
  return db.select(columnas).from(usuarios).where(eq(usuarios.activo, true)).orderBy(asc(usuarios.rol), asc(usuarios.nombre)).all();
}

export function hayUsuarios(db: BaseDeDatos): boolean {
  return db.select({ id: usuarios.id }).from(usuarios).limit(1).get() !== undefined;
}

function duenosActivos(db: Pick<BaseDeDatos, 'select'>, excepto?: number): number {
  const fila = db
    .select({ n: sql<number>`count(*)` })
    .from(usuarios)
    .where(and(eq(usuarios.activo, true), eq(usuarios.rol, 'dueno'), excepto ? ne(usuarios.id, excepto) : undefined))
    .get();
  return Number(fila?.n ?? 0);
}

/** Crea o edita un usuario. Al crear, el PIN es obligatorio. */
export function guardarUsuario(db: BaseDeDatos, datos: UsuarioValidado): number {
  return db.transaction((tx) => {
    const repetido = tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(
        and(
          eq(usuarios.activo, true),
          sql`${usuarios.nombre} = ${datos.nombre} COLLATE NOCASE`,
          datos.id ? ne(usuarios.id, datos.id) : undefined,
        ),
      )
      .get();
    if (repetido) throw new ErrorDeUsuario(`Ya hay un usuario que se llama "${datos.nombre}".`);

    if (!datos.id) {
      if (!datos.pin) throw new ErrorDeUsuario('Elegí un PIN de 4 a 6 números.');
      const { hash, sal } = hashDePin(datos.pin);
      return tx
        .insert(usuarios)
        .values({ nombre: datos.nombre, rol: datos.rol, pinHash: hash, pinSal: sal })
        .returning({ id: usuarios.id })
        .get().id;
    }

    const anterior = tx.select().from(usuarios).where(and(eq(usuarios.id, datos.id), eq(usuarios.activo, true))).get();
    if (!anterior) throw new ErrorDeUsuario('Ese usuario ya no existe.');
    if (anterior.rol === 'dueno' && datos.rol !== 'dueno' && duenosActivos(tx, datos.id) === 0) {
      throw new ErrorDeUsuario('Tiene que quedar al menos un dueño. Creá otro dueño antes de cambiar este.');
    }
    const pin = datos.pin ? hashDePin(datos.pin) : null;
    tx.update(usuarios)
      .set({ nombre: datos.nombre, rol: datos.rol, ...(pin ? { pinHash: pin.hash, pinSal: pin.sal } : {}) })
      .where(eq(usuarios.id, datos.id))
      .run();
    return datos.id;
  });
}

/** Baja lógica: el usuario no puede entrar más, pero su historial queda. */
export function darDeBajaUsuario(db: BaseDeDatos, id: number, quienLoHace: number): void {
  db.transaction((tx) => {
    if (id === quienLoHace) throw new ErrorDeUsuario('No podés darte de baja a vos mismo.');
    const u = tx.select().from(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.activo, true))).get();
    if (!u) throw new ErrorDeUsuario('Ese usuario ya no existe.');
    if (u.rol === 'dueno' && duenosActivos(tx, id) === 0) {
      throw new ErrorDeUsuario('Tiene que quedar al menos un dueño.');
    }
    tx.update(usuarios).set({ activo: false }).where(eq(usuarios.id, id)).run();
  });
}

/** Revisa el PIN de un usuario. Devuelve el usuario o null si no coincide. */
export function verificarPin(db: BaseDeDatos, id: number, pin: string): Usuario | null {
  const u = db.select().from(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.activo, true))).get();
  if (!u) throw new ErrorDeUsuario('Ese usuario ya no existe.');
  return pinCorrecto(pin, u.pinHash, u.pinSal) ? { id: u.id, nombre: u.nombre, rol: u.rol } : null;
}
