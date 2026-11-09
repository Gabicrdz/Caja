// Todo lo del menú: categorías, productos (con tamaños/variantes) y grupos de
// agregados. Estas funciones reciben datos YA validados por Zod (ver ipc.ts).
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import {
  categorias,
  gruposAgregados,
  opcionesAgregado,
  productoGrupos,
  productos,
  variantes,
} from '../db/esquema';
import type { esquemaGrupo, esquemaProducto } from '@compartido/esquemas';
import type { Categoria, GrupoAgregados, Menu, Producto } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';

type ProductoValidado = z.output<typeof esquemaProducto>;
type GrupoValidado = z.output<typeof esquemaGrupo>;
type Tx = Parameters<Parameters<BaseDeDatos['transaction']>[0]>[0];

const ahora = sql`(datetime('now', 'localtime'))`;
const mismoNombre = (columna: typeof categorias.nombre, nombre: string) =>
  sql`${columna} = ${nombre} COLLATE NOCASE`;

// ───────────────────────── Lectura ─────────────────────────

/** Lee el menú completo. Sirve con la base o dentro de una transacción. */
export function obtenerMenu(db: Pick<BaseDeDatos, 'select'>): Menu {
  const filasCategorias = db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      orden: categorias.orden,
      activa: categorias.activa,
      // Subconsulta "correlacionada": cuenta los productos de ESTA categoría.
      // Se escribe categorias.id a mano porque Drizzle, dentro de un select,
      // pone solo "id" y SQLite lo confundiría con el id de productos.
      cantidadProductos: sql<number>`(
        SELECT count(*) FROM productos p
        WHERE p.categoria_id = categorias.id AND p.activo = 1)`,
    })
    .from(categorias)
    .orderBy(asc(categorias.orden), asc(categorias.id))
    .all();

  const filasProductos = db
    .select()
    .from(productos)
    .where(eq(productos.activo, true))
    // Primero por el orden de su categoría, después por el orden dentro de ella.
    .orderBy(
      sql`(SELECT c.orden FROM categorias c WHERE c.id = productos.categoria_id)`,
      asc(productos.categoriaId),
      asc(productos.orden),
      asc(productos.id),
    )
    .all();

  const filasVariantes = db
    .select()
    .from(variantes)
    .where(eq(variantes.activa, true))
    .orderBy(asc(variantes.orden), asc(variantes.id))
    .all();

  const filasRelaciones = db
    .select()
    .from(productoGrupos)
    .orderBy(asc(productoGrupos.orden))
    .all();

  const filasGrupos = db
    .select({
      id: gruposAgregados.id,
      nombre: gruposAgregados.nombre,
      minimo: gruposAgregados.minimo,
      maximo: gruposAgregados.maximo,
      cantidadProductos: sql<number>`(
        SELECT count(*) FROM producto_grupos pg
        JOIN productos p ON p.id = pg.producto_id AND p.activo = 1
        WHERE pg.grupo_id = grupos_agregados.id)`,
    })
    .from(gruposAgregados)
    .where(eq(gruposAgregados.activo, true))
    .orderBy(asc(gruposAgregados.orden), asc(gruposAgregados.id))
    .all();

  const filasOpciones = db
    .select()
    .from(opcionesAgregado)
    .where(eq(opcionesAgregado.activa, true))
    .orderBy(asc(opcionesAgregado.orden), asc(opcionesAgregado.id))
    .all();

  const resultadoCategorias: Categoria[] = filasCategorias.map((c) => ({
    ...c,
    cantidadProductos: Number(c.cantidadProductos),
  }));

  const resultadoProductos: Producto[] = filasProductos.map((p) => ({
    id: p.id,
    categoriaId: p.categoriaId,
    nombre: p.nombre,
    descripcion: p.descripcion,
    codigo: p.codigo ?? '',
    precioCentavos: p.precioCentavos,
    disponible: p.disponible,
    vaACocina: p.vaACocina,
    variantes: filasVariantes
      .filter((v) => v.productoId === p.id)
      .map((v) => ({ id: v.id, nombre: v.nombre, precioCentavos: v.precioCentavos })),
    gruposIds: filasRelaciones.filter((r) => r.productoId === p.id).map((r) => r.grupoId),
  }));

  const resultadoGrupos: GrupoAgregados[] = filasGrupos.map((g) => ({
    ...g,
    cantidadProductos: Number(g.cantidadProductos),
    opciones: filasOpciones
      .filter((o) => o.grupoId === g.id)
      .map((o) => ({ id: o.id, nombre: o.nombre, precioCentavos: o.precioCentavos })),
  }));

  return {
    categorias: resultadoCategorias,
    productos: resultadoProductos,
    grupos: resultadoGrupos,
  };
}

