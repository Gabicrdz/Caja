import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { configuracion } from '../db/esquema';
import type { esquemaImpresion } from '@compartido/esquemas';
import type { BaseDeDatos } from '../db/conexion';
import type { Configuracion } from '@compartido/tipos';

export function obtenerConfiguracion(db: BaseDeDatos): Configuracion {
  const valores = new Map(
    db
      .select()
      .from(configuracion)
      .all()
      .map((f) => [f.clave, f.valor]),
  );
  return {
    nombreLocal: valores.get('nombre_local') ?? 'Mi Local',
    envioCentavos: Number(valores.get('envio_centavos') ?? 0),
    impresora: valores.get('impresora') ?? '',
    anchoPapel: valores.get('ancho_papel') === '58' ? 58 : 80,
  };
}

/** Guarda una clave (la crea si no existe: "upsert", como en el gimnasio). */
function guardar(db: BaseDeDatos, clave: string, valor: string): void {
  db.insert(configuracion)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: configuracion.clave, set: { valor: sql`excluded.valor` } })
    .run();
}

export function guardarImpresion(db: BaseDeDatos, datos: z.output<typeof esquemaImpresion>): void {
  db.transaction(() => {
    guardar(db, 'impresora', datos.impresora);
    guardar(db, 'ancho_papel', String(datos.anchoPapel));
  });
}
