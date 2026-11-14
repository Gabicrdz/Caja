// PRELOAD: el único puente entre la ventana y el main. Expone `window.caja`
// con funciones concretas; la ventana nunca tiene acceso a ipcRenderer.
import { contextBridge, ipcRenderer } from 'electron';
import { CANALES, type ApiCaja } from '@compartido/api';

const pedir = (canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args);

const api: ApiCaja = {
  sesion: {
    actual: () => pedir(CANALES.sesionActual),
    iniciar: (usuarioId, pin) => pedir(CANALES.sesionIniciar, usuarioId, pin),
    cerrar: () => pedir(CANALES.sesionCerrar),
  },
  usuarios: {
    paraIngresar: () => pedir(CANALES.usuariosParaIngresar),
    crearPrimero: (nombre, pin) => pedir(CANALES.usuariosCrearPrimero, nombre, pin),
    listar: () => pedir(CANALES.usuariosListar),
    guardar: (datos) => pedir(CANALES.usuariosGuardar, datos),
    darDeBaja: (id) => pedir(CANALES.usuariosBaja, id),
  },
  caja: {
    actual: () => pedir(CANALES.cajaActual),
    abrir: (fondoCentavos) => pedir(CANALES.cajaAbrir, { fondoCentavos }),
    movimiento: (datos) => pedir(CANALES.cajaMovimiento, datos),
    cerrar: (datos) => pedir(CANALES.cajaCerrar, datos),
    historial: () => pedir(CANALES.cajaHistorial),
    resumen: (id) => pedir(CANALES.cajaResumen, id),
  },
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
  pedidos: {
    crear: (datos) => pedir(CANALES.pedidoCrear, datos),
    resumenDeHoy: () => pedir(CANALES.pedidoResumenHoy),
    listar: (fecha) => pedir(CANALES.pedidoListar, fecha),
    cambiarEstado: (id, estado) => pedir(CANALES.pedidoEstado, id, estado),
    anular: (id, motivo) => pedir(CANALES.pedidoAnular, id, motivo),
    cobrar: (id, pagos) => pedir(CANALES.pedidoCobrar, id, pagos),
  },
  clientes: {
    buscar: (texto) => pedir(CANALES.clientesBuscar, texto),
    listar: (filtro) => pedir(CANALES.clientesListar, filtro),
    guardar: (datos) => pedir(CANALES.clientesGuardar, datos),
    pedidos: (id) => pedir(CANALES.clientesPedidos, id),
  },
  reportes: {
    obtener: (rango) => pedir(CANALES.reportesObtener, rango),
  },
  libro: {
    obtener: (rango) => pedir(CANALES.libroObtener, rango),
    exportar: (rango) => pedir(CANALES.libroExportar, rango),
  },
  impresion: {
    imprimir: (id, tipo) => pedir(CANALES.impresionImprimir, id, tipo),
    pdf: (id, tipo) => pedir(CANALES.impresionPdf, id, tipo),
    impresoras: () => pedir(CANALES.impresionImpresoras),
  },
  configuracion: {
    obtener: () => pedir(CANALES.configuracionObtener),
    guardarImpresion: (datos) => pedir(CANALES.configuracionImpresion, datos),
    guardarLocal: (datos) => pedir(CANALES.configuracionLocal, datos),
  },
  arca: {
    estado: () => pedir(CANALES.arcaEstado),
    guardar: (datos) => pedir(CANALES.arcaGuardar, datos),
    elegirArchivo: (archivo, ambiente) => pedir(CANALES.arcaElegirArchivo, archivo, ambiente),
    generarPedido: (ambiente, reemplazar) => pedir(CANALES.arcaGenerarPedido, ambiente, reemplazar),
    probar: () => pedir(CANALES.arcaProbar),
  },
  facturacion: {
    estado: () => pedir(CANALES.facturacionEstado),
    facturar: (pedidoId, receptor) => pedir(CANALES.facturacionFacturar, pedidoId, receptor),
    descartarPendiente: (pedidoId) => pedir(CANALES.facturacionDescartar, pedidoId),
  },
  copias: {
    estado: () => pedir(CANALES.copiasEstado),
    exportar: () => pedir(CANALES.copiasExportar),
    elegir: () => pedir(CANALES.copiasElegir),
    restaurar: () => pedir(CANALES.copiasRestaurar),
    abrirCarpeta: () => pedir(CANALES.copiasAbrirCarpeta),
  },
  demo: {
    disponible: () => pedir(CANALES.demoDisponible),
    cargar: () => pedir(CANALES.demoCargar),
  },
  sistema: {
    info: () => pedir(CANALES.sistemaInfo),
  },
};

contextBridge.exposeInMainWorld('caja', api);