// ───────────────────────── Categorías ─────────────────────────

function verificarNombreCategoria(tx: Tx, nombre: string, excepto?: number): void {
  const repetida = tx
    .select({ id: categorias.id, activa: categorias.activa })
    .from(categorias)
    .where(
      and(
        mismoNombre(categorias.nombre, nombre),
        excepto ? ne(categorias.id, excepto) : undefined,
      ),
    )
    .get();
  if (repetida) {
    throw new ErrorDeUsuario(
      repetida.activa
        ? `Ya hay una categoría que se llama "${nombre}".`
        : `Ya hay una categoría oculta que se llama "${nombre}". Mostrala de nuevo en vez de crear otra.`,
    );
  }
}

function buscarCategoria(tx: Tx, id: number) {
  const fila = tx.select().from(categorias).where(eq(categorias.id, id)).get();
  if (!fila) throw new ErrorDeUsuario('Esa categoría ya no existe.');
  return fila;
}

export function crearCategoria(db: BaseDeDatos, nombre: string): number {
  return db.transaction((tx) => {
    verificarNombreCategoria(tx, nombre);
    const { siguiente } = tx
      .select({ siguiente: sql<number>`coalesce(max(${categorias.orden}), 0) + 1` })
      .from(categorias)
      .get()!;
    const nueva = tx
      .insert(categorias)
      .values({ nombre, orden: Number(siguiente) })
      .returning({ id: categorias.id })
      .get();
    return nueva.id;
  });
}

export function renombrarCategoria(db: BaseDeDatos, id: number, nombre: string): void {
  db.transaction((tx) => {
    buscarCategoria(tx, id);
    verificarNombreCategoria(tx, nombre, id);
    tx.update(categorias).set({ nombre }).where(eq(categorias.id, id)).run();
  });
}

/** Sube o baja una categoría un lugar (cambia el orden en que se muestran). */
export function moverCategoria(
  db: BaseDeDatos,
  id: number,
  direccion: 'arriba' | 'abajo',
): void {
  db.transaction((tx) => {
    buscarCategoria(tx, id);
    const ids = tx
      .select({ id: categorias.id })
      .from(categorias)
      .orderBy(asc(categorias.orden), asc(categorias.id))
      .all()
      .map((c) => c.id);
    const desde = ids.indexOf(id);
    const hasta = direccion === 'arriba' ? desde - 1 : desde + 1;
    if (hasta < 0 || hasta >= ids.length) return; // ya está en la punta
    [ids[desde], ids[hasta]] = [ids[hasta]!, ids[desde]!];
    // Renumeramos todo (1, 2, 3…) así el orden queda siempre prolijo.
    ids.forEach((idCategoria, i) => {
      tx.update(categorias).set({ orden: i + 1 }).where(eq(categorias.id, idCategoria)).run();
    });
  });
}

/** Ocultar una categoría no borra sus productos: solo dejan de aparecer para vender. */
export function cambiarEstadoCategoria(db: BaseDeDatos, id: number, activa: boolean): void {
  db.transaction((tx) => {
    buscarCategoria(tx, id);
    tx.update(categorias).set({ activa }).where(eq(categorias.id, id)).run();
  });
}

// ───────────────────────── Productos ─────────────────────────

function buscarProducto(tx: Tx, id: number) {
  const fila = tx
    .select()
    .from(productos)
    .where(and(eq(productos.id, id), eq(productos.activo, true)))
    .get();
  if (!fila) throw new ErrorDeUsuario('Ese producto ya no existe.');
  return fila;
}

