import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { configuracion } from '../db/esquema';
import type { esquemaArca, esquemaImpresion, esquemaLocal } from '@compartido/esquemas';
import type { BaseDeDatos } from '../db/conexion';
import type { Configuracion, EstadoArca } from '@compartido/tipos';

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
    direccionLocal: valores.get('direccion_local') ?? '',
    telefonoLocal: valores.get('telefono_local') ?? '',
    pieTicket: valores.get('pie_ticket') ?? '',
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

/** Nombre, dirección y teléfono (salen en el ticket) y el envío por defecto. */
export function guardarLocal(db: BaseDeDatos, datos: z.output<typeof esquemaLocal>): void {
  db.transaction(() => {
    guardar(db, 'nombre_local', datos.nombreLocal);
    guardar(db, 'direccion_local', datos.direccionLocal);
    guardar(db, 'telefono_local', datos.telefonoLocal);
    guardar(db, 'pie_ticket', datos.pieTicket);
    guardar(db, 'envio_centavos', String(datos.envioCentavos));
  });
}

// ── Facturación con ARCA ──
// Acá solo van los datos comunes. El certificado y la clave NO se guardan en la base:
// quedan como archivos en AppData\Roaming\caja\arca (ver main/arca/almacen.ts).
export type DatosArcaGuardados = Omit<EstadoArca, 'tieneCertificado' | 'tieneClave' | 'vencimientoCertificado'>;

export function obtenerDatosArca(db: BaseDeDatos): DatosArcaGuardados {
  const valores = new Map(
    db
      .select()
      .from(configuracion)
      .all()
      .map((f) => [f.clave, f.valor]),
  );
  const punto = Number(valores.get('arca_punto_venta') ?? 1);
  return {
    activa: valores.get('arca_activa') === '1',
    ambiente: valores.get('arca_ambiente') === 'produccion' ? 'produccion' : 'homologacion',
    cuit: valores.get('arca_cuit') ?? '',
    puntoVenta: Number.isInteger(punto) && punto > 0 ? punto : 1,
    condicionIva: valores.get('arca_condicion_iva') === 'responsable_inscripto' ? 'responsable_inscripto' : 'monotributo',
  };
}

export function guardarDatosArca(db: BaseDeDatos, datos: z.output<typeof esquemaArca>): void {
  db.transaction(() => {
    guardar(db, 'arca_activa', datos.activa ? '1' : '0');
    guardar(db, 'arca_ambiente', datos.ambiente);
    guardar(db, 'arca_cuit', datos.cuit);
    guardar(db, 'arca_punto_venta', String(datos.puntoVenta));
    guardar(db, 'arca_condicion_iva', datos.condicionIva);
  });
}
