// Conecta los pedidos de la ventana (ipcRenderer.invoke) con los servicios.
// Cada canal valida lo que llega con Zod ANTES de tocar la base de datos.
import { ipcMain } from 'electron';
import { z, type ZodType } from 'zod';
import { CANALES } from '@compartido/api';
import {
  esquemaCategoria,
  esquemaDisponible,
  esquemaEditarCategoria,
  esquemaEstadoCategoria,
  esquemaGrupo,
  esquemaId,
  esquemaMoverCategoria,
  esquemaPedido,
  esquemaProducto,
} from '@compartido/esquemas';
import type { Respuesta } from '@compartido/tipos';
import { obtenerDb } from './db/conexion';
import { ErrorDeUsuario } from './servicios/errores';
import * as menu from './servicios/menu';
import { cargarMenuDeEjemplo } from './servicios/menu-ejemplo';
import { crearPedido, resumenDelDia } from './servicios/pedidos';
import { obtenerConfiguracion } from './servicios/configuracion';

/** Convierte cualquier error en un mensaje para la ventana. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDeUsuario) return error.message;
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? 'Hay datos inválidos.';
  }
  console.error(error);
  return 'Ocurrió un error inesperado. Si se repite, avisale a quien te instaló el sistema.';
}

/** Ejecuta `fn` y arma la respuesta { ok, datos } o { ok: false, error }. */
export function responder<T>(fn: () => T): Respuesta<T> {
  try {
    return { ok: true, datos: fn() };
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) };
  }
}

/**
 * Registra un canal. `esquema` describe los argumentos que manda la ventana
 * (como lista: [arg1, arg2…]); Zod los revisa y recién ahí llama a `fn`.
 */
export function manejar<E extends ZodType<unknown[]>, T>(
  canal: string,
  esquema: E,
  fn: (...args: z.output<E>) => T,
): void {
  ipcMain.handle(canal, (_evento, ...args: unknown[]) =>
    responder(() => fn(...(esquema.parse(args) as z.output<E>))),
  );
}

const sinArgumentos = z.tuple([]);

export function registrarCanales(info: () => { version: string; baseDeDatos: string }): void {
  const db = () => obtenerDb();

  manejar(CANALES.menuObtener, sinArgumentos, () => menu.obtenerMenu(db()));
  manejar(CANALES.menuCargarEjemplo, sinArgumentos, () => {
    cargarMenuDeEjemplo(db());
    return null;
  });

  manejar(CANALES.categoriaCrear, z.tuple([esquemaCategoria]), (d) =>
    menu.crearCategoria(db(), d.nombre),
  );
  manejar(
    CANALES.categoriaRenombrar,
    z.tuple([z.number(), esquemaCategoria]),
    (id, d) => {
      const { nombre } = esquemaEditarCategoria.parse({ id, ...d });
      menu.renombrarCategoria(db(), id, nombre);
      return null;
    },
  );
  manejar(
    CANALES.categoriaMover,
    z.tuple([z.number(), z.enum(['arriba', 'abajo'])]),
    (id, direccion) => {
      esquemaMoverCategoria.parse({ id, direccion });
      menu.moverCategoria(db(), id, direccion);
      return null;
    },
  );
  manejar(CANALES.categoriaEstado, z.tuple([z.number(), z.boolean()]), (id, activa) => {
    esquemaEstadoCategoria.parse({ id, activa });
    menu.cambiarEstadoCategoria(db(), id, activa);
    return null;
  });

  manejar(CANALES.productoGuardar, z.tuple([esquemaProducto]), (d) =>
    menu.guardarProducto(db(), d),
  );
  manejar(CANALES.productoDisponible, z.tuple([z.number(), z.boolean()]), (id, disponible) => {
    esquemaDisponible.parse({ id, disponible });
    menu.cambiarDisponible(db(), id, disponible);
    return null;
  });
  manejar(CANALES.productoDuplicar, z.tuple([z.number()]), (id) =>
    menu.duplicarProducto(db(), esquemaId.parse({ id }).id),
  );
  manejar(CANALES.productoBaja, z.tuple([z.number()]), (id) => {
    menu.darDeBajaProducto(db(), esquemaId.parse({ id }).id);
    return null;
  });

  manejar(CANALES.grupoGuardar, z.tuple([esquemaGrupo]), (d) => menu.guardarGrupo(db(), d));
  manejar(CANALES.grupoBaja, z.tuple([z.number()]), (id) => {
    menu.darDeBajaGrupo(db(), esquemaId.parse({ id }).id);
    return null;
  });

  manejar(CANALES.pedidoCrear, z.tuple([esquemaPedido]), (d) => crearPedido(db(), d));
  manejar(CANALES.pedidoResumenHoy, sinArgumentos, () => resumenDelDia(db()));
  manejar(CANALES.configuracionObtener, sinArgumentos, () => obtenerConfiguracion(db()));

  manejar(CANALES.sistemaInfo, sinArgumentos, info);
}
