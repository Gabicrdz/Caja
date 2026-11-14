// El "contrato" entre la ventana y el main: qué se puede pedir y qué devuelve.
// El preload lo implementa y la ventana lo usa con autocompletado.
import type {
  DatosCategoria,
  DatosCerrarCaja,
  DatosCliente,
  DatosListarClientes,
  DatosRango,
  DatosGrupo,
  DatosArca,
  DatosReceptor,
  DatosImpresion,
  DatosLocal,
  DatosMovimiento,
  DatosUsuario,
  DatosPagos,
  DatosPedido,
  DatosProducto,
} from './esquemas';
import type {
  Caja,
  Cliente,
  Configuracion,
  CopiaElegida,
  ComprobanteResumen,
  EstadoArca,
  EstadoFacturacion,
  EstadoCopias,
  EstadoPedido,
  Impresora,
  PasoPruebaArca,
  PedidoCertificado,
  InfoCopia,
  Menu,
  PedidoCreado,
  PedidoDetalle,
  PedidoDeCliente,
  LibroDeVentas,
  Reporte,
  Respuesta,
  ResumenCaja,
  ResumenDelDia,
  TipoImpresion,
  Usuario,
} from './tipos';

export interface ApiCaja {
  sesion: {
    actual(): Promise<Respuesta<Usuario | null>>;
    iniciar(usuarioId: number, pin: string): Promise<Respuesta<Usuario>>;
    cerrar(): Promise<Respuesta<null>>;
  };
  usuarios: {
    /** Para la pantalla de ingreso: nombres y roles (sin PIN). */
    paraIngresar(): Promise<Respuesta<Usuario[]>>;
    /** Solo la primera vez: crea el dueño y entra. */
    crearPrimero(nombre: string, pin: string): Promise<Respuesta<Usuario>>;
    listar(): Promise<Respuesta<Usuario[]>>;
    guardar(datos: DatosUsuario): Promise<Respuesta<number>>;
    darDeBaja(id: number): Promise<Respuesta<null>>;
  };
  caja: {
    /** null = no hay caja abierta. */
    actual(): Promise<Respuesta<ResumenCaja | null>>;
    abrir(fondoCentavos: number): Promise<Respuesta<Caja>>;
    movimiento(datos: DatosMovimiento): Promise<Respuesta<null>>;
    cerrar(datos: DatosCerrarCaja): Promise<Respuesta<ResumenCaja>>;
    historial(): Promise<Respuesta<Caja[]>>;
    resumen(id: number): Promise<Respuesta<ResumenCaja>>;
  };
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
    /** Devuelve la nota de crédito si el pedido tenía factura. */
    anular(id: number, motivo: string): Promise<Respuesta<ComprobanteResumen | null>>;
    cobrar(id: number, pagos: DatosPagos): Promise<Respuesta<PedidoCreado>>;
  };
  clientes: {
    /** Para el delivery: hasta 6 clientes que coinciden por teléfono o nombre. */
    buscar(texto: string): Promise<Respuesta<Cliente[]>>;
    listar(filtro: DatosListarClientes): Promise<Respuesta<Cliente[]>>;
    guardar(datos: DatosCliente): Promise<Respuesta<null>>;
    pedidos(id: number): Promise<Respuesta<PedidoDeCliente[]>>;
  };
  reportes: {
    /** Solo el dueño. Fechas 'AAAA-MM-DD', las dos incluidas. */
    obtener(rango: DatosRango): Promise<Respuesta<Reporte>>;
  };
  libro: {
    /** Solo el dueño: facturas y notas de crédito del período (del ambiente en uso). */
    obtener(rango: DatosRango): Promise<Respuesta<LibroDeVentas>>;
    /** Guarda el Excel en Documentos\Caja\Libro de ventas y lo abre. */
    exportar(rango: DatosRango): Promise<Respuesta<{ ruta: string }>>;
  };
  impresion: {
    /** id = pedido (comanda, ticket) o caja (cierre). impreso = false si se canceló el diálogo. */
    imprimir(id: number, tipo: TipoImpresion): Promise<Respuesta<{ impreso: boolean }>>;
    /** Guarda el PDF en Documentos\Caja\Tickets, lo abre y devuelve la ruta. */
    pdf(id: number, tipo: TipoImpresion): Promise<Respuesta<{ ruta: string }>>;
    impresoras(): Promise<Respuesta<Impresora[]>>;
  };
  configuracion: {
    obtener(): Promise<Respuesta<Configuracion>>;
    guardarImpresion(datos: DatosImpresion): Promise<Respuesta<null>>;
    /** Nombre, dirección, teléfono, mensaje del ticket y envío por defecto. Solo el dueño. */
    guardarLocal(datos: DatosLocal): Promise<Respuesta<null>>;
  };
  /** Facturación electrónica con ARCA (solo el dueño). */
  arca: {
    estado(): Promise<Respuesta<EstadoArca>>;
    guardar(datos: DatosArca): Promise<Respuesta<null>>;
    /** Abre "Elegir archivo"; false si se canceló. Va a la carpeta del ambiente indicado. */
    elegirArchivo(archivo: 'certificado' | 'clave', ambiente: 'homologacion' | 'produccion'): Promise<Respuesta<boolean>>;
    /** Crea la clave y el pedido de certificado (.csr) con los datos guardados y abre la carpeta. */
    generarPedido(ambiente: 'homologacion' | 'produccion', reemplazar: boolean): Promise<Respuesta<PedidoCertificado>>;
    /** Recorre la conexión paso a paso y dice dónde falla. */
    probar(): Promise<Respuesta<PasoPruebaArca[]>>;
  };
  /** Facturar pedidos cobrados con ARCA (dueño y cajero). */
  facturacion: {
    estado(): Promise<Respuesta<EstadoFacturacion>>;
    /** receptor null = el del intento anterior, o consumidor final. */
    facturar(pedidoId: number, receptor: DatosReceptor | null): Promise<Respuesta<ComprobanteResumen>>;
    /** "No quiero facturar este pedido": saca el aviso de pendiente. */
    descartarPendiente(pedidoId: number): Promise<Respuesta<null>>;
  };
  /** Copias de seguridad (solo el dueño). */
  copias: {
    estado(): Promise<Respuesta<EstadoCopias>>;
    /** Abre "Guardar como"; null si se canceló. */
    exportar(): Promise<Respuesta<InfoCopia | null>>;
    /** Abre "Abrir" y revisa el archivo; null si se canceló. */
    elegir(): Promise<Respuesta<CopiaElegida | null>>;
    /** Restaura la copia elegida y reinicia el programa. */
    restaurar(): Promise<Respuesta<null>>;
    abrirCarpeta(): Promise<Respuesta<null>>;
  };
  demo: {
    /** Se puede cargar solo si no hay pedidos. */
    disponible(): Promise<Respuesta<boolean>>;
    cargar(): Promise<Respuesta<{ pedidos: number; dias: number; clientes: number }>>;
  };
  sistema: {
    info(): Promise<Respuesta<{ version: string; baseDeDatos: string }>>;
  };
}

