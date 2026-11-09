// Las mismas tablas de migraciones.ts, descriptas para Drizzle.
// Con esto Drizzle sabe qué columnas hay y de qué tipo son, y TypeScript
// avisa si escribís mal un nombre o mezclás un texto con un número.
import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const ahora = sql`(datetime('now', 'localtime'))`;

export const categorias = sqliteTable('categorias', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const productos = sqliteTable('productos', {
  id: integer('id').primaryKey(),
  categoriaId: integer('categoria_id')
    .notNull()
    .references(() => categorias.id),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion').notNull().default(''),
  codigo: text('codigo'),
  precioCentavos: integer('precio_centavos').notNull(),
  disponible: integer('disponible', { mode: 'boolean' }).notNull().default(true),
  vaACocina: integer('va_a_cocina', { mode: 'boolean' }).notNull().default(true),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  orden: integer('orden').notNull().default(0),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});

export const variantes = sqliteTable('variantes', {
  id: integer('id').primaryKey(),
  productoId: integer('producto_id')
    .notNull()
    .references(() => productos.id),
  nombre: text('nombre').notNull(),
  precioCentavos: integer('precio_centavos').notNull(),
  orden: integer('orden').notNull().default(0),
  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),
});

export const gruposAgregados = sqliteTable('grupos_agregados', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  minimo: integer('minimo').notNull().default(0),
  maximo: integer('maximo'),
  orden: integer('orden').notNull().default(0),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const opcionesAgregado = sqliteTable('opciones_agregado', {
  id: integer('id').primaryKey(),
  grupoId: integer('grupo_id')
    .notNull()
    .references(() => gruposAgregados.id),
  nombre: text('nombre').notNull(),
  precioCentavos: integer('precio_centavos').notNull().default(0),
  orden: integer('orden').notNull().default(0),
  activa: integer('activa', { mode: 'boolean' }).notNull().default(true),
});

export const productoGrupos = sqliteTable(
  'producto_grupos',
  {
    productoId: integer('producto_id')
      .notNull()
      .references(() => productos.id),
    grupoId: integer('grupo_id')
      .notNull()
      .references(() => gruposAgregados.id),
    orden: integer('orden').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productoId, t.grupoId] })],
);

export const configuracion = sqliteTable('configuracion', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});

export const pedidos = sqliteTable('pedidos', {
  id: integer('id').primaryKey(),
  numero: integer('numero').notNull(),
  fecha: text('fecha').notNull(),
  hora: text('hora').notNull(),
  tipo: text('tipo', { enum: ['mostrador', 'llevar', 'delivery', 'mesa'] }).notNull(),
  mesa: text('mesa').notNull().default(''),
  clienteNombre: text('cliente_nombre').notNull().default(''),
  clienteTelefono: text('cliente_telefono').notNull().default(''),
  clienteDireccion: text('cliente_direccion').notNull().default(''),
  nota: text('nota').notNull().default(''),
  subtotalCentavos: integer('subtotal_centavos').notNull(),
  envioCentavos: integer('envio_centavos').notNull().default(0),
  totalCentavos: integer('total_centavos').notNull(),
  estado: text('estado', { enum: ['pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado'] })
    .notNull()
    .default('pendiente'),
  creadoEn: text('creado_en').notNull().default(ahora),
  cobrado: integer('cobrado', { mode: 'boolean' }).notNull().default(true),
  motivoAnulacion: text('motivo_anulacion').notNull().default(''),
  anuladoEn: text('anulado_en'),
  actualizadoEn: text('actualizado_en'),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
  anuladoPor: integer('anulado_por').references(() => usuarios.id),
  clienteId: integer('cliente_id').references(() => clientes.id),
});

export const pedidoItems = sqliteTable('pedido_items', {
  id: integer('id').primaryKey(),
  pedidoId: integer('pedido_id')
    .notNull()
    .references(() => pedidos.id),
  productoId: integer('producto_id')
    .notNull()
    .references(() => productos.id),
  varianteId: integer('variante_id').references(() => variantes.id),
  nombre: text('nombre').notNull(),
  varianteNombre: text('variante_nombre').notNull().default(''),
  cantidad: integer('cantidad').notNull(),
  unitarioCentavos: integer('unitario_centavos').notNull(),
  agregadosCentavos: integer('agregados_centavos').notNull().default(0),
  totalCentavos: integer('total_centavos').notNull(),
  nota: text('nota').notNull().default(''),
  vaACocina: integer('va_a_cocina', { mode: 'boolean' }).notNull().default(true),
  orden: integer('orden').notNull().default(0),
});

export const pedidoItemAgregados = sqliteTable('pedido_item_agregados', {
  id: integer('id').primaryKey(),
  itemId: integer('item_id')
    .notNull()
    .references(() => pedidoItems.id),
  opcionId: integer('opcion_id')
    .notNull()
    .references(() => opcionesAgregado.id),
  grupoNombre: text('grupo_nombre').notNull(),
  nombre: text('nombre').notNull(),
  precioCentavos: integer('precio_centavos').notNull().default(0),
});

export const pagos = sqliteTable('pagos', {
  id: integer('id').primaryKey(),
  pedidoId: integer('pedido_id')
    .notNull()
    .references(() => pedidos.id),
  medio: text('medio', { enum: ['efectivo', 'transferencia', 'debito', 'credito', 'qr'] }).notNull(),
  montoCentavos: integer('monto_centavos').notNull(),
  recibidoCentavos: integer('recibido_centavos').notNull(),
  vueltoCentavos: integer('vuelto_centavos').notNull().default(0),
  creadoEn: text('creado_en').notNull().default(ahora),
  cajaId: integer('caja_id').references(() => cajas.id),
  usuarioId: integer('usuario_id').references(() => usuarios.id),
});

export const usuarios = sqliteTable('usuarios', {
  id: integer('id').primaryKey(),
  nombre: text('nombre').notNull(),
  rol: text('rol', { enum: ['dueno', 'cajero'] }).notNull(),
  pinHash: text('pin_hash').notNull(),
  pinSal: text('pin_sal').notNull(),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: text('creado_en').notNull().default(ahora),
});

export const cajas = sqliteTable('cajas', {
  id: integer('id').primaryKey(),
  abiertaEn: text('abierta_en').notNull(),
  abiertaPor: integer('abierta_por')
    .notNull()
    .references(() => usuarios.id),
  fondoCentavos: integer('fondo_centavos').notNull(),
  cerradaEn: text('cerrada_en'),
  cerradaPor: integer('cerrada_por').references(() => usuarios.id),
  esperadoCentavos: integer('esperado_centavos'),
  contadoCentavos: integer('contado_centavos'),
  diferenciaCentavos: integer('diferencia_centavos'),
  nota: text('nota').notNull().default(''),
});

export const movimientosCaja = sqliteTable('movimientos_caja', {
  id: integer('id').primaryKey(),
  cajaId: integer('caja_id')
    .notNull()
    .references(() => cajas.id),
  tipo: text('tipo', { enum: ['ingreso', 'retiro', 'gasto'] }).notNull(),
  montoCentavos: integer('monto_centavos').notNull(),
  motivo: text('motivo').notNull(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id),
  creadoEn: text('creado_en').notNull(),
});

export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey(),
  telefonoClave: text('telefono_clave').notNull().unique(),
  telefono: text('telefono').notNull(),
  nombre: text('nombre').notNull().default(''),
  direccion: text('direccion').notNull().default(''),
  nota: text('nota').notNull().default(''),
  creadoEn: text('creado_en').notNull().default(ahora),
  actualizadoEn: text('actualizado_en').notNull().default(ahora),
});
