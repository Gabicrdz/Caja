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
  esquemaEstado,
  esquemaFecha,
  esquemaImpresion,
  esquemaMotivo,
  esquemaPagos,
  esquemaPedido,
  esquemaProducto,
} from '@compartido/esquemas';
import type { Respuesta } from '@compartido/tipos';
import { obtenerDb } from './db/conexion';
import { ErrorDeUsuario } from './servicios/errores';
import * as menu from './servicios/menu';
import { cargarMenuDeEjemplo } from './servicios/menu-ejemplo';
import {
  anularPedido,
  cambiarEstado,
  cobrarPedido,
  crearPedido,
  listarPedidos,
  obtenerPedido,
  resumenDelDia,
} from './servicios/pedidos';
import { guardarImpresion, obtenerConfiguracion } from './servicios/configuracion';
import { htmlImpresion } from './impresion/plantillas';
import { guardarPdf, imprimirHtml, listarImpresoras } from './impresion/imprimir';

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

/** Igual que manejar, para tareas que tardan (imprimir, guardar un PDF). */
export function manejarAsync<E extends ZodType<unknown[]>, T>(
  canal: string,
  esquema: E,
  fn: (...args: z.output<E>) => Promise<T>,
): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]): Promise<Respuesta<T>> => {
    try {
      return { ok: true, datos: await fn(...(esquema.parse(args) as z.output<E>)) };
    } catch (error) {
      return { ok: false, error: mensajeDeError(error) };
    }
  });
}

const sinArgumentos = z.tuple([]);
const tipoImpresion = z.enum(['comanda', 'ticket']);

/** Arma el HTML de la comanda o el ticket de un pedido, con la configuración actual. */
function documentoDe(id: number, tipo: 'comanda' | 'ticket') {
  const db = obtenerDb();
  const pedido = obtenerPedido(db, id);
  const config = obtenerConfiguracion(db);
  const html = htmlImpresion(tipo, pedido, config.nombreLocal, config.anchoPapel);
  if (!html) throw new ErrorDeUsuario(`El pedido #${pedido.numero} no tiene nada para la cocina (solo bebidas o productos que no se preparan).`);
  return { html, pedido, config };
}

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
  manejar(CANALES.pedidoListar, z.tuple([esquemaFecha]), (fecha) => listarPedidos(db(), { fecha }));
  manejar(CANALES.pedidoEstado, z.tuple([z.number().int().positive(), esquemaEstado]), (id, estado) => {
    cambiarEstado(db(), id, estado);
    return null;
  });
  manejar(CANALES.pedidoAnular, z.tuple([z.number().int().positive(), esquemaMotivo]), (id, motivo) => {
    anularPedido(db(), id, motivo);
    return null;
  });
  manejar(CANALES.pedidoCobrar, z.tuple([z.number().int().positive(), esquemaPagos]), (id, pagos) =>
    cobrarPedido(db(), id, pagos),
  );

  manejarAsync(CANALES.impresionImprimir, z.tuple([z.number().int().positive(), tipoImpresion]), async (id, tipo) => {
    const { html, config } = documentoDe(id, tipo);
    return { impreso: await imprimirHtml(html, config.anchoPapel, config.impresora) };
  });
  manejarAsync(CANALES.impresionPdf, z.tuple([z.number().int().positive(), tipoImpresion]), async (id, tipo) => {
    const { html, pedido, config } = documentoDe(id, tipo);
    const nombre = `${pedido.fecha}_pedido-${pedido.numero}_${tipo}.pdf`;
    return { ruta: await guardarPdf(html, config.anchoPapel, nombre) };
  });
  manejarAsync(CANALES.impresionImpresoras, sinArgumentos, () => listarImpresoras());

  manejar(CANALES.configuracionObtener, sinArgumentos, () => obtenerConfiguracion(db()));
  manejar(CANALES.configuracionImpresion, z.tuple([esquemaImpresion]), (d) => {
    guardarImpresion(db(), d);
    return null;
  });

  manejar(CANALES.sistemaInfo, sinArgumentos, info);
}
