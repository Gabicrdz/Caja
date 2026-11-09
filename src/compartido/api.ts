// El "contrato" entre la ventana y el main: qué se puede pedir y qué devuelve.
// El preload lo implementa y la ventana lo usa con autocompletado.
import type {
  DatosCategoria,
  DatosGrupo,
  DatosProducto,
} from './esquemas';
import type { Menu, Respuesta } from './tipos';

export interface ApiCaja {
  menu: {
    obtener(): Promise<Respuesta<Menu>>;
    cargarEjemplo(): Promise<Respuesta<null>>;
  };
  categorias: {
    crear(datos: DatosCategoria): Promise<Respuesta<number>>;
    renombrar(id: number, datos: DatosCategoria): Promise<Respuesta<null>>;
    mover(id: number, direccion: 'arriba' | 'abajo'): Promise<Respuesta<null>>;
    cambiarEstado(id: number, activa: boolean): Promise<Respuesta<null>>;
  };
  productos: {
    guardar(datos: DatosProducto): Promise<Respuesta<number>>;
    cambiarDisponible(id: number, disponible: boolean): Promise<Respuesta<null>>;
    duplicar(id: number): Promise<Respuesta<number>>;
    darDeBaja(id: number): Promise<Respuesta<null>>;
  };
  grupos: {
    guardar(datos: DatosGrupo): Promise<Respuesta<number>>;
    darDeBaja(id: number): Promise<Respuesta<null>>;
  };
  sistema: {
    info(): Promise<Respuesta<{ version: string; baseDeDatos: string }>>;
  };
}

/** Nombre de cada canal IPC: "seccion:accion". */
export const CANALES = {
  menuObtener: 'menu:obtener',
  menuCargarEjemplo: 'menu:cargar-ejemplo',
  categoriaCrear: 'categorias:crear',
  categoriaRenombrar: 'categorias:renombrar',
  categoriaMover: 'categorias:mover',
  categoriaEstado: 'categorias:estado',
  productoGuardar: 'productos:guardar',
  productoDisponible: 'productos:disponible',
  productoDuplicar: 'productos:duplicar',
  productoBaja: 'productos:baja',
  grupoGuardar: 'grupos:guardar',
  grupoBaja: 'grupos:baja',
  sistemaInfo: 'sistema:info',
} as const;
