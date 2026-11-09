import { abrirBaseDeDatos, cerrarBaseDeDatos, type BaseDeDatos } from '../src/main/db/conexion';
import { esquemaGrupo, esquemaProducto } from '../src/compartido/esquemas';
import type { DatosGrupo, DatosProducto } from '../src/compartido/esquemas';
import type { Usuario } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { abrirCaja } from '../src/main/servicios/caja';

/** Una base nueva y vacía, en memoria, para cada prueba. */
export function baseNueva(): BaseDeDatos {
  cerrarBaseDeDatos();
  return abrirBaseDeDatos(':memory:');
}

/** Pesos → centavos, para escribir las pruebas más claro. */
export const $ = (pesos: number) => Math.round(pesos * 100);

/** Guarda un producto pasando por Zod, igual que cuando llega de la ventana. */
export function guardar(db: BaseDeDatos, datos: DatosProducto) {
  return menu.guardarProducto(db, esquemaProducto.parse(datos));
}

export function guardarGrupo(db: BaseDeDatos, datos: DatosGrupo) {
  return menu.guardarGrupo(db, esquemaGrupo.parse(datos));
}

/** Crea un dueño (PIN 1234) y abre la caja con $ 20.000 de fondo. */
export function dueñoConCaja(db: BaseDeDatos, fondo = $(20000)): Usuario {
  const id = guardarUsuario(db, { nombre: 'Sergio', rol: 'dueno', pin: '1234' });
  const usuario: Usuario = { id, nombre: 'Sergio', rol: 'dueno' };
  abrirCaja(db, fondo, usuario, new Date(2026, 10, 9, 8, 0));
  return usuario;
}
