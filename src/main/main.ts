// Proceso MAIN: arranca la app, abre la base de datos y crea la ventana.
import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { abrirBaseDeDatos, cerrarBaseDeDatos, rutaBaseDeDatos } from './db/conexion';
import { registrarCanales } from './ipc';

// Instalador de Windows: crea/borra accesos directos y se cierra.
if (started) app.quit();

// La carpeta de datos queda fija en AppData\Roaming\caja aunque después
// cambiemos el nombre del programa (lección aprendida en el gimnasio).
app.setPath('userData', path.join(app.getPath('appData'), 'caja'));

// Una sola caja abierta a la vez: dos ventanas escribiendo la misma base
// terminarían mezclando pedidos. Si ya hay una abierta, esta se cierra.
const esLaUnica = app.requestSingleInstanceLock();
if (!esLaUnica) app.quit();

let ventana: BrowserWindow | null = null;

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f4f1',
    title: 'Caja',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // La ventana nunca navega a otra página ni abre ventanas nuevas.
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL || !url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) {
      evento.preventDefault();
    }
  });
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  ventana.once('ready-to-show', () => {
    ventana?.maximize();
    ventana?.show();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void ventana.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void ventana.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('second-instance', () => {
  if (ventana?.isMinimized()) ventana.restore();
  ventana?.focus();
});

app.whenReady().then(() => {
  if (!esLaUnica) return;
  if (app.isPackaged) Menu.setApplicationMenu(null);
  abrirBaseDeDatos(path.join(app.getPath('userData'), 'caja.db'));
  registrarCanales(() => ({ version: app.getVersion(), baseDeDatos: rutaBaseDeDatos() }));
  crearVentana();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => cerrarBaseDeDatos());
