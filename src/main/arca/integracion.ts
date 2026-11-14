// La parte de ARCA que necesita Electron: carpeta del programa y diálogo para elegir archivos.
// La lógica está en los otros archivos de esta carpeta y tiene pruebas.
import { app, BrowserWindow, dialog } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { z } from 'zod';
import type { esquemaArca } from '@compartido/esquemas';
import type { AmbienteArca, EstadoArca, EstadoFacturacion, PasoPruebaArca } from '@compartido/tipos';
import type { BaseDeDatos } from '../db/conexion';
import { guardarDatosArca, obtenerDatosArca } from '../servicios/configuracion';
import { ErrorDeUsuario } from '../servicios/errores';
import { contarPendientes, type Autorizador } from '../servicios/facturacion';
import { ErrorDeArchivo, existeArchivo, guardarTicket, importarArchivo, leerTicket, rutaDe, vencimientoDelCertificado, type ArchivoArca } from './almacen';
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
  };
}

/** Lo que usa facturarPedido para hablar con ARCA con la configuración guardada. */
export function autorizadorArca(db: BaseDeDatos): Autorizador {
  const { activa, ambiente, cuit, puntoVenta, condicionIva } = obtenerDatosArca(db);
  const servicio = crearServicioArca(db);
  return { config: { activa, ambiente, cuit, puntoVenta, condicionIva }, autorizar: (datos) => servicio.autorizar(datos) };
}
