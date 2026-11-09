import { abrirBaseDeDatos, cerrarBaseDeDatos, type BaseDeDatos } from '../src/main/db/conexion';
import { esquemaGrupo, esquemaProducto } from '../src/compartido/esquemas';
import type { DatosGrupo, DatosProducto } from '../src/compartido/esquemas';
import * as menu from '../src/main/servicios/menu';

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
