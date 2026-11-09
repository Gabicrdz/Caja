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

export type TipoImpresion = 'comanda' | 'ticket' | 'cierre';

// ───────── Usuarios y caja ─────────

export type Rol = 'dueno' | 'cajero';
export const NOMBRE_ROL: Record<Rol, string> = { dueno: 'Dueño', cajero: 'Cajero' };

/** Lo que se sabe de un usuario (nunca viaja el PIN ni su hash). */
export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
}

export type TipoMovimiento = 'ingreso' | 'retiro' | 'gasto';
export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  gasto: 'Gasto',
};

export interface MovimientoCaja {
  id: number;
  tipo: TipoMovimiento;
  montoCentavos: number;
  motivo: string;
  usuario: string;
  hora: string;
}

export interface Caja {
  id: number;
  abiertaEn: string;
  abiertaPor: string;
  fondoCentavos: number;
  cerradaEn: string | null;
  cerradaPor: string | null;
  esperadoCentavos: number | null;
  contadoCentavos: number | null;
  diferenciaCentavos: number | null;
  nota: string;
}

/** Todo lo que pasó en una caja: lo que se muestra en pantalla y en el cierre impreso. */
export interface ResumenCaja {
  caja: Caja;
  /** Por medio de pago: cuántos cobros y cuánto (sin pedidos anulados). */
  porMedio: Record<MedioDePago, { cobros: number; montoCentavos: number }>;
  ventasCentavos: number;
  pedidosCobrados: number;
  pedidosAnulados: number;
  /** Pedidos tomados durante la caja que todavía no se cobraron. */
  sinCobrar: { cantidad: number; totalCentavos: number };
  movimientos: MovimientoCaja[];
  ingresosCentavos: number;
  retirosCentavos: number;
  gastosCentavos: number;
  /** fondo + efectivo cobrado + ingresos − retiros − gastos */
  efectivoEsperadoCentavos: number;
}

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
// ---------- Clientes (etapa 5) ----------
export interface Cliente {
  id: number;
  nombre: string;
  telefono: string;
  direccion: string;
  nota: string;
  pedidos: number;
  /** Lo que gastó en total (sin anulados). */
  gastadoCentavos: number;
  /** 'AAAA-MM-DD' del último pedido, o null si no tiene. */
  ultimoPedido: string | null;
}

export interface PedidoDeCliente {
  id: number;
  numero: number;
  fecha: string;
  hora: string;
  tipo: TipoPedido;
  estado: EstadoPedido;
  totalCentavos: number;
  direccion: string;
}

// ---------- Reportes (etapa 5) ----------
export interface VentasDelDia {
  fecha: string;
  pedidos: number;
  ventasCentavos: number;
}
export interface VentasPorHora {
  /** 0 a 23 */
  hora: number;
  pedidos: number;
  ventasCentavos: number;
}
export interface VentasDeProducto {
  productoId: number;
  nombre: string;
  categoria: string;
  cantidad: number;
  ventasCentavos: number;
}
export interface Reporte {
  desde: string;
  hasta: string;
  dias: number;
  /** Pedidos no anulados (cobrados y "a cobrar"). */
  pedidos: number;
  ventasCentavos: number;
  ticketPromedioCentavos: number;
  envioCentavos: number;
  anulados: { cantidad: number; totalCentavos: number };
  sinCobrar: { cantidad: number; totalCentavos: number };
  /** El período anterior del mismo largo (para comparar). */
  anterior: { desde: string; hasta: string; pedidos: number; ventasCentavos: number };
  porDia: VentasDelDia[];
  porHora: VentasPorHora[];
  porMedio: { medio: MedioDePago; cobros: number; montoCentavos: number }[];
  porTipo: { tipo: TipoPedido; pedidos: number; ventasCentavos: number }[];
  porUsuario: { usuarioId: number | null; nombre: string; pedidos: number; ventasCentavos: number }[];
  productos: VentasDeProducto[];
  clientes: { conPedidos: number; nuevos: number };
}

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string };
