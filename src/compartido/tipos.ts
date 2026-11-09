// Lo que el main le devuelve a la ventana.

export interface Categoria {
  id: number;
  nombre: string;
  orden: number;
  activa: boolean;
  cantidadProductos: number;
}

export interface Variante {
  id: number;
  nombre: string;
  precioCentavos: number;
}

export interface Producto {
  id: number;
  categoriaId: number;
  nombre: string;
  descripcion: string;
  codigo: string;
  precioCentavos: number;
  disponible: boolean;
  vaACocina: boolean;
  variantes: Variante[];
  gruposIds: number[];
}

export interface Opcion {
  id: number;
  nombre: string;
  precioCentavos: number;
}

export interface GrupoAgregados {
  id: number;
  nombre: string;
  minimo: number;
  maximo: number | null;
  opciones: Opcion[];
  cantidadProductos: number;
}

export interface Menu {
  categorias: Categoria[];
  productos: Producto[];
  grupos: GrupoAgregados[];
}

/** Toda respuesta del main tiene esta forma (igual que en los proyectos anteriores). */
export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };
