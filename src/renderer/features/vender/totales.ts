import { useMemo } from 'react';
import { armarLinea, type Linea } from '@compartido/precios';
import type { Menu } from '@compartido/tipos';
import type { ItemCarrito } from './carrito';

export interface RenglonCalculado {
  item: ItemCarrito;
  linea: Linea | null;
  /** Si el menú cambió y el renglón ya no se puede vender, por qué. */
  problema: string | null;
}

/** Calcula cada renglón y los totales con la MISMA función que usa el main. */
export function useTotales(
  menu: Menu | undefined,
  items: ItemCarrito[],
  tipo: string,
  envioCentavos: number,
) {
  return useMemo(() => {
    const renglones: RenglonCalculado[] = items.map((item) => {
      if (!menu) return { item, linea: null, problema: null };
      const r = armarLinea(menu, item);
      if (!r.ok) return { item, linea: null, problema: r.error };
      if (!r.valor.producto.disponible) {
        return { item, linea: r.valor, problema: `${r.valor.producto.nombre} se agotó.` };
      }
      return { item, linea: r.valor, problema: null };
    });
    const subtotalCentavos = renglones.reduce((s, r) => s + (r.linea?.totalCentavos ?? 0), 0);
    const envio = tipo === 'delivery' ? envioCentavos : 0;
    const unidades = items.reduce((s, i) => s + i.cantidad, 0);
    return {
      renglones,
      subtotalCentavos,
      envioCentavos: envio,
      totalCentavos: subtotalCentavos + envio,
      unidades,
      hayProblemas: renglones.some((r) => r.problema !== null),
    };
  }, [menu, items, tipo, envioCentavos]);
}
