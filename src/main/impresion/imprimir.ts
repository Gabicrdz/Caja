// Imprimir con Electron: se carga el HTML en una ventana INVISIBLE y se manda
// a la impresora (o se guarda como PDF). La ventana no tiene preload ni acceso
// a Node: solo muestra el ticket.
import { BrowserWindow, app, shell } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Impresora } from '@compartido/tipos';

const MM_A_PX = 96 / 25.4; // a 96 puntos por pulgada

async function cargar(html: string, anchoMm: 58 | 80): Promise<{ ventana: BrowserWindow; altoMm: number }> {
  const ventana = new BrowserWindow({
    show: false,
    width: Math.ceil(anchoMm * MM_A_PX),
    height: 200,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await ventana.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  // El alto del contenido (no de la ventana): así el papel se corta justo.
  const altoPx = Number(
    await ventana.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)'),
  );
  return { ventana, altoMm: Math.ceil(altoPx / MM_A_PX) + 2 };
}

/**
 * Manda a imprimir. Si hay impresora elegida, imprime directo (sin preguntar);
 * si no, abre el diálogo de Windows (ahí se puede elegir "Microsoft Print to PDF").
 */
export async function imprimirHtml(html: string, anchoMm: 58 | 80, impresora: string): Promise<boolean> {
  const { ventana, altoMm } = await cargar(html, anchoMm);
  try {
    return await new Promise<boolean>((resolver, rechazar) => {
      ventana.webContents.print(
        {
          silent: impresora !== '',
          deviceName: impresora || undefined,
          printBackground: true,
          margins: { marginType: 'none' },
          // En micrones: el ancho del papel y el largo justo del ticket.
          pageSize: { width: anchoMm * 1000, height: Math.max(altoMm, 60) * 1000 },
        },
        (exito, motivo) => {
          // Cancelar el diálogo no es un error: simplemente no se imprimió.
          if (exito || /cancel/i.test(motivo)) resolver(exito);
          else rechazar(new Error(motivo));
        },
      );
    });
  } finally {
    ventana.destroy();
  }
}

/** Guarda el ticket como PDF en Documentos\Caja\Tickets y lo abre. */
export async function guardarPdf(html: string, anchoMm: 58 | 80, nombreArchivo: string): Promise<string> {
  const { ventana, altoMm } = await cargar(html, anchoMm);
  try {
    const datos = await ventana.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      // printToPDF mide en pulgadas.
      pageSize: { width: anchoMm / 25.4, height: Math.max(altoMm, 60) / 25.4 },
    });
    const carpeta = path.join(app.getPath('documents'), 'Caja', 'Tickets');
    await mkdir(carpeta, { recursive: true });
    const ruta = path.join(carpeta, nombreArchivo);
    await writeFile(ruta, datos);
    const error = await shell.openPath(ruta);
    if (error) console.error('No se pudo abrir el PDF:', error);
    return ruta;
  } finally {
    ventana.destroy();
  }
}

export async function listarImpresoras(): Promise<Impresora[]> {
  const ventana = BrowserWindow.getAllWindows()[0];
  if (!ventana) return [];
  const lista = await ventana.webContents.getPrintersAsync();
  return lista.map((i) => ({ nombre: i.name, descripcion: i.displayName || i.name }));
}