export function guardarProducto(db: BaseDeDatos, datos: ProductoValidado): number {
  return db.transaction((tx) => {
    const anterior = datos.id ? buscarProducto(tx, datos.id) : null;
    buscarCategoria(tx, datos.categoriaId);
    const codigo = datos.codigo === '' ? null : datos.codigo;

    const mismoNombreEnCategoria = tx
      .select({ id: productos.id })
      .from(productos)
      .where(
        and(
          eq(productos.activo, true),
          eq(productos.categoriaId, datos.categoriaId),
          sql`${productos.nombre} = ${datos.nombre} COLLATE NOCASE`,
          anterior ? ne(productos.id, anterior.id) : undefined,
        ),
      )
      .get();
    if (mismoNombreEnCategoria) {
      throw new ErrorDeUsuario(`Ya hay un producto "${datos.nombre}" en esa categoría.`);
    }

    if (codigo) {
      const conMismoCodigo = tx
        .select({ nombre: productos.nombre })
        .from(productos)
        .where(
          and(
            eq(productos.activo, true),
            sql`${productos.codigo} = ${codigo} COLLATE NOCASE`,
            anterior ? ne(productos.id, anterior.id) : undefined,
          ),
        )
        .get();
      if (conMismoCodigo) {
        throw new ErrorDeUsuario(
          `El código "${codigo}" ya lo usa "${conMismoCodigo.nombre}".`,
        );
      }
    }

    if (datos.gruposIds.length > 0) {
      const existentes = tx
        .select({ id: gruposAgregados.id })
        .from(gruposAgregados)
        .where(and(inArray(gruposAgregados.id, datos.gruposIds), eq(gruposAgregados.activo, true)))
        .all();
      if (existentes.length !== new Set(datos.gruposIds).size) {
        throw new ErrorDeUsuario('Uno de los grupos de agregados ya no existe. Actualizá la pantalla.');
      }
    }

    // Con tamaños, el precio del producto es el más barato ("desde $…").
    const precioCentavos =
      datos.variantes.length > 0
        ? Math.min(...datos.variantes.map((v) => v.precioCentavos))
        : datos.precioCentavos;

    const valores = {
      categoriaId: datos.categoriaId,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      codigo,
      precioCentavos,
      disponible: datos.disponible,
      vaACocina: datos.vaACocina,
    };

    let productoId: number;
    if (anterior) {
      productoId = anterior.id;
      const cambiaDeCategoria = anterior.categoriaId !== datos.categoriaId;
      tx.update(productos)
        .set({
          ...valores,
          actualizadoEn: ahora,
          ...(cambiaDeCategoria ? { orden: siguienteOrden(tx, datos.categoriaId) } : {}),
        })
        .where(eq(productos.id, productoId))
        .run();
    } else {
      productoId = tx
        .insert(productos)
        .values({ ...valores, orden: siguienteOrden(tx, datos.categoriaId) })
        .returning({ id: productos.id })
        .get().id;
    }

    guardarVariantes(tx, productoId, datos.variantes);

    tx.delete(productoGrupos).where(eq(productoGrupos.productoId, productoId)).run();
    datos.gruposIds.forEach((grupoId, orden) => {
      tx.insert(productoGrupos).values({ productoId, grupoId, orden }).run();
    });

    return productoId;
  });
}

function siguienteOrden(tx: Tx, categoriaId: number): number {
  const fila = tx
    .select({ siguiente: sql<number>`coalesce(max(${productos.orden}), 0) + 1` })
    .from(productos)
    .where(eq(productos.categoriaId, categoriaId))
    .get();
  return Number(fila?.siguiente ?? 1);
}

/**
 * Las variantes que ya existían se ACTUALIZAN (conservan su id) y las que se
 * quitaron se desactivan en vez de borrarse: más adelante los pedidos van a
 * apuntar a ellas y no queremos romper el historial.
 */
function guardarVariantes(
  tx: Tx,
  productoId: number,
  lista: ProductoValidado['variantes'],
): void {
  const actuales = tx
    .select({ id: variantes.id })
    .from(variantes)
    .where(and(eq(variantes.productoId, productoId), eq(variantes.activa, true)))
    .all()
    .map((v) => v.id);

  lista.forEach((v, orden) => {
    if (v.id !== undefined) {
      if (!actuales.includes(v.id)) {
        throw new ErrorDeUsuario('Uno de los tamaños ya no existe. Actualizá la pantalla.');
      }
      tx.update(variantes)
        .set({ nombre: v.nombre, precioCentavos: v.precioCentavos, orden })
        .where(eq(variantes.id, v.id))
        .run();
    } else {
      tx.insert(variantes)
        .values({ productoId, nombre: v.nombre, precioCentavos: v.precioCentavos, orden })
        .run();
    }
  });

  const quedan = new Set(lista.map((v) => v.id).filter((id) => id !== undefined));
  const quitar = actuales.filter((id) => !quedan.has(id));
  if (quitar.length > 0) {
    tx.update(variantes).set({ activa: false }).where(inArray(variantes.id, quitar)).run();
  }
}

/** "Agotado por hoy": el producto sigue en el menú pero no se puede vender. */
export function cambiarDisponible(db: BaseDeDatos, id: number, disponible: boolean): void {
  db.transaction((tx) => {
    buscarProducto(tx, id);
    tx.update(productos)
      .set({ disponible, actualizadoEn: ahora })
      .where(eq(productos.id, id))
      .run();
  });
}

