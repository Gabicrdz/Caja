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
