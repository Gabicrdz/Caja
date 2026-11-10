// Conecta los pedidos de la ventana (ipcRenderer.invoke) con los servicios.
// Cada canal:
//   1. revisa QUIÉN pide (sesión y rol) — los permisos se controlan acá,
//      en el main, no en los botones de la ventana;
//   2. valida lo que llega con Zod ANTES de tocar la base de datos.
import { ipcMain } from 'electron';
import { z, type ZodType } from 'zod';
import { CANALES } from '@compartido/api';
import {
  esquemaAbrirCaja,
  esquemaBusqueda,
  esquemaCategoria,
  esquemaCerrarCaja,
  esquemaCliente,
  esquemaEstado,
  esquemaFecha,
  esquemaGrupo,
  esquemaImpresion,
  esquemaListarClientes,
  esquemaLocal,
  esquemaMotivo,
  esquemaMovimiento,
  esquemaPagos,
  esquemaPedido,
  esquemaPin,
  esquemaProducto,
  esquemaRango,
  esquemaUsuario,
} from '@compartido/esquemas';
import type { Configuracion, Respuesta, Usuario } from '@compartido/tipos';
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
import { guardarImpresion, guardarLocal, obtenerConfiguracion } from './servicios/configuracion';
import { cargarDemo, hayPedidos } from './servicios/demo';
import { abrirCarpetaCopias, elegirCopia, estadoCopias, exportarCopia, restaurarCopiaElegida } from './copias';
import { darDeBajaUsuario, guardarUsuario, hayUsuarios, listarUsuarios } from './servicios/usuarios';
import { cerrarSesion, iniciarSesion, requerir, sesionActual } from './servicios/sesion';
import { abrirCaja, cajaAbierta, cerrarCaja, historialDeCajas, registrarMovimiento, resumenDeCaja } from './servicios/caja';
import { buscarClientes, guardarCliente, listarClientes, pedidosDeCliente } from './servicios/clientes';
import { obtenerReporte } from './servicios/reportes';
import { htmlCierre, htmlImpresion } from './impresion/plantillas';
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

/**
 * Quién puede usar cada canal:
 * - 'libre': sin sesión (pantalla de ingreso).
 * - 'sesion': cualquier usuario que haya puesto su PIN.
 * - 'dueno': solo el dueño.
 */
type Permiso = 'libre' | 'sesion' | 'dueno';

function controlar(permiso: Permiso): Usuario | null {
  if (permiso === 'libre') return sesionActual();
  return requerir(permiso === 'dueno' ? 'dueno' : undefined);
}

/**
 * Registra un canal. `esquema` describe los argumentos que manda la ventana
 * (como lista: [arg1, arg2…]). `fn` recibe los argumentos ya validados y, al
 * final, el usuario de la sesión.
 */
export function manejar<E extends ZodType<unknown[]>, T>(
  canal: string,
  permiso: Permiso,
  esquema: E,
  fn: (...args: [...z.output<E>, Usuario]) => T | Promise<T>,
): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]): Promise<Respuesta<T>> => {
    try {
      const usuario = controlar(permiso);
      const validados = esquema.parse(args) as z.output<E>;
      return { ok: true, datos: await fn(...validados, usuario as Usuario) };
    } catch (error) {
      return { ok: false, error: mensajeDeError(error) };
    }
  });
}

const nada = z.tuple([]);
const id = z.number().int().positive();
const tipoImpresion = z.enum(['comanda', 'ticket', 'cierre']);

const local = (c: Configuracion) => ({ nombre: c.nombreLocal, direccion: c.direccionLocal, telefono: c.telefonoLocal, pie: c.pieTicket });

/** Arma el HTML de lo que haya que imprimir, con la configuración actual. */
function documentoDe(idDocumento: number, tipo: 'comanda' | 'ticket' | 'cierre') {
  const db = obtenerDb();
  const config = obtenerConfiguracion(db);
  if (tipo === 'cierre') {
    const resumen = resumenDeCaja(db, idDocumento);
    return { html: htmlCierre(resumen, local(config), config.anchoPapel), nombre: `cierre-caja-${idDocumento}`, config };
  }
  const pedido = obtenerPedido(db, idDocumento);
  const html = htmlImpresion(tipo, pedido, local(config), config.anchoPapel);
  if (!html) {
    throw new ErrorDeUsuario(`El pedido #${pedido.numero} no tiene nada para la cocina (solo bebidas o productos que no se preparan).`);
  }
  return { html, nombre: `${pedido.fecha}_pedido-${pedido.numero}_${tipo}`, config };
}

