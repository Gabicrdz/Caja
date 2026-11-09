// Reglas de los datos que viajan de la ventana al proceso main.
// Zod las revisa en el main (nunca confiamos en lo que manda la ventana) y
// TypeScript saca de acá los tipos, así la ventana y el main hablan igual.
import { z } from 'zod';

export const PRECIO_MAXIMO = 100_000_000_00; // cien millones de pesos, en centavos

const id = z.number().int().positive();
const texto = (campo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${campo}.`)
    .max(maximo, `${campo[0]?.toUpperCase()}${campo.slice(1)}: máximo ${maximo} caracteres.`);
const textoOpcional = (maximo: number) =>
  z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`).default('');
const precio = z
  .number()
  .int('El precio no puede tener más de dos decimales.')
  .min(0, 'El precio no puede ser negativo.')
  .max(PRECIO_MAXIMO, 'El precio es demasiado grande.');

// ---------- Categorías ----------
export const esquemaCategoria = z.object({
  nombre: texto('el nombre de la categoría', 40),
});
export type DatosCategoria = z.input<typeof esquemaCategoria>;

export const esquemaEditarCategoria = esquemaCategoria.extend({ id });
export const esquemaMoverCategoria = z.object({ id, direccion: z.enum(['arriba', 'abajo']) });
export const esquemaEstadoCategoria = z.object({ id, activa: z.boolean() });

// ---------- Productos ----------
export const esquemaVariante = z.object({
  id: id.optional(),
  nombre: texto('el nombre del tamaño o variante', 30),
  precioCentavos: precio,
});

export const esquemaProducto = z
  .object({
    id: id.optional(),
    categoriaId: id,
    nombre: texto('el nombre del producto', 60),
    descripcion: textoOpcional(140),
    codigo: z
      .string()
      .trim()
      .max(10, 'El código rápido tiene hasta 10 caracteres.')
      .regex(/^[\p{L}\d-]*$/u, 'El código rápido solo lleva letras, números o guiones.')
      .default(''),
    precioCentavos: precio,
    variantes: z.array(esquemaVariante).max(12, 'Hasta 12 tamaños o variantes.').default([]),
    gruposIds: z.array(id).max(10).default([]),
    disponible: z.boolean().default(true),
    vaACocina: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    const vistos = new Set<string>();
    p.variantes.forEach((v, i) => {
      const clave = v.nombre.toLocaleLowerCase('es');
      if (vistos.has(clave)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantes', i, 'nombre'],
          message: 'Ese nombre ya está en la lista.',
        });
      }
      vistos.add(clave);
    });
    if (p.variantes.length === 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['variantes'],
        message: 'Con un solo tamaño no hace falta: usá el precio del producto o agregá otro.',
      });
    }
  });
export type DatosProducto = z.input<typeof esquemaProducto>;

export const esquemaDisponible = z.object({ id, disponible: z.boolean() });
export const esquemaId = z.object({ id });

// ---------- Grupos de agregados ----------
export const esquemaOpcion = z.object({
  id: id.optional(),
  nombre: texto('el nombre de la opción', 40),
  precioCentavos: precio,
});

export const esquemaGrupo = z
  .object({
    id: id.optional(),
    nombre: texto('el nombre del grupo', 40),
    minimo: z.number().int().min(0).max(20),
    maximo: z.number().int().min(1).max(20).nullable(),
    opciones: z
      .array(esquemaOpcion)
      .min(1, 'Agregá al menos una opción.')
      .max(30, 'Hasta 30 opciones por grupo.'),
  })
  .superRefine((g, ctx) => {
    if (g.maximo !== null && g.maximo < g.minimo) {
      ctx.addIssue({
        code: 'custom',
        path: ['maximo'],
        message: 'El máximo no puede ser menor que el mínimo.',
      });
    }
    if (g.minimo > g.opciones.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['minimo'],
        message: 'Pide elegir más opciones de las que hay.',
      });
    }
    const vistos = new Set<string>();
    g.opciones.forEach((o, i) => {
      const clave = o.nombre.toLocaleLowerCase('es');
      if (vistos.has(clave)) {
        ctx.addIssue({
          code: 'custom',
          path: ['opciones', i, 'nombre'],
          message: 'Esa opción ya está en la lista.',
        });
      }
      vistos.add(clave);
    });
  });
export type DatosGrupo = z.input<typeof esquemaGrupo>;
