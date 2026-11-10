// La parte de las copias que necesita Electron: carpetas de Windows,
// diálogos para elegir archivos y reiniciar el programa. La lógica "pura"
// (copiar, revisar, rotar) está en servicios/copias.ts y tiene pruebas.
import { app, BrowserWindow, dialog, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CopiaElegida, EstadoCopias, InfoCopia } from '@compartido/tipos';
import { abrirBaseDeDatos, cerrarBaseDeDatos, obtenerDb, rutaBaseDeDatos } from './db/conexion';
import {
  copiaAutomatica,
  copiasAutomaticas,
  descripcionDeCopia,
  hacerCopia,
  nombreDeCopia,
  reemplazarBase,
  revisarCopia,
} from './servicios/copias';
import { ErrorDeUsuario } from './servicios/errores';

/** Documentos\Caja\Copias: fácil de encontrar para pasarla a un pendrive o a Drive. */
export const carpetaCopias = () => path.join(app.getPath('documents'), 'Caja', 'Copias');
const carpetaAutomaticas = () => path.join(carpetaCopias(), 'Automaticas');
const ventana = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
const FILTRO = [{ name: 'Copia de la Caja', extensions: ['db'] }];

/** Al abrir el programa: copia del día si todavía no hay. Si falla, no frena nada. */
export async function copiaAlIniciar(): Promise<void> {
  try {
    const nueva = await copiaAutomatica(obtenerDb(), carpetaAutomaticas());
    if (nueva) console.log(`Copia automática: ${nueva.ruta}`);
  } catch (error) {
    console.error('No se pudo hacer la copia automática:', error);
  }
}

export function estadoCopias(): EstadoCopias {
  return { carpeta: carpetaCopias(), automaticas: copiasAutomaticas(carpetaAutomaticas()), baseDeDatos: rutaBaseDeDatos() };
}

export async function abrirCarpetaCopias(): Promise<null> {
  mkdirSync(carpetaCopias(), { recursive: true });
  await shell.openPath(carpetaCopias());
  return null;
}

/** "Guardar copia": el dueño elige dónde (por ejemplo, un pendrive). */
export async function exportarCopia(): Promise<InfoCopia | null> {
  mkdirSync(carpetaCopias(), { recursive: true });
  const opciones = { title: 'Guardar copia de seguridad', defaultPath: path.join(carpetaCopias(), nombreDeCopia()), filters: FILTRO };
  const v = ventana();
  const r = v ? await dialog.showSaveDialog(v, opciones) : await dialog.showSaveDialog(opciones);
  if (r.canceled || !r.filePath) return null;
  return hacerCopia(obtenerDb(), r.filePath);
}

// La ruta elegida queda ACÁ, en el main. La ventana solo confirma: así nunca
// puede pedir "restaurá este archivo cualquiera" con una ruta inventada.
let elegida: string | null = null;

export async function elegirCopia(): Promise<CopiaElegida | null> {
  mkdirSync(carpetaCopias(), { recursive: true });
  const opciones = { title: 'Elegir copia para restaurar', defaultPath: carpetaCopias(), properties: ['openFile' as const], filters: FILTRO };
  const v = ventana();
  const r = v ? await dialog.showOpenDialog(v, opciones) : await dialog.showOpenDialog(opciones);
  const ruta = r.filePaths[0];
  if (r.canceled || !ruta) return null;
  if (path.resolve(ruta).toLowerCase() === path.resolve(rutaBaseDeDatos()).toLowerCase()) {
    throw new ErrorDeUsuario('Ese es el archivo que la Caja está usando ahora: elegí una copia.');
  }
  const resumen = revisarCopia(ruta);
  elegida = ruta;
  return { nombre: path.basename(ruta), descripcion: descripcionDeCopia(resumen) };
}

/**
 * Restaura la copia elegida:
 * 1) la vuelve a revisar, 2) guarda una copia de lo actual (por si acaso),
 * 3) cierra la base, 4) pone la copia en su lugar y 5) reinicia el programa.
 */
export async function restaurarCopiaElegida(): Promise<null> {
  if (!elegida) throw new ErrorDeUsuario('Primero elegí el archivo de la copia.');
  const copia = elegida;
  elegida = null;
  revisarCopia(copia);
  await hacerCopia(obtenerDb(), path.join(carpetaCopias(), nombreDeCopia(new Date(), 'caja-antes-de-restaurar-')));
  const rutaBase = rutaBaseDeDatos();
  cerrarBaseDeDatos();
  try {
    reemplazarBase(copia, rutaBase);
  } catch (error) {
    abrirBaseDeDatos(rutaBase); // si no se pudo, seguimos con la base de antes
    throw error;
  }
  // Primero respondemos a la ventana y después reiniciamos.
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 400);
  return null;
}