export function registrarCanales(info: () => { version: string; baseDeDatos: string }): void {
  const db = () => obtenerDb();
  const sinDatos = () => null;

  // ── Ingreso ──
  manejar(CANALES.sesionActual, 'libre', nada, () => sesionActual());
  manejar(CANALES.sesionIniciar, 'libre', z.tuple([id, z.string().max(10)]), (usuarioId, pin) => iniciarSesion(db(), usuarioId, pin));
  manejar(CANALES.sesionCerrar, 'libre', nada, () => {
    cerrarSesion();
    return null;
  });
  manejar(CANALES.usuariosParaIngresar, 'libre', nada, () => listarUsuarios(db()));
  manejar(CANALES.usuariosCrearPrimero, 'libre', z.tuple([z.string(), esquemaPin]), (nombre, pin) => {
    // Solo sirve la primera vez: después, los usuarios los crea el dueño.
    if (hayUsuarios(db())) throw new ErrorDeUsuario('Ya hay usuarios creados. Ingresá con tu PIN.');
    const usuarioId = guardarUsuario(db(), esquemaUsuario.parse({ nombre, rol: 'dueno', pin }));
    return iniciarSesion(db(), usuarioId, pin);
  });

  // ── Usuarios (solo el dueño) ──
  manejar(CANALES.usuariosListar, 'dueno', nada, () => listarUsuarios(db()));
  manejar(CANALES.usuariosGuardar, 'dueno', z.tuple([esquemaUsuario]), (d) => guardarUsuario(db(), d));
  manejar(CANALES.usuariosBaja, 'dueno', z.tuple([id]), (usuarioId, yo) => {
    darDeBajaUsuario(db(), usuarioId, yo.id);
    return null;
  });

  // ── Menú: todos lo ven; solo el dueño lo cambia ──
  manejar(CANALES.menuObtener, 'sesion', nada, () => menu.obtenerMenu(db()));
  manejar(CANALES.menuCargarEjemplo, 'dueno', nada, () => {
    cargarMenuDeEjemplo(db());
    return null;
  });
  manejar(CANALES.categoriaCrear, 'dueno', z.tuple([esquemaCategoria]), (d) => menu.crearCategoria(db(), d.nombre));
  manejar(CANALES.categoriaRenombrar, 'dueno', z.tuple([id, esquemaCategoria]), (categoriaId, d) => {
    menu.renombrarCategoria(db(), categoriaId, d.nombre);
    return null;
  });
  manejar(CANALES.categoriaMover, 'dueno', z.tuple([id, z.enum(['arriba', 'abajo'])]), (categoriaId, direccion) => {
    menu.moverCategoria(db(), categoriaId, direccion);
    return null;
  });
  manejar(CANALES.categoriaEstado, 'dueno', z.tuple([id, z.boolean()]), (categoriaId, activa) => {
    menu.cambiarEstadoCategoria(db(), categoriaId, activa);
    return null;
  });
  manejar(CANALES.productoGuardar, 'dueno', z.tuple([esquemaProducto]), (d) => menu.guardarProducto(db(), d));
  // "Agotado" lo puede marcar cualquiera: el que atiende es el que sabe que se terminó.
  manejar(CANALES.productoDisponible, 'sesion', z.tuple([id, z.boolean()]), (productoId, disponible) => {
    menu.cambiarDisponible(db(), productoId, disponible);
    return null;
  });
  manejar(CANALES.productoDuplicar, 'dueno', z.tuple([id]), (productoId) => menu.duplicarProducto(db(), productoId));
  manejar(CANALES.productoBaja, 'dueno', z.tuple([id]), (productoId) => {
    menu.darDeBajaProducto(db(), productoId);
    return null;
  });
  manejar(CANALES.grupoGuardar, 'dueno', z.tuple([esquemaGrupo]), (d) => menu.guardarGrupo(db(), d));
  manejar(CANALES.grupoBaja, 'dueno', z.tuple([id]), (grupoId) => {
    menu.darDeBajaGrupo(db(), grupoId);
    return null;
  });

  // ── Pedidos ──
  manejar(CANALES.pedidoCrear, 'sesion', z.tuple([esquemaPedido]), (d, yo) => crearPedido(db(), d, new Date(), yo.id));
  // ── Clientes (cualquiera con sesión: el cajero también corrige direcciones) ──
  manejar(CANALES.clientesBuscar, 'sesion', z.tuple([esquemaBusqueda]), (texto) => buscarClientes(db(), texto));
  manejar(CANALES.clientesListar, 'sesion', z.tuple([esquemaListarClientes]), (filtro) => listarClientes(db(), filtro));
  manejar(CANALES.clientesGuardar, 'sesion', z.tuple([esquemaCliente]), (datos) => {
    guardarCliente(db(), datos);
    return null;
  });
  manejar(CANALES.clientesPedidos, 'sesion', z.tuple([id]), (clienteId) => pedidosDeCliente(db(), clienteId));

  // ── Reportes (solo el dueño: muestra cuánto vende el local) ──
  manejar(CANALES.reportesObtener, 'dueno', z.tuple([esquemaRango]), (rango) => obtenerReporte(db(), rango));

  manejar(CANALES.pedidoResumenHoy, 'sesion', nada, () => resumenDelDia(db()));
  manejar(CANALES.pedidoListar, 'sesion', z.tuple([esquemaFecha]), (fecha) => listarPedidos(db(), { fecha }));
  manejar(CANALES.pedidoEstado, 'sesion', z.tuple([id, esquemaEstado]), (pedidoId, estado) => {
    cambiarEstado(db(), pedidoId, estado);
    return null;
  });
  manejar(CANALES.pedidoAnular, 'dueno', z.tuple([id, esquemaMotivo]), (pedidoId, motivo, yo) => {
    anularPedido(db(), pedidoId, motivo, yo.id);
    return null;
  });
  manejar(CANALES.pedidoCobrar, 'sesion', z.tuple([id, esquemaPagos]), (pedidoId, pagos, yo) => cobrarPedido(db(), pedidoId, pagos, yo.id));

  // ── Caja ──
  manejar(CANALES.cajaActual, 'sesion', nada, () => {
    const caja = cajaAbierta(db());
    return caja ? resumenDeCaja(db(), caja.id) : null;
  });
  manejar(CANALES.cajaAbrir, 'sesion', z.tuple([esquemaAbrirCaja]), (d, yo) => abrirCaja(db(), d.fondoCentavos, yo));
  manejar(CANALES.cajaMovimiento, 'sesion', z.tuple([esquemaMovimiento]), (d, yo) => {
    registrarMovimiento(db(), d, yo);
    return null;
  });
  manejar(CANALES.cajaCerrar, 'sesion', z.tuple([esquemaCerrarCaja]), (d, yo) => cerrarCaja(db(), d, yo));
  manejar(CANALES.cajaHistorial, 'dueno', nada, () => historialDeCajas(db()));
  manejar(CANALES.cajaResumen, 'dueno', z.tuple([id]), (cajaId) => resumenDeCaja(db(), cajaId));

  // ── Impresión ──
  manejar(CANALES.impresionImprimir, 'sesion', z.tuple([id, tipoImpresion]), async (idDocumento, tipo) => {
    const { html, config } = documentoDe(idDocumento, tipo);
    return { impreso: await imprimirHtml(html, config.anchoPapel, config.impresora) };
  });
  manejar(CANALES.impresionPdf, 'sesion', z.tuple([id, tipoImpresion]), async (idDocumento, tipo) => {
    const { html, nombre, config } = documentoDe(idDocumento, tipo);
    return { ruta: await guardarPdf(html, config.anchoPapel, `${nombre}.pdf`) };
  });
  manejar(CANALES.impresionImpresoras, 'dueno', nada, () => listarImpresoras());

  // ── Configuración y sistema ──
  manejar(CANALES.configuracionObtener, 'libre', nada, () => obtenerConfiguracion(db()));
  manejar(CANALES.configuracionLocal, 'dueno', z.tuple([esquemaLocal]), (d) => {
    guardarLocal(db(), d);
    return null;
  });

  // ── Copias de seguridad y demo (solo el dueño) ──
  manejar(CANALES.copiasEstado, 'dueno', nada, () => estadoCopias());
  manejar(CANALES.copiasExportar, 'dueno', nada, () => exportarCopia());
  manejar(CANALES.copiasElegir, 'dueno', nada, () => elegirCopia());
  manejar(CANALES.copiasRestaurar, 'dueno', nada, () => restaurarCopiaElegida());
  manejar(CANALES.copiasAbrirCarpeta, 'dueno', nada, () => abrirCarpetaCopias());
  manejar(CANALES.demoDisponible, 'dueno', nada, () => !hayPedidos(db()));
  manejar(CANALES.demoCargar, 'dueno', nada, (usuario) => cargarDemo(db(), usuario));
  manejar(CANALES.configuracionImpresion, 'dueno', z.tuple([esquemaImpresion]), (d) => {
    guardarImpresion(db(), d);
    return sinDatos();
  });
  manejar(CANALES.sistemaInfo, 'libre', nada, info);
}