/** Nombre de cada canal IPC: "seccion:accion". */
export const CANALES = {
  sesionActual: 'sesion:actual',
  sesionIniciar: 'sesion:iniciar',
  sesionCerrar: 'sesion:cerrar',
  usuariosParaIngresar: 'usuarios:para-ingresar',
  usuariosCrearPrimero: 'usuarios:crear-primero',
  usuariosListar: 'usuarios:listar',
  usuariosGuardar: 'usuarios:guardar',
  usuariosBaja: 'usuarios:baja',
  cajaActual: 'caja:actual',
  cajaAbrir: 'caja:abrir',
  cajaMovimiento: 'caja:movimiento',
  cajaCerrar: 'caja:cerrar',
  cajaHistorial: 'caja:historial',
  cajaResumen: 'caja:resumen',
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
  clientesBuscar: 'clientes:buscar',
  clientesListar: 'clientes:listar',
  clientesGuardar: 'clientes:guardar',
  clientesPedidos: 'clientes:pedidos',
  reportesObtener: 'reportes:obtener',
  libroObtener: 'libro:obtener',
  libroExportar: 'libro:exportar',
  impresionImprimir: 'impresion:imprimir',
  impresionPdf: 'impresion:pdf',
  impresionImpresoras: 'impresion:impresoras',
  configuracionObtener: 'configuracion:obtener',
  configuracionImpresion: 'configuracion:impresion',
  configuracionLocal: 'configuracion:local',
  copiasEstado: 'copias:estado',
  copiasExportar: 'copias:exportar',
  copiasElegir: 'copias:elegir',
  copiasRestaurar: 'copias:restaurar',
  copiasAbrirCarpeta: 'copias:abrir-carpeta',
  demoDisponible: 'demo:disponible',
  demoCargar: 'demo:cargar',
  arcaEstado: 'arca:estado',
  arcaGuardar: 'arca:guardar',
  arcaElegirArchivo: 'arca:elegir-archivo',
  arcaGenerarPedido: 'arca:generar-pedido',
  arcaProbar: 'arca:probar',
  facturacionEstado: 'facturacion:estado',
  facturacionFacturar: 'facturacion:facturar',
  facturacionDescartar: 'facturacion:descartar',
  sistemaInfo: 'sistema:info',
} as const;
