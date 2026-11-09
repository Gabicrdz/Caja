// El pedido que se está armando vive en un "store" de Zustand: un estado
// global chiquito que pueden leer y cambiar varias partes de la pantalla
// (la grilla agrega, el panel muestra, el cobro vacía) sin pasarse props.
import { create } from 'zustand';
import type { TipoPedido } from '@compartido/tipos';

export interface ItemCarrito {
  /** Identifica el renglón dentro del carrito (no es un id de la base). */
  clave: string;
  productoId: number;
  varianteId: number | null;
  opcionesIds: number[];
  cantidad: number;
  nota: string;
}

export type NuevoItem = Omit<ItemCarrito, 'clave'>;

interface DatosPedido {
  tipo: TipoPedido;
  mesa: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteDireccion: string;
  /** null = el costo de envío por defecto de la configuración. */
  envioCentavos: number | null;
}

interface EstadoCarrito extends DatosPedido {
  items: ItemCarrito[];
  /** Último renglón agregado o cambiado (para resaltarlo un momento). */
  ultimaClave: string | null;
  agregar: (item: NuevoItem) => void;
  reemplazar: (clave: string, item: NuevoItem) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  quitar: (clave: string) => void;
  cambiarDatos: (datos: Partial<DatosPedido>) => void;
  vaciar: () => void;
}

const DATOS_INICIALES: DatosPedido = {
  tipo: 'mostrador',
  mesa: '',
  clienteNombre: '',
  clienteTelefono: '',
  clienteDireccion: '',
  envioCentavos: null,
};

let contador = 0;
const nuevaClave = () => `r${Date.now()}-${++contador}`;

/** Dos renglones son "el mismo" si piden exactamente lo mismo. */
function mismoArmado(a: NuevoItem, b: NuevoItem): boolean {
  return (
    a.productoId === b.productoId &&
    a.varianteId === b.varianteId &&
    a.nota.trim() === b.nota.trim() &&
    a.opcionesIds.length === b.opcionesIds.length &&
    [...a.opcionesIds].sort((x, y) => x - y).every((id, i) => id === [...b.opcionesIds].sort((x, y) => x - y)[i])
  );
}

const CANTIDAD_MAXIMA = 99;

export const useCarrito = create<EstadoCarrito>()((set) => ({
  ...DATOS_INICIALES,
  items: [],
  ultimaClave: null,

  agregar: (item) =>
    set((estado) => {
      const igual = estado.items.find((i) => mismoArmado(i, item));
      if (igual) {
        // Mismo producto armado igual: sumamos la cantidad en vez de otro renglón.
        const cantidad = Math.min(CANTIDAD_MAXIMA, igual.cantidad + item.cantidad);
        return {
          items: estado.items.map((i) => (i.clave === igual.clave ? { ...i, cantidad } : i)),
          ultimaClave: igual.clave,
        };
      }
      const clave = nuevaClave();
      return { items: [...estado.items, { ...item, clave }], ultimaClave: clave };
    }),

  reemplazar: (clave, item) =>
    set((estado) => ({
      items: estado.items.map((i) => (i.clave === clave ? { ...item, clave } : i)),
      ultimaClave: clave,
    })),

  cambiarCantidad: (clave, cantidad) =>
    set((estado) => ({
      items:
        cantidad <= 0
          ? estado.items.filter((i) => i.clave !== clave)
          : estado.items.map((i) => (i.clave === clave ? { ...i, cantidad: Math.min(CANTIDAD_MAXIMA, cantidad) } : i)),
      ultimaClave: clave,
    })),

  quitar: (clave) => set((estado) => ({ items: estado.items.filter((i) => i.clave !== clave) })),

  cambiarDatos: (datos) => set(datos),

  vaciar: () => set({ ...DATOS_INICIALES, items: [], ultimaClave: null }),
}));
