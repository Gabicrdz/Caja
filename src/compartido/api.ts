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
  EstadoArca,
  EstadoCopias,
  EstadoPedido,
  Impresora,
  PasoPruebaArca,
  InfoCopia,
  Menu,
  PedidoCreado,
  PedidoDetalle,
  PedidoDeCliente,
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
    anular(id: number, motivo: string): Promise<Respuesta<null>>;
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
    /** Recorre la conexión paso a paso y dice dónde falla. */
    probar(): Promise<Respuesta<PasoPruebaArca[]>>;
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
  arcaProbar: 'arca:probar',
  sistemaInfo: 'sistema:info',
} as const;
