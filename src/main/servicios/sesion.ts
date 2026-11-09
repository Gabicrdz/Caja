// Quién está usando la caja AHORA. Vive en la memoria del proceso main:
// la ventana no puede "decir" quién es, tiene que poner el PIN.
import type { BaseDeDatos } from '../db/conexion';
import type { Rol, Usuario } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { verificarPin } from './usuarios';

let actual: Usuario | null = null;

// Después de 5 PIN mal seguidos, hay que esperar 30 segundos (por usuario).
const MAXIMO_INTENTOS = 5;
const ESPERA_MS = 30_000;
const fallos = new Map<number, { cantidad: number; hasta: number }>();

export function iniciarSesion(db: BaseDeDatos, usuarioId: number, pin: string, ahora: number = Date.now()): Usuario {
  const registro = fallos.get(usuarioId) ?? { cantidad: 0, hasta: 0 };
  if (registro.hasta > ahora) {
    const segundos = Math.ceil((registro.hasta - ahora) / 1000);
    throw new ErrorDeUsuario(`Demasiados intentos. Esperá ${segundos} segundos.`);
  }
  const usuario = verificarPin(db, usuarioId, pin);
  if (!usuario) {
    // Si ya había cumplido una espera, vuelve a contar desde cero.
    const cantidad = registro.hasta !== 0 ? 1 : registro.cantidad + 1;
    const bloqueado = cantidad >= MAXIMO_INTENTOS;
    fallos.set(usuarioId, { cantidad, hasta: bloqueado ? ahora + ESPERA_MS : 0 });
    throw new ErrorDeUsuario(bloqueado ? 'PIN incorrecto. Esperá 30 segundos para volver a probar.' : 'PIN incorrecto.');
  }
  fallos.delete(usuarioId);
  actual = usuario;
  return usuario;
}

export function cerrarSesion(): void {
  actual = null;
}

export function sesionActual(): Usuario | null {
  return actual;
}

/** Para los canales: exige que haya alguien adentro (y, si se pide, que sea dueño). */
export function requerir(rol?: Rol): Usuario {
  if (!actual) throw new ErrorDeUsuario('La sesión se cerró. Volvé a ingresar con tu PIN.');
  if (rol === 'dueno' && actual.rol !== 'dueno') throw new ErrorDeUsuario('Eso lo puede hacer solo el dueño.');
  return actual;
}

/** Solo para las pruebas. */
export function reiniciarSesionParaPruebas(usuario: Usuario | null = null): void {
  actual = usuario;
  fallos.clear();
}
