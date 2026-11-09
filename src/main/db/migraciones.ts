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
  {
    nombre: 'Pedidos, renglones, agregados elegidos y pagos',
    sql: /* sql */ `
      CREATE TABLE pedidos (
        id                 INTEGER PRIMARY KEY,
        numero             INTEGER NOT NULL,              -- número del día: 1, 2, 3…
        fecha              TEXT    NOT NULL,              -- 'AAAA-MM-DD'
        hora               TEXT    NOT NULL,              -- 'HH:MM'
        tipo               TEXT    NOT NULL CHECK (tipo IN ('mostrador', 'llevar', 'delivery', 'mesa')),
        mesa               TEXT    NOT NULL DEFAULT '',
        cliente_nombre     TEXT    NOT NULL DEFAULT '',
        cliente_telefono   TEXT    NOT NULL DEFAULT '',
        cliente_direccion  TEXT    NOT NULL DEFAULT '',
        nota               TEXT    NOT NULL DEFAULT '',
        subtotal_centavos  INTEGER NOT NULL CHECK (subtotal_centavos >= 0),
        envio_centavos     INTEGER NOT NULL DEFAULT 0 CHECK (envio_centavos >= 0),
        total_centavos     INTEGER NOT NULL CHECK (total_centavos >= 0),
        estado             TEXT    NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente', 'en_preparacion', 'listo', 'entregado', 'anulado')),
        creado_en          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        UNIQUE (fecha, numero)
      );

      -- Cada renglón guarda una "foto" de nombres y precios (como en el stock):
      -- si mañana cambia el menú, los pedidos viejos no cambian.
      CREATE TABLE pedido_items (
        id                 INTEGER PRIMARY KEY,
        pedido_id          INTEGER NOT NULL REFERENCES pedidos (id),
        producto_id        INTEGER NOT NULL REFERENCES productos (id),
        variante_id        INTEGER REFERENCES variantes (id),
        nombre             TEXT    NOT NULL,
        variante_nombre    TEXT    NOT NULL DEFAULT '',
        cantidad           INTEGER NOT NULL CHECK (cantidad > 0),
        unitario_centavos  INTEGER NOT NULL CHECK (unitario_centavos >= 0),
        agregados_centavos INTEGER NOT NULL DEFAULT 0 CHECK (agregados_centavos >= 0),
        total_centavos     INTEGER NOT NULL CHECK (total_centavos >= 0),
        nota               TEXT    NOT NULL DEFAULT '',
        va_a_cocina        INTEGER NOT NULL DEFAULT 1 CHECK (va_a_cocina IN (0, 1)),
        orden              INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX pedido_items_por_pedido ON pedido_items (pedido_id, orden);

      CREATE TABLE pedido_item_agregados (
        id               INTEGER PRIMARY KEY,
        item_id          INTEGER NOT NULL REFERENCES pedido_items (id),
        opcion_id        INTEGER NOT NULL REFERENCES opciones_agregado (id),
        grupo_nombre     TEXT    NOT NULL,
        nombre           TEXT    NOT NULL,
        precio_centavos  INTEGER NOT NULL DEFAULT 0 CHECK (precio_centavos >= 0)
      );
      CREATE INDEX agregados_por_item ON pedido_item_agregados (item_id);

      CREATE TABLE pagos (
        id                 INTEGER PRIMARY KEY,
        pedido_id          INTEGER NOT NULL REFERENCES pedidos (id),
        medio              TEXT    NOT NULL CHECK (medio IN ('efectivo', 'transferencia', 'debito', 'credito', 'qr')),
        monto_centavos     INTEGER NOT NULL CHECK (monto_centavos > 0),
        recibido_centavos  INTEGER NOT NULL CHECK (recibido_centavos >= monto_centavos),
        vuelto_centavos    INTEGER NOT NULL DEFAULT 0 CHECK (vuelto_centavos >= 0),
        creado_en          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE INDEX pagos_por_pedido ON pagos (pedido_id);

      INSERT INTO configuracion (clave, valor) VALUES ('envio_centavos', '150000');
    `,
  },
  {
    nombre: 'Pedidos sin cobrar, anulaciones y configuración de impresión',
    sql: /* sql */ `
      -- 1 = cobrado al tomar el pedido; 0 = se cobra al entregar (delivery, mesa…).
      ALTER TABLE pedidos ADD COLUMN cobrado INTEGER NOT NULL DEFAULT 1 CHECK (cobrado IN (0, 1));
      ALTER TABLE pedidos ADD COLUMN motivo_anulacion TEXT NOT NULL DEFAULT '';
      ALTER TABLE pedidos ADD COLUMN anulado_en TEXT;
      ALTER TABLE pedidos ADD COLUMN actualizado_en TEXT;
      CREATE INDEX pedidos_por_fecha_estado ON pedidos (fecha, estado);

      INSERT INTO configuracion (clave, valor) VALUES ('impresora', ''), ('ancho_papel', '80');
    `,
  },
  {
    nombre: 'Usuarios con PIN, cajas (turnos), movimientos de caja y quién hizo cada cosa',
    sql: /* sql */ `
      CREATE TABLE usuarios (
        id         INTEGER PRIMARY KEY,
        nombre     TEXT    NOT NULL,
        rol        TEXT    NOT NULL CHECK (rol IN ('dueno', 'cajero')),
        -- Nunca se guarda el PIN: se guarda un "hash" (scrypt) con su sal.
        pin_hash   TEXT    NOT NULL,
        pin_sal    TEXT    NOT NULL,
        activo     INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
        creado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );
      CREATE UNIQUE INDEX usuarios_nombre_unico ON usuarios (nombre COLLATE NOCASE) WHERE activo = 1;

      CREATE TABLE cajas (
        id                   INTEGER PRIMARY KEY,
        abierta_en           TEXT    NOT NULL,      -- 'AAAA-MM-DD HH:MM:SS'
        abierta_por          INTEGER NOT NULL REFERENCES usuarios (id),
        fondo_centavos       INTEGER NOT NULL CHECK (fondo_centavos >= 0),
        cerrada_en           TEXT,
        cerrada_por          INTEGER REFERENCES usuarios (id),
        esperado_centavos    INTEGER,
        contado_centavos     INTEGER CHECK (contado_centavos IS NULL OR contado_centavos >= 0),
        diferencia_centavos  INTEGER,
        nota                 TEXT    NOT NULL DEFAULT ''
      );
      -- Índice único "parcial": como mucho UNA caja sin cerrar.
      CREATE UNIQUE INDEX una_sola_caja_abierta ON cajas ((cerrada_en IS NULL)) WHERE cerrada_en IS NULL;

      CREATE TABLE movimientos_caja (
        id              INTEGER PRIMARY KEY,
        caja_id         INTEGER NOT NULL REFERENCES cajas (id),
        tipo            TEXT    NOT NULL CHECK (tipo IN ('ingreso', 'retiro', 'gasto')),
        monto_centavos  INTEGER NOT NULL CHECK (monto_centavos > 0),
        motivo          TEXT    NOT NULL,
        usuario_id      INTEGER NOT NULL REFERENCES usuarios (id),
        creado_en       TEXT    NOT NULL
      );
      CREATE INDEX movimientos_por_caja ON movimientos_caja (caja_id);

      ALTER TABLE pedidos ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
      ALTER TABLE pedidos ADD COLUMN anulado_por INTEGER REFERENCES usuarios (id);
      ALTER TABLE pagos ADD COLUMN caja_id INTEGER REFERENCES cajas (id);
      ALTER TABLE pagos ADD COLUMN usuario_id INTEGER REFERENCES usuarios (id);
      CREATE INDEX pagos_por_caja ON pagos (caja_id);
    `,
  },
  {
    nombre: 'Clientes (agenda de delivery) y pedidos asociados a cada cliente',
    sql: /* sql */ `
      CREATE TABLE clientes (
        id              INTEGER PRIMARY KEY,
        -- Solo los números del teléfono: "370 455-6677" y "3704556677" son el mismo cliente.
        telefono_clave  TEXT    NOT NULL UNIQUE,
        telefono        TEXT    NOT NULL,      -- como lo escribieron la última vez
        nombre          TEXT    NOT NULL DEFAULT '',
        direccion       TEXT    NOT NULL DEFAULT '',
        nota            TEXT    NOT NULL DEFAULT '',  -- referencias: "portón verde", "tocar timbre 2"
        creado_en       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER REFERENCES clientes (id);
      CREATE INDEX pedidos_por_cliente ON pedidos (cliente_id);

      -- Los pedidos que ya había con teléfono pasan a ser clientes (el dato más nuevo gana).
      CREATE TEMP TABLE telefonos_viejos AS
        SELECT id, fecha, hora, cliente_telefono, cliente_nombre, cliente_direccion,
               replace(replace(replace(replace(replace(replace(cliente_telefono, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') AS clave
        FROM pedidos
        WHERE cliente_telefono <> '';
      INSERT INTO clientes (telefono_clave, telefono, nombre, direccion)
        SELECT t.clave, t.cliente_telefono, t.cliente_nombre, t.cliente_direccion
        FROM telefonos_viejos t
        WHERE length(t.clave) >= 6
          AND t.id = (SELECT t2.id FROM telefonos_viejos t2 WHERE t2.clave = t.clave ORDER BY t2.fecha DESC, t2.hora DESC, t2.id DESC LIMIT 1);
      UPDATE pedidos SET cliente_id = (
        SELECT c.id FROM telefonos_viejos t JOIN clientes c ON c.telefono_clave = t.clave WHERE t.id = pedidos.id
      ) WHERE cliente_telefono <> '';
      DROP TABLE telefonos_viejos;
    `,
  },
];
