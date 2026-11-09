// Clientes de delivery: una "agenda" que se arma sola. Cada vez que se guarda
// un pedido con teléfono, el cliente se crea o se actualiza (nombre y
// dirección más nuevos). La clave es el teléfono SOLO con números, así
// "370 455-6677" y "3704556677" son la misma persona.
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { BaseDeDatos } from '../db/conexion';
import { clientes } from '../db/esquema';
import { claveTelefono, MINIMO_TELEFONO, type esquemaCliente, type esquemaListarClientes } from '@compartido/esquemas';
import type { Cliente, PedidoDeCliente } from '@compartido/tipos';
import { ErrorDeUsuario } from './errores';
import { momentoLocal } from './fechas';

type Tx = Parameters<Parameters<BaseDeDatos['transaction']>[0]>[0];
type Consultable = Pick<BaseDeDatos, '$client'>;

/** "José Pérez" → "jose perez" (para buscar sin importar tildes ni mayúsculas). */
function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Lo llama crearPedido dentro de SU transacción: si el pedido falla, el
 * cliente tampoco se guarda. Devuelve el id, o null si no hay teléfono útil.
 */
export function registrarClienteDePedido(
  tx: Tx,
  datos: { telefono: string; nombre: string; direccion: string },
  ahora: Date,
): number | null {
  const clave = claveTelefono(datos.telefono);
  if (clave.length < MINIMO_TELEFONO) return null;
  const existente = tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.telefonoClave, clave)).get();
  if (existente) {
    // Lo que venga vacío no pisa lo que ya teníamos.
    tx.update(clientes)
      .set({
        telefono: datos.telefono,
        ...(datos.nombre ? { nombre: datos.nombre } : {}),
        ...(datos.direccion ? { direccion: datos.direccion } : {}),
        actualizadoEn: momentoLocal(ahora),
      })
      .where(eq(clientes.id, existente.id))
      .run();
    return existente.id;
  }
  return tx
    .insert(clientes)
    .values({ telefonoClave: clave, telefono: datos.telefono, nombre: datos.nombre, direccion: datos.direccion })
    .returning({ id: clientes.id })
    .get().id;
}

// Una sola consulta para la lista y la búsqueda: cada cliente con sus
// pedidos, lo que gastó (sin anulados) y la fecha del último pedido.
const SQL_CLIENTES = /* sql */ `
  SELECT c.id, c.nombre, c.telefono, c.telefono_clave AS clave, c.direccion, c.nota,
         count(p.id)                       AS pedidos,
         coalesce(sum(p.total_centavos), 0) AS gastadoCentavos,
         max(p.fecha)                      AS ultimoPedido
  FROM clientes c
  LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado <> 'anulado'
  GROUP BY c.id
`;
type FilaCliente = Cliente & { clave: string };

function todos(db: Consultable): FilaCliente[] {
  return db.$client.prepare(SQL_CLIENTES).all() as FilaCliente[];
}

function coincide(c: FilaCliente, texto: string): boolean {
  const numeros = claveTelefono(texto);
  // "370" busca por teléfono; "juan" busca por nombre o dirección.
  if (numeros.length >= 3 && numeros.length === texto.replace(/[\s\-()+.]/g, '').length) return c.clave.includes(numeros);
  const t = sinTildes(texto);
  return sinTildes(c.nombre).includes(t) || sinTildes(c.direccion).includes(t);
}

const sinClave = ({ clave: _clave, ...c }: FilaCliente): Cliente => c;

/** Para autocompletar en Vender: los que más piden primero. */
export function buscarClientes(db: Consultable, texto: string): Cliente[] {
  const limpio = texto.trim();
  if (limpio.length < 2) return [];
  return todos(db)
    .filter((c) => coincide(c, limpio))
    .sort((a, b) => b.pedidos - a.pedidos || (b.ultimoPedido ?? '').localeCompare(a.ultimoPedido ?? ''))
    .slice(0, 6)
    .map(sinClave);
}

export function listarClientes(db: Consultable, filtro: z.output<typeof esquemaListarClientes>): Cliente[] {
  const lista = filtro.texto ? todos(db).filter((c) => coincide(c, filtro.texto)) : todos(db);
  const orden: Record<typeof filtro.orden, (a: Cliente, b: Cliente) => number> = {
    reciente: (a, b) => (b.ultimoPedido ?? '').localeCompare(a.ultimoPedido ?? '') || b.id - a.id,
    pedidos: (a, b) => b.pedidos - a.pedidos || b.gastadoCentavos - a.gastadoCentavos,
    gastado: (a, b) => b.gastadoCentavos - a.gastadoCentavos || b.pedidos - a.pedidos,
  };
  return lista.sort(orden[filtro.orden]).map(sinClave);
}

export function guardarCliente(db: BaseDeDatos, datos: z.output<typeof esquemaCliente>, ahora: Date = new Date()): void {
  const clave = claveTelefono(datos.telefono);
  const otro = db.select({ id: clientes.id, nombre: clientes.nombre }).from(clientes).where(eq(clientes.telefonoClave, clave)).get();
  if (otro && otro.id !== datos.id) {
    throw new ErrorDeUsuario(`Ese teléfono ya es de otro cliente${otro.nombre ? ` (${otro.nombre})` : ''}.`);
  }
  const r = db
    .update(clientes)
    .set({
      telefonoClave: clave,
      telefono: datos.telefono,
      nombre: datos.nombre,
      direccion: datos.direccion,
      nota: datos.nota,
      actualizadoEn: momentoLocal(ahora),
    })
    .where(eq(clientes.id, datos.id))
    .run();
  if (r.changes === 0) throw new ErrorDeUsuario('Ese cliente ya no existe.');
}

/** Los últimos 20 pedidos de un cliente (incluye anulados, marcados). */
export function pedidosDeCliente(db: Consultable, clienteId: number): PedidoDeCliente[] {
  return db.$client
    .prepare(
      /* sql */ `SELECT id, numero, fecha, hora, tipo, estado, total_centavos AS totalCentavos, cliente_direccion AS direccion
                FROM pedidos WHERE cliente_id = ? ORDER BY fecha DESC, hora DESC, id DESC LIMIT 20`,
    )
    .all(clienteId) as PedidoDeCliente[];
}
