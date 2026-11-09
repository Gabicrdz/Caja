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

export const ESTADOS_PEDIDO = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado'] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const NOMBRE_ESTADO: Record<EstadoPedido, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  anulado: 'Anulado',
};

export interface AgregadoDetalle {
  grupoNombre: string;
  nombre: string;
  precioCentavos: number;
}

export interface ItemDetalle {
  id: number;
  nombre: string;
  varianteNombre: string;
  cantidad: number;
  unitarioCentavos: number;
  agregadosCentavos: number;
  totalCentavos: number;
  nota: string;
  vaACocina: boolean;
  agregados: AgregadoDetalle[];
}

export interface PagoDetalle {
  medio: MedioDePago;
  montoCentavos: number;
  recibidoCentavos: number;
  vueltoCentavos: number;
}

/** Un pedido completo, con sus renglones y pagos (para la pantalla Pedidos y la impresión). */
export interface PedidoDetalle {
  id: number;
  numero: number;
  fecha: string;
  hora: string;
  tipo: TipoPedido;
  mesa: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteDireccion: string;
  nota: string;
  subtotalCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  estado: EstadoPedido;
  cobrado: boolean;
  motivoAnulacion: string;
  items: ItemDetalle[];
  pagos: PagoDetalle[];
}

export type TipoImpresion = 'comanda' | 'ticket';

export interface Impresora {
  /** Nombre que entiende Windows (el que se guarda). */
  nombre: string;
  /** Nombre lindo para mostrar. */
  descripcion: string;
}

export interface PedidoCreado {
  id: number;
  /** Número del día (vuelve a 1 cada día): es el que se canta en el mostrador. */
  numero: number;
  totalCentavos: number;
  vueltoCentavos: number;
  /** false = se guardó para cobrar después (delivery, mesa…). */
  cobrado: boolean;
}

export interface ResumenDelDia {
  fecha: string;
  pedidos: number;
  totalCentavos: number;
}

export interface Configuracion {
  nombreLocal: string;
  envioCentavos: number;
  /** Nombre de la impresora de tickets; '' = preguntar cada vez (diálogo de Windows). */
  impresora: string;
  anchoPapel: 58 | 80;
}

/** Toda respuesta del main tiene esta forma (igual que en los proyectos anteriores). */
export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };
