import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { abrirBaseDeDatos, cerrarBaseDeDatos } from '../src/main/db/conexion';
import { MIGRACIONES } from '../src/main/db/migraciones';
import { esquemaCliente, esquemaListarClientes, esquemaPedido } from '../src/compartido/esquemas';
import type { Menu } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { anularPedido, crearPedido } from '../src/main/servicios/pedidos';
import { buscarClientes, guardarCliente, listarClientes, pedidosDeCliente } from '../src/main/servicios/clientes';
import { $, baseNueva } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;

beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
});

// Tostado $5.200 + envío $1.500 = $6.700
const delivery = (telefono: string, nombre: string, direccion: string, dia = 9) =>
  crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'delivery',
      clienteNombre: nombre,
      clienteTelefono: telefono,
      clienteDireccion: direccion,
      envioCentavos: $(1500),
      items: [{ productoId: m.productos.find((p) => p.nombre === 'Tostado de jamón y queso')!.id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' }],
      pagos: [],
      totalEsperadoCentavos: $(6700),
    }),
    new Date(2026, 10, dia, 21, 0),
  );

describe('clientes de delivery', () => {
  it('un pedido con teléfono agenda al cliente; el mismo número (escrito distinto) es el mismo cliente', () => {
    delivery('370 455-6677', 'Lucía', 'Belgrano 845', 8);
    delivery('3704556677', '', 'Belgrano 900', 9); // sin nombre: no pisa "Lucía"
    const lista = listarClientes(db, esquemaListarClientes.parse({}));
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      nombre: 'Lucía',
      telefono: '3704556677',
      direccion: 'Belgrano 900', // la dirección más nueva
      pedidos: 2,
      gastadoCentavos: $(13400),
      ultimoPedido: '2026-11-09',
    });
  });

  it('teléfonos cortos (menos de 6 números) no crean clientes', () => {
    delivery('123', 'Juan', 'Mitre 10');
    expect(listarClientes(db, esquemaListarClientes.parse({}))).toHaveLength(0);
  });

  it('busca por teléfono o por nombre sin importar tildes; los anulados no suman', () => {
    const p = delivery('370 455-6677', 'José Pérez', 'Belgrano 845');
    delivery('370 411-2233', 'María', 'España 120');
    delivery('370 411-2233', 'María', 'España 120');
    expect(buscarClientes(db, '4556').map((c) => c.nombre)).toEqual(['José Pérez']);
    expect(buscarClientes(db, 'jose perez').map((c) => c.nombre)).toEqual(['José Pérez']);
    expect(buscarClientes(db, '370').map((c) => c.nombre)).toEqual(['María', 'José Pérez']); // la que más pide primero
    expect(buscarClientes(db, 'espa').map((c) => c.nombre)).toEqual(['María']); // también por dirección
    expect(buscarClientes(db, 'j')).toEqual([]); // con 1 letra no busca

    anularPedido(db, p.id, 'el cliente canceló');
    const jose = buscarClientes(db, 'jose')[0]!;
    expect(jose).toMatchObject({ pedidos: 0, gastadoCentavos: 0 });
    expect(pedidosDeCliente(db, jose.id)).toMatchObject([{ estado: 'anulado', totalCentavos: $(6700) }]);
  });

  it('ordena la lista por más pedidos o más gastado', () => {
    delivery('3704000001', 'Uno', 'A 1');
    delivery('3704000002', 'Dos', 'B 2');
    delivery('3704000002', 'Dos', 'B 2');
    expect(listarClientes(db, esquemaListarClientes.parse({ orden: 'pedidos' })).map((c) => c.nombre)).toEqual(['Dos', 'Uno']);
  });

  it('editar: no puede quedar con el teléfono de otro cliente', () => {
    delivery('3704000001', 'Uno', 'A 1');
    delivery('3704000002', 'Dos', 'B 2');
    const [dos, uno] = listarClientes(db, esquemaListarClientes.parse({ orden: 'reciente' }));
    expect(() => guardarCliente(db, esquemaCliente.parse({ id: dos!.id, nombre: 'Dos', telefono: '370 400-0001' }))).toThrow(
      'Ese teléfono ya es de otro cliente (Uno)',
    );
    expect(() => esquemaCliente.parse({ id: uno!.id, telefono: '12' })).toThrow('al menos 6 números');
    guardarCliente(db, esquemaCliente.parse({ id: uno!.id, nombre: 'Uno Gómez', telefono: '370 400-0001', direccion: 'A 1', nota: 'Portón verde' }));
    expect(buscarClientes(db, 'gomez')[0]).toMatchObject({ nombre: 'Uno Gómez', telefono: '370 400-0001', nota: 'Portón verde' });
  });

  it('la migración 5 convierte en clientes los pedidos viejos con teléfono', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'caja-'));
    const ruta = path.join(carpeta, 'caja.db');
    try {
      const vieja = new Database(ruta);
      MIGRACIONES.slice(0, 4).forEach((mg, i) => {
        vieja.exec(mg.sql);
        vieja.pragma(`user_version = ${i + 1}`);
      });
      const insertar = vieja.prepare(
        `INSERT INTO pedidos (numero, fecha, hora, tipo, cliente_nombre, cliente_telefono, cliente_direccion, subtotal_centavos, total_centavos)
         VALUES (?, ?, '21:00', 'delivery', ?, ?, ?, 100, 100)`,
      );
      insertar.run(1, '2026-11-07', 'Lu', '370 455-6677', 'Belgrano 845');
      insertar.run(1, '2026-11-08', 'Lucía', '(370) 4556677', 'Belgrano 900');
      insertar.run(2, '2026-11-08', 'Sin tel', '', '');
      vieja.close();

      cerrarBaseDeDatos();
      const base = abrirBaseDeDatos(ruta);
      expect(base.$client.prepare('SELECT telefono_clave, nombre, direccion FROM clientes').all()).toEqual([
        { telefono_clave: '3704556677', nombre: 'Lucía', direccion: 'Belgrano 900' },
      ]);
      expect(base.$client.prepare('SELECT count(*) AS n FROM pedidos WHERE cliente_id IS NOT NULL').get()).toEqual({ n: 2 });
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
