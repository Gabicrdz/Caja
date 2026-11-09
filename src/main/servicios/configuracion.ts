import { configuracion } from '../db/esquema';
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
  };
}
