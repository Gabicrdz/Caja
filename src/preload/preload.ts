// PRELOAD: el único puente entre la ventana y el main. Expone `window.caja`
// con funciones concretas; la ventana nunca tiene acceso a ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { CANALES, type ApiCaja } from '@compartido/api';

const pedir = (canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args);

const api: ApiCaja = {
  menu: {
    obtener: () => pedir(CANALES.menuObtener),
    cargarEjemplo: () => pedir(CANALES.menuCargarEjemplo),
  },
  categorias: {
    crear: (datos) => pedir(CANALES.categoriaCrear, datos),
    renombrar: (id, datos) => pedir(CANALES.categoriaRenombrar, id, datos),
    mover: (id, direccion) => pedir(CANALES.categoriaMover, id, direccion),
    cambiarEstado: (id, activa) => pedir(CANALES.categoriaEstado, id, activa),
  },
  productos: {
    guardar: (datos) => pedir(CANALES.productoGuardar, datos),
    cambiarDisponible: (id, disponible) => pedir(CANALES.productoDisponible, id, disponible),
    duplicar: (id) => pedir(CANALES.productoDuplicar, id),
    darDeBaja: (id) => pedir(CANALES.productoBaja, id),
  },
  grupos: {
    guardar: (datos) => pedir(CANALES.grupoGuardar, datos),
    darDeBaja: (id) => pedir(CANALES.grupoBaja, id),
  },
  sistema: {
    info: () => pedir(CANALES.sistemaInfo),
  },
};

contextBridge.exposeInMainWorld('caja', api);