export function duplicarProducto(db: BaseDeDatos, id: number): number {
  const menu = obtenerMenu(db);
  const original = menu.productos.find((p) => p.id === id);
  if (!original) throw new ErrorDeUsuario('Ese producto ya no existe.');
  const usados = new Set(
    menu.productos
      .filter((p) => p.categoriaId === original.categoriaId)
      .map((p) => p.nombre.toLocaleLowerCase('es')),
  );
  let nombre = `${original.nombre} (copia)`;
  for (let n = 2; usados.has(nombre.toLocaleLowerCase('es')); n++) {
    nombre = `${original.nombre} (copia ${n})`;
  }
  return guardarProducto(db, {
    categoriaId: original.categoriaId,
    nombre: nombre.slice(0, 60),
    descripcion: original.descripcion,
    codigo: '',
    precioCentavos: original.precioCentavos,
    variantes: original.variantes.map(({ nombre: n, precioCentavos }) => ({
      nombre: n,
      precioCentavos,
    })),
    gruposIds: original.gruposIds,
    disponible: original.disponible,
    vaACocina: original.vaACocina,
  });
}

/** Baja lógica: el producto desaparece del menú, pero queda guardado. */
export function darDeBajaProducto(db: BaseDeDatos, id: number): void {
  db.transaction((tx) => {
    buscarProducto(tx, id);
    tx.update(productos)
      .set({ activo: false, actualizadoEn: ahora })
      .where(eq(productos.id, id))
      .run();
  });
}

// ───────────────────────── Grupos de agregados ─────────────────────────

export function guardarGrupo(db: BaseDeDatos, datos: GrupoValidado): number {
  return db.transaction((tx) => {
    if (datos.id) {
      const existe = tx
        .select({ id: gruposAgregados.id })
        .from(gruposAgregados)
        .where(and(eq(gruposAgregados.id, datos.id), eq(gruposAgregados.activo, true)))
        .get();
      if (!existe) throw new ErrorDeUsuario('Ese grupo ya no existe.');
    }
    const repetido = tx
      .select({ id: gruposAgregados.id })
      .from(gruposAgregados)
      .where(
        and(
          eq(gruposAgregados.activo, true),
          sql`${gruposAgregados.nombre} = ${datos.nombre} COLLATE NOCASE`,
          datos.id ? ne(gruposAgregados.id, datos.id) : undefined,
        ),
      )
      .get();
    if (repetido) throw new ErrorDeUsuario(`Ya hay un grupo que se llama "${datos.nombre}".`);

    const valores = { nombre: datos.nombre, minimo: datos.minimo, maximo: datos.maximo };
    let grupoId: number;
    if (datos.id) {
      grupoId = datos.id;
      tx.update(gruposAgregados).set(valores).where(eq(gruposAgregados.id, grupoId)).run();
    } else {
      const { siguiente } = tx
        .select({ siguiente: sql<number>`coalesce(max(${gruposAgregados.orden}), 0) + 1` })
        .from(gruposAgregados)
        .get()!;
      grupoId = tx
        .insert(gruposAgregados)
        .values({ ...valores, orden: Number(siguiente) })
        .returning({ id: gruposAgregados.id })
        .get().id;
    }

    const actuales = tx
      .select({ id: opcionesAgregado.id })
      .from(opcionesAgregado)
      .where(and(eq(opcionesAgregado.grupoId, grupoId), eq(opcionesAgregado.activa, true)))
      .all()
      .map((o) => o.id);
    datos.opciones.forEach((o, orden) => {
      if (o.id !== undefined) {
        if (!actuales.includes(o.id)) {
          throw new ErrorDeUsuario('Una de las opciones ya no existe. Actualizá la pantalla.');
        }
        tx.update(opcionesAgregado)
          .set({ nombre: o.nombre, precioCentavos: o.precioCentavos, orden })
          .where(eq(opcionesAgregado.id, o.id))
          .run();
      } else {
        tx.insert(opcionesAgregado)
          .values({ grupoId, nombre: o.nombre, precioCentavos: o.precioCentavos, orden })
          .run();
      }
    });
    const quedan = new Set(datos.opciones.map((o) => o.id).filter((id) => id !== undefined));
    const quitar = actuales.filter((id) => !quedan.has(id));
    if (quitar.length > 0) {
      tx.update(opcionesAgregado)
        .set({ activa: false })
        .where(inArray(opcionesAgregado.id, quitar))
        .run();
    }
    return grupoId;
  });
}

/** Da de baja el grupo y lo saca de los productos que lo usaban. */
export function darDeBajaGrupo(db: BaseDeDatos, id: number): void {
  db.transaction((tx) => {
    const existe = tx
      .select({ id: gruposAgregados.id })
      .from(gruposAgregados)
      .where(and(eq(gruposAgregados.id, id), eq(gruposAgregados.activo, true)))
      .get();
    if (!existe) throw new ErrorDeUsuario('Ese grupo ya no existe.');
    tx.update(gruposAgregados).set({ activo: false }).where(eq(gruposAgregados.id, id)).run();
    tx.delete(productoGrupos).where(eq(productoGrupos.grupoId, id)).run();
  });
}
