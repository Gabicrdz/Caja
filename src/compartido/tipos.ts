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
/** La factura que ARCA autorizó para un pedido (lo que se muestra y se imprime). */
export interface ComprobanteResumen {
  id: number;
  tipo: number;
  /** "Factura C", "Factura B"… */
  nombre: string;
  puntoVenta: number;
  numero: number;
  /** "0001-00000008" */
  numeroCompleto: string;
  fecha: string;
  totalCentavos: number;
  cae: string;
  vencimientoCae: string;
  docTipo: number;
  docNro: string;
  /** Condición del cliente frente al IVA (1 RI, 4 exento, 5 consumidor final, 6 monotributo). */
  condicionIvaReceptor: number;
  ambiente: AmbienteArca;
  /** CUIT de quien emitió (va en el QR). */
  cuitEmisor: string;
}

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
  /** Factura autorizada por ARCA, si tiene. */
  comprobante: ComprobanteResumen | null;
  /** La nota de crédito que anuló la factura, si la hubo. */
  notaDeCredito: ComprobanteResumen | null;
  /** Si se quiso facturar y ARCA no pudo: el motivo (queda para reintentar). */
  facturaPendiente: string | null;
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
  direccionLocal: string;
  telefonoLocal: string;
  /** Mensaje al final del ticket ("¡Gracias por tu compra!"). */
  pieTicket: string;
  envioCentavos: number;
  /** Nombre de la impresora de tickets; '' = preguntar cada vez (diálogo de Windows). */
  impresora: string;
  anchoPapel: 58 | 80;
}

export type AmbienteArca = 'homologacion' | 'produccion';
export type CondicionIvaEmisor = 'monotributo' | 'responsable_inscripto';

/** Lo que la ventana ve de la facturación con ARCA. Nunca llegan el certificado ni la clave, solo si están. */
export interface EstadoArca {
  activa: boolean;
  ambiente: AmbienteArca;
  cuit: string;
  puntoVenta: number;
  condicionIva: CondicionIvaEmisor;
  /** Datos que se imprimen en la factura (pueden estar vacíos). */
  razonSocial: string;
  ingresosBrutos: string;
  /** AAAA-MM-DD o ''. */
  inicioActividades: string;
  /** Hay un certificado (.crt) cargado para este ambiente. */
  tieneCertificado: boolean;
  tieneClave: boolean;
  /** Cuándo vence el certificado cargado (AAAA-MM-DD), o null. */
  vencimientoCertificado: string | null;
}

/** Lo que necesita la pantalla de cobro para decidir si ofrece "Facturar". */
export interface EstadoFacturacion {
  /** Está encendida en Ajustes. */
  activa: boolean;
  /** Y además tiene CUIT, certificado y clave: se puede facturar ya. */
  lista: boolean;
  ambiente: AmbienteArca;
  condicionIva: CondicionIvaEmisor;
  /** Pedidos cobrados que quedaron sin facturar por un error de ARCA. */
  pendientes: number;
}

/** Resultado de generar la clave y el pedido de certificado desde Ajustes → ARCA. */
export interface PedidoCertificado {
  alias: string;
  /** Dónde quedó el archivo .csr (Documentos\Caja\ARCA). */
  ruta: string;
  reutilizoClave: boolean;
}

export interface PasoPruebaArca {
  paso: string;
  ok: boolean;
  detalle: string;
}

/** Toda respuesta del main tiene esta forma (igual que en los proyectos anteriores). */
// ---------- Copias de seguridad y demo (etapa 6) ----------
export interface InfoCopia {
  ruta: string;
  nombre: string;
  /** 'AAAA-MM-DD HH:MM' */
  fecha: string;
  bytes: number;
}
export interface EstadoCopias {
  carpeta: string;
  automaticas: InfoCopia[];
  baseDeDatos: string;
}
/** Lo que se encontró en la copia elegida, para confirmar antes de restaurar. */
export interface CopiaElegida {
  nombre: string;
  descripcion: string;
}

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

// ───────── Libro de ventas (para el contador) ─────────

export interface FilaLibro {
  fecha: string;
  /** "Factura C", "Nota de Crédito C"… */
  comprobante: string;
  esNota: boolean;
  puntoVenta: number;
  numero: number;
  numeroCompleto: string;
  /** "Consumidor Final", "DNI 30123456", "CUIT 20-…". */
  cliente: string;
  condicionIva: string;
  /** Importes con signo: las notas de crédito restan. */
  netoCentavos: number;
  ivaCentavos: number;
  totalCentavos: number;
  cae: string;
  vencimientoCae: string;
  /** Pedido del que salió (número del día y fecha). */
  pedidoNumero: number;
  pedidoFecha: string;
}

export interface LibroDeVentas {
  desde: string;
  hasta: string;
  ambiente: AmbienteArca;
  filas: FilaLibro[];
  facturas: number;
  notas: number;
  netoCentavos: number;
  ivaCentavos: number;
  totalCentavos: number;
}
