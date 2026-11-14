// Guarda el libro de ventas en Documentos\Caja\Libro de ventas y lo abre con Excel.
import { app, shell } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LibroDeVentas } from '@compartido/tipos';
import { xlsxDelLibro } from './libro-xlsx';

export function nombreDelLibro(l: Pick<LibroDeVentas, 'desde' | 'hasta' | 'ambiente'>): string {
  const prueba = l.ambiente === 'homologacion' ? '_PRUEBA' : '';
  return `libro-de-ventas_${l.desde}_a_${l.hasta}${prueba}.xlsx`;
}

export async function guardarLibro(libro: LibroDeVentas): Promise<string> {
  const carpeta = path.join(app.getPath('documents'), 'Caja', 'Libro de ventas');
  await mkdir(carpeta, { recursive: true });
  const ruta = path.join(carpeta, nombreDelLibro(libro));
  await writeFile(ruta, xlsxDelLibro(libro));
  const error = await shell.openPath(ruta);
  if (error) console.error('No se pudo abrir el libro:', error);
  return ruta;
}
