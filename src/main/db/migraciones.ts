// Migraciones: cada cambio a la estructura de la base es un paso nuevo al final
// de esta lista. NUNCA se edita un paso que ya se aplicó en una computadora:
// si hay que cambiar algo, se agrega otro paso. La base guarda en
// PRAGMA user_version cuántos pasos ya tiene aplicados (igual que en el stock).
//
// esquema.ts describe estas mismas tablas para Drizzle. Si agregás una
// columna acá, agregala también allá (una prueba avisa si no coinciden).

export interface Migracion {
  nombre: string;
  sql: string;
}

export const MIGRACIONES: Migracion[] = [
  {
    nombre: 'Menú: categorías, productos, variantes y agregados',
    sql: /* sql */ `
      CREATE TABLE categorias (
        id         INTEGER PRIMARY KEY,
        nombre     TEXT    NOT NULL COLLATE NOCASE UNIQUE,
        orden      INTEGER NOT NULL DEFAULT 0,
        activa     INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
        creado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE productos (
        id               INTEGER PRIMARY KEY,
        categoria_id     INTEGER NOT NULL REFERENCES categorias (id),
        nombre           TEXT    NOT NULL,
        descripcion      TEXT    NOT NULL DEFAULT '',
        codigo           TEXT    COLLATE NOCASE,
        precio_centavos  INTEGER NOT NULL CHECK (precio_centavos >= 0),
        disponible       INTEGER NOT NULL DEFAULT 1 CHECK (disponible IN (0, 1)),
        va_a_cocina      INTEGER NOT NULL DEFAULT 1 CHECK (va_a_cocina IN (0, 1)),
        activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        orden            INTEGER NOT NULL DEFAULT 0,
        creado_en        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX productos_por_categoria ON productos (categoria_id, orden);
      -- El código rápido y el nombre no se repiten entre los productos activos
      -- (índices "parciales": los dados de baja no cuentan).
      CREATE UNIQUE INDEX productos_codigo_unico
        ON productos (codigo) WHERE codigo IS NOT NULL AND activo = 1;
      CREATE UNIQUE INDEX productos_nombre_unico
        ON productos (categoria_id, nombre COLLATE NOCASE) WHERE activo = 1;

      CREATE TABLE variantes (
        id               INTEGER PRIMARY KEY,
        producto_id      INTEGER NOT NULL REFERENCES productos (id),
        nombre           TEXT    NOT NULL,
        precio_centavos  INTEGER NOT NULL CHECK (precio_centavos >= 0),
        orden            INTEGER NOT NULL DEFAULT 0,
        activa           INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
      );
      CREATE INDEX variantes_por_producto ON variantes (producto_id, orden);

      CREATE TABLE grupos_agregados (
        id         INTEGER PRIMARY KEY,
        nombre     TEXT    NOT NULL,
        minimo     INTEGER NOT NULL DEFAULT 0 CHECK (minimo >= 0),
        maximo     INTEGER CHECK (maximo IS NULL OR maximo >= minimo),
        orden      INTEGER NOT NULL DEFAULT 0,
        activo     INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE UNIQUE INDEX grupos_nombre_unico
        ON grupos_agregados (nombre COLLATE NOCASE) WHERE activo = 1;

      CREATE TABLE opciones_agregado (
        id               INTEGER PRIMARY KEY,
        grupo_id         INTEGER NOT NULL REFERENCES grupos_agregados (id),
        nombre           TEXT    NOT NULL,
        precio_centavos  INTEGER NOT NULL DEFAULT 0 CHECK (precio_centavos >= 0),
        orden            INTEGER NOT NULL DEFAULT 0,
        activa           INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
      );
      CREATE INDEX opciones_por_grupo ON opciones_agregado (grupo_id, orden);

      CREATE TABLE producto_grupos (
        producto_id  INTEGER NOT NULL REFERENCES productos (id),
        grupo_id     INTEGER NOT NULL REFERENCES grupos_agregados (id),
        orden        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (producto_id, grupo_id)
      ) WITHOUT ROWID;

      CREATE TABLE configuracion (
        clave  TEXT PRIMARY KEY,
        valor  TEXT NOT NULL
      );
      INSERT INTO configuracion (clave, valor) VALUES ('nombre_local', 'Mi Local');
    `,
  },
];
