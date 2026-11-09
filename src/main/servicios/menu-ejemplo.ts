// Un menú de ejemplo para un local de comidas "de todo un poco".
// Sirve para mostrar el sistema en una demo y para las pruebas. Se carga con
// el botón "Cargar menú de ejemplo" cuando el menú está vacío.
import type { BaseDeDatos } from '../db/conexion';
import { ErrorDeUsuario } from './errores';
import { and, eq, sql } from 'drizzle-orm';
import { crearCategoria, guardarGrupo, guardarProducto } from './menu';
import { categorias, gruposAgregados, productos } from '../db/esquema';

const $ = (pesos: number) => Math.round(pesos * 100);

const GRUPOS = [
  {
    clave: 'punto',
    nombre: 'Punto de la carne',
    minimo: 1,
    maximo: 1,
    opciones: [['Jugosa', 0], ['A punto', 0], ['Bien cocida', 0]],
  },
  {
    clave: 'extras',
    nombre: 'Extras de hamburguesa',
    minimo: 0,
    maximo: null,
    opciones: [['Cheddar', 900], ['Panceta', 1300], ['Huevo', 700], ['Medallón extra', 2800]],
  },
  {
    clave: 'sin',
    nombre: 'Sacar ingredientes',
    minimo: 0,
    maximo: null,
    opciones: [['Sin cebolla', 0], ['Sin tomate', 0], ['Sin lechuga', 0], ['Sin aderezos', 0]],
  },
  {
    clave: 'guarnicion',
    nombre: 'Guarnición',
    minimo: 1,
    maximo: 1,
    opciones: [['Papas fritas', 0], ['Puré', 0], ['Ensalada mixta', 0], ['Papas a caballo', 1500]],
  },
  {
    clave: 'leche',
    nombre: 'Leche',
    minimo: 0,
    maximo: 1,
    opciones: [['Leche descremada', 0], ['Leche vegetal', 600]],
  },
] as const;

type ClaveGrupo = (typeof GRUPOS)[number]['clave'];

interface ProductoEjemplo {
  nombre: string;
  descripcion?: string;
  codigo?: string;
  precio?: number;
  variantes?: [string, number][];
  grupos?: ClaveGrupo[];
  cocina?: boolean;
}

const MENU: [string, ProductoEjemplo[]][] = [
  [
    'Hamburguesas',
    [
      { nombre: 'Clásica', descripcion: 'Medallón, lechuga, tomate y queso', codigo: 'H1', precio: 8500, grupos: ['punto', 'extras', 'sin'] },
      { nombre: 'Doble cheddar', descripcion: 'Dos medallones, cheddar y panceta', codigo: 'H2', precio: 11800, grupos: ['punto', 'extras', 'sin'] },
      { nombre: 'Veggie', descripcion: 'Medallón de lentejas y vegetales grillados', codigo: 'H3', precio: 9200, grupos: ['extras', 'sin'] },
    ],
  ],
  [
    'Lomitos y sándwiches',
    [
      { nombre: 'Lomito completo', descripcion: 'Lomo, jamón, queso, huevo, lechuga y tomate', codigo: 'L1', precio: 13900, grupos: ['sin'] },
      { nombre: 'Sándwich de milanesa', descripcion: 'Carne o pollo, completo', codigo: 'L2', precio: 11500, grupos: ['sin'] },
      { nombre: 'Tostado de jamón y queso', codigo: 'L3', precio: 5200 },
    ],
  ],
  [
    'Pizzas',
    [
      { nombre: 'Muzzarella', codigo: 'P1', variantes: [['Chica', 8000], ['Grande', 12000]] },
      { nombre: 'Especial', descripcion: 'Jamón, morrón y huevo', codigo: 'P2', variantes: [['Chica', 9500], ['Grande', 14500]] },
      { nombre: 'Napolitana', codigo: 'P3', variantes: [['Chica', 9000], ['Grande', 13800]] },
    ],
  ],
  [
    'Empanadas',
    [
      { nombre: 'Empanada de carne', codigo: 'E1', variantes: [['Unidad', 1300], ['Media docena', 7200], ['Docena', 13500]] },
      { nombre: 'Empanada de pollo', codigo: 'E2', variantes: [['Unidad', 1300], ['Media docena', 7200], ['Docena', 13500]] },
      { nombre: 'Empanada de jamón y queso', codigo: 'E3', variantes: [['Unidad', 1300], ['Media docena', 7200], ['Docena', 13500]] },
    ],
  ],
  [
    'Minutas',
    [
      { nombre: 'Milanesa napolitana', codigo: 'M1', precio: 12500, grupos: ['guarnicion'] },
      { nombre: 'Suprema de pollo', codigo: 'M2', precio: 11000, grupos: ['guarnicion'] },
      { nombre: 'Papas fritas', codigo: 'M3', variantes: [['Porción', 4500], ['Para compartir', 7800]] },
    ],
  ],
  [
    'Bebidas',
    [
      { nombre: 'Gaseosa', codigo: 'B1', variantes: [['500 ml', 2000], ['1,5 L', 3800]], cocina: false },
      { nombre: 'Agua mineral', codigo: 'B2', variantes: [['500 ml', 1600], ['1,5 L', 2800]], cocina: false },
      { nombre: 'Cerveza lata 473 ml', codigo: 'B3', precio: 3200, cocina: false },
      { nombre: 'Jugo exprimido', codigo: 'B4', precio: 3500 },
    ],
  ],
  [
    'Cafetería',
    [
      { nombre: 'Café', codigo: 'C1', variantes: [['Chico', 1900], ['Jarrito', 2400], ['Doble', 3000]], grupos: ['leche'] },
      { nombre: 'Medialuna', codigo: 'C2', precio: 900 },
      { nombre: 'Tostadas con manteca y mermelada', codigo: 'C3', precio: 3600 },
    ],
  ],
  [
    'Postres',
    [
      { nombre: 'Flan casero', descripcion: 'Con dulce de leche o crema', codigo: 'D1', precio: 4200 },
      { nombre: 'Helado', codigo: 'D2', variantes: [['1/4 kg', 5500], ['1/2 kg', 9800]], cocina: false },
    ],
  ],
];

