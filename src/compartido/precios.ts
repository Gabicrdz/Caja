// Cálculo del precio de un renglón del pedido. Lo usan LAS DOS puntas:
// la ventana (para mostrar el total mientras se arma el pedido) y el main
// (para guardarlo). Como es la misma función, nunca pueden dar distinto.
import type { GrupoAgregados, Menu, Opcion, Producto, Variante } from './tipos';

export interface Seleccion {
  productoId: number;
  varianteId: number | null;
  opcionesIds: number[];
  cantidad: number;
}

export interface Linea {
  producto: Producto;
  variante: Variante | null;
  agregados: { grupo: GrupoAgregados; opcion: Opcion }[];
  /** Precio de una unidad sin agregados (el del tamaño elegido o el único). */
  unitarioCentavos: number;
  /** Lo que suman los agregados de UNA unidad. */
  agregadosCentavos: number;
  totalCentavos: number;
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Para un grupo, cuántas opciones se eligieron y si cumple su regla. */
export function revisarGrupo(grupo: GrupoAgregados, elegidas: number): string | null {
  if (elegidas < grupo.minimo) {
    return grupo.minimo === 1
      ? `Elegí una opción en "${grupo.nombre}".`
      : `Elegí al menos ${grupo.minimo} opciones en "${grupo.nombre}".`;
  }
  if (grupo.maximo !== null && elegidas > grupo.maximo) {
    return grupo.maximo === 1
      ? `En "${grupo.nombre}" se elige una sola opción.`
      : `En "${grupo.nombre}" se eligen hasta ${grupo.maximo} opciones.`;
  }
  return null;
}

export function armarLinea(menu: Pick<Menu, 'productos' | 'grupos'>, s: Seleccion): Resultado<Linea> {
  const producto = menu.productos.find((p) => p.id === s.productoId);
  if (!producto) return { ok: false, error: 'Un producto del pedido ya no está en el menú.' };

  let variante: Variante | null = null;
  if (producto.variantes.length > 0) {
    variante = producto.variantes.find((v) => v.id === s.varianteId) ?? null;
    if (!variante) return { ok: false, error: `Elegí el tamaño de "${producto.nombre}".` };
  } else if (s.varianteId !== null) {
    return { ok: false, error: `"${producto.nombre}" no tiene tamaños.` };
  }

  if (new Set(s.opcionesIds).size !== s.opcionesIds.length) {
    return { ok: false, error: 'Hay un agregado repetido.' };
  }
  const grupos = producto.gruposIds
    .map((id) => menu.grupos.find((g) => g.id === id))
    .filter((g): g is GrupoAgregados => g !== undefined);
  const agregados: Linea['agregados'] = [];
  for (const id of s.opcionesIds) {
    const grupo = grupos.find((g) => g.opciones.some((o) => o.id === id));
    if (!grupo) return { ok: false, error: `Uno de los agregados no corresponde a "${producto.nombre}".` };
    agregados.push({ grupo, opcion: grupo.opciones.find((o) => o.id === id)! });
  }
  for (const grupo of grupos) {
    const error = revisarGrupo(grupo, agregados.filter((a) => a.grupo.id === grupo.id).length);
    if (error) return { ok: false, error };
  }
  // Los agregados quedan en el orden del producto y de cada grupo (no en el
  // orden en que se tocaron), así la comanda sale siempre igual.
  agregados.sort(
    (a, b) =>
      grupos.indexOf(a.grupo) - grupos.indexOf(b.grupo) ||
      a.grupo.opciones.indexOf(a.opcion) - b.grupo.opciones.indexOf(b.opcion),
  );

  const unitarioCentavos = variante ? variante.precioCentavos : producto.precioCentavos;
  const agregadosCentavos = agregados.reduce((suma, a) => suma + a.opcion.precioCentavos, 0);
  return {
    ok: true,
    valor: {
      producto,
      variante,
      agregados,
      unitarioCentavos,
      agregadosCentavos,
      totalCentavos: (unitarioCentavos + agregadosCentavos) * s.cantidad,
    },
  };
}
