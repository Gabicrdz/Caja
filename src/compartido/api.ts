// El "contrato" entre la ventana y el main: qué se puede pedir y qué devuelve.
// El preload lo implementa y la ventana lo usa con autocompletado.
import type {
  DatosCategoria,
  DatosGrupo,
  DatosImpresion,
  DatosPagos,
  DatosPedido,
  DatosProducto,
} from './esquemas';
import type {
  Configuracion,
  EstadoPedido,
  Impresora,
  Menu,
  PedidoCreado,
  PedidoDetalle,
  Respuesta,
  ResumenDelDia,
  TipoImpresion,
} from './tipos';

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
  pedidos: {
    crear(datos: DatosPedido): Promise<Respuesta<PedidoCreado>>;
    resumenDeHoy(): Promise<Respuesta<ResumenDelDia>>;
    /** fecha 'AAAA-MM-DD'. */
    listar(fecha: string): Promise<Respuesta<PedidoDetalle[]>>;
    cambiarEstado(id: number, estado: Exclude<EstadoPedido, 'anulado'>): Promise<Respuesta<null>>;
    anular(id: number, motivo: string): Promise<Respuesta<null>>;
    cobrar(id: number, pagos: DatosPagos): Promise<Respuesta<PedidoCreado>>;
  };
  impresion: {
    /** impreso = false si se canceló el diálogo de Windows. */
    imprimir(id: number, tipo: TipoImpresion): Promise<Respuesta<{ impreso: boolean }>>;
    /** Guarda el PDF en Documentos\Caja\Tickets, lo abre y devuelve la ruta. */
    pdf(id: number, tipo: TipoImpresion): Promise<Respuesta<{ ruta: string }>>;
    impresoras(): Promise<Respuesta<Impresora[]>>;
  };
  configuracion: {
    obtener(): Promise<Respuesta<Configuracion>>;
    guardarImpresion(datos: DatosImpresion): Promise<Respuesta<null>>;
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
  pedidoCrear: 'pedidos:crear',
  pedidoResumenHoy: 'pedidos:resumen-hoy',
  pedidoListar: 'pedidos:listar',
  pedidoEstado: 'pedidos:estado',
  pedidoAnular: 'pedidos:anular',
  pedidoCobrar: 'pedidos:cobrar',
  impresionImprimir: 'impresion:imprimir',
  impresionPdf: 'impresion:pdf',
  impresionImpresoras: 'impresion:impresoras',
  configuracionObtener: 'configuracion:obtener',
  configuracionImpresion: 'configuracion:impresion',
  sistemaInfo: 'sistema:info',
} as const;