/**
 * Se puede cargar mientras no haya PRODUCTOS. Si ya existen categorías o
 * grupos con el mismo nombre (por ejemplo "Pizzas"), se reutilizan en vez
 * de duplicarlos.
 */
export function cargarMenuDeEjemplo(db: BaseDeDatos): void {
  const hayProductos = db
    .select({ id: productos.id })
    .from(productos)
    .where(eq(productos.activo, true))
    .limit(1)
    .get();
  if (hayProductos) {
    throw new ErrorDeUsuario('El menú ya tiene productos. El ejemplo solo se carga en un menú sin productos.');
  }
  db.transaction(() => {
    const ids = new Map<ClaveGrupo, number>();
    for (const g of GRUPOS) {
      const existente = db
        .select({ id: gruposAgregados.id })
        .from(gruposAgregados)
        .where(and(eq(gruposAgregados.activo, true), sql`${gruposAgregados.nombre} = ${g.nombre} COLLATE NOCASE`))
        .get();
      ids.set(
        g.clave,
        existente?.id ??
          guardarGrupo(db, {
            nombre: g.nombre,
            minimo: g.minimo,
            maximo: g.maximo,
            opciones: g.opciones.map(([nombre, precio]) => ({ nombre, precioCentavos: $(precio) })),
          }),
      );
    }
    for (const [nombreCategoria, lista] of MENU) {
      const existente = db
        .select({ id: categorias.id })
        .from(categorias)
        .where(sql`${categorias.nombre} = ${nombreCategoria} COLLATE NOCASE`)
        .get();
      if (existente) db.update(categorias).set({ activa: true }).where(eq(categorias.id, existente.id)).run();
      const categoriaId = existente?.id ?? crearCategoria(db, nombreCategoria);
      for (const p of lista) {
        guardarProducto(db, {
          categoriaId,
          nombre: p.nombre,
          descripcion: p.descripcion ?? '',
          codigo: p.codigo ?? '',
          precioCentavos: $(p.precio ?? 0),
          variantes: (p.variantes ?? []).map(([nombre, precio]) => ({
            nombre,
            precioCentavos: $(precio),
          })),
          gruposIds: (p.grupos ?? []).map((clave) => ids.get(clave)!),
          disponible: true,
          vaACocina: p.cocina ?? true,
        });
      }
    }
  });
}
