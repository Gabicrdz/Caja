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

// ───────── Pedidos ─────────

export const TIPOS_PEDIDO = ['mostrador', 'llevar', 'delivery', 'mesa'] as const;
export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

export const MEDIOS_DE_PAGO = ['efectivo', 'transferencia', 'debito', 'credito', 'qr'] as const;
export type MedioDePago = (typeof MEDIOS_DE_PAGO)[number];

export const NOMBRE_MEDIO: Record<MedioDePago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
};

export const NOMBRE_TIPO: Record<TipoPedido, string> = {
  mostrador: 'Mostrador',
  llevar: 'Para llevar',
  delivery: 'Delivery',
  mesa: 'Mesa',
};

export interface PedidoCreado {
  id: number;
  /** Número del día (vuelve a 1 cada día): es el que se canta en el mostrador. */
  numero: number;
  totalCentavos: number;
  vueltoCentavos: number;
}

export interface ResumenDelDia {
  fecha: string;
  pedidos: number;
  totalCentavos: number;
}

export interface Configuracion {
  nombreLocal: string;
  envioCentavos: number;
}

/** Toda respuesta del main tiene esta forma (igual que en los proyectos anteriores). */
export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };
