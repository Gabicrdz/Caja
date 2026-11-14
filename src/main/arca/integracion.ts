// La parte de ARCA que necesita Electron: carpeta del programa y diálogo para elegir archivos.
// La lógica está en los otros archivos de esta carpeta y tiene pruebas.
import { app, BrowserWindow, dialog, shell } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import type { esquemaArca } from '@compartido/esquemas';
import type { AmbienteArca, EstadoArca, EstadoFacturacion, PasoPruebaArca, PedidoCertificado } from '@compartido/tipos';
import type { BaseDeDatos } from '../db/conexion';
import { diasParaVencer } from '@compartido/certificado';
import { fechaLocal } from '../servicios/fechas';
import { guardarDatosArca, obtenerDatosArca } from '../servicios/configuracion';
import { ErrorDeUsuario } from '../servicios/errores';
import { contarPendientes, type Autorizador } from '../servicios/facturacion';
import { ErrorDeArchivo, existeArchivo, guardarTicket, importarArchivo, leerTicket, rutaDe, vencimientoDelCertificado, type ArchivoArca } from './almacen';
import { generarPedido } from './csr';
import { ServicioArca } from './servicio';
import type { ConfigArca } from './tipos';
import { transporteHttps } from './transporte';

const carpetaBase = () => path.join(app.getPath('userData'), 'arca');
const ventana = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

export function estadoArca(db: BaseDeDatos): EstadoArca {
  const d = obtenerDatosArca(db);
  const base = carpetaBase();
  return {
    ...d,
    tieneCertificado: existeArchivo(base, d.ambiente, 'certificado'),
    tieneClave: existeArchivo(base, d.ambiente, 'clave'),
    vencimientoCertificado: vencimientoDelCertificado(base, d.ambiente),
  };
}

export function guardarArca(db: BaseDeDatos, datos: z.output<typeof esquemaArca>): void {
  guardarDatosArca(db, datos);
}

/** Abre "Elegir archivo"; devuelve false si se canceló. */
export async function elegirArchivoArca(archivo: ArchivoArca, ambiente: AmbienteArca): Promise<boolean> {
  const opciones = {
    title: archivo === 'certificado' ? 'Elegí el certificado que descargaste de ARCA (.crt)' : 'Elegí la clave privada (.key)',
    properties: ['openFile' as const],
    filters:
      archivo === 'certificado'
        ? [{ name: 'Certificado', extensions: ['crt', 'pem', 'cer'] }]
        : [{ name: 'Clave privada', extensions: ['key', 'pem'] }],
  };
  const v = ventana();
  const r = v ? await dialog.showOpenDialog(v, opciones) : await dialog.showOpenDialog(opciones);
  const origen = r.filePaths[0];
  if (r.canceled || !origen) return false;
  try {
    importarArchivo(carpetaBase(), ambiente, archivo, origen);
  } catch (e) {
    if (e instanceof ErrorDeArchivo) throw new ErrorDeUsuario(e.message);
    throw e;
  }
  return true;
}

/** Crea la clave (si falta) y el pedido de certificado; deja el .csr en Documentos\\Caja\\ARCA y abre esa carpeta. */
export function generarPedidoArca(db: BaseDeDatos, ambiente: AmbienteArca, reemplazar: boolean): PedidoCertificado {
  const d = obtenerDatosArca(db);
  let r;
  try {
    r = generarPedido(carpetaBase(), ambiente, { cuit: d.cuit, razonSocial: d.razonSocial }, reemplazar);
  } catch (e) {
    if (e instanceof ErrorDeArchivo) throw new ErrorDeUsuario(e.message);
    throw e;
  }
  const carpeta = path.join(app.getPath('documents'), 'Caja', 'ARCA');
  mkdirSync(carpeta, { recursive: true });
  const ruta = path.join(carpeta, `pedido-${r.alias}.csr`);
  writeFileSync(ruta, r.csr, 'utf8');
  shell.showItemInFolder(ruta);
  return { alias: r.alias, ruta, reutilizoClave: r.reutilizoClave };
}

/** El servicio ya armado con lo que hay guardado (lo usa la prueba de conexión y, después, el cobro). */
export function crearServicioArca(db: BaseDeDatos): ServicioArca {
  const d = obtenerDatosArca(db);
  const base = carpetaBase();
  const config: ConfigArca = {
    ...d,
    rutaCertificado: existeArchivo(base, d.ambiente, 'certificado') ? rutaDe(base, d.ambiente, 'certificado') : '',
    rutaClave: existeArchivo(base, d.ambiente, 'clave') ? rutaDe(base, d.ambiente, 'clave') : '',
  };
  return new ServicioArca({
    config,
    transporte: transporteHttps,
    leerArchivo: (ruta) => readFileSync(ruta, 'utf8'),
    guardarTicket: (clave, ticket) => guardarTicket(base, clave, ticket),
    leerTicket: (clave) => leerTicket(base, clave),
  });
}

export function probarArca(db: BaseDeDatos): Promise<PasoPruebaArca[]> {
  return crearServicioArca(db).probar();
}

export function estadoFacturacion(db: BaseDeDatos): EstadoFacturacion {
  const e = estadoArca(db);
  return {
    activa: e.activa,
    lista: e.activa && !!e.cuit && e.tieneCertificado && e.tieneClave,
    ambiente: e.ambiente,
    condicionIva: e.condicionIva,
    pendientes: contarPendientes(db),
    certificadoVenceEnDias: e.tieneCertificado ? diasParaVencer(e.vencimientoCertificado, fechaLocal()) : null,
  };
}

/** Lo que usa facturarPedido para hablar con ARCA con la configuración guardada. */
export function autorizadorArca(db: BaseDeDatos): Autorizador {
  const { activa, ambiente, cuit, puntoVenta, condicionIva } = obtenerDatosArca(db);
  const servicio = crearServicioArca(db);
  return { config: { activa, ambiente, cuit, puntoVenta, condicionIva }, autorizar: (datos) => servicio.autorizar(datos), ultimoAutorizado: (t) => servicio.ultimoAutorizado(t), consultar: (t, n) => servicio.consultar(t, n) };
}
