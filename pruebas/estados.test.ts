import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abrirBaseDeDatos, cerrarBaseDeDatos, type BaseDeDatos } from '../src/main/db/conexion';
import { MIGRACIONES } from '../src/main/db/migraciones';
import { esquemaPedido, type DatosPedido } from '../src/compartido/esquemas';
import type { Menu } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { anularPedido, cambiarEstado, cobrarPedido, crearPedido, listarPedidos, obtenerPedido, resumenDelDia } from '../src/main/servicios/pedidos';
import { $, baseNueva } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;
const hoy = new Date(2026, 10, 9, 21, 15);
beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
});
const id = (nombre: string) => m.productos.find((p) => p.nombre === nombre)!.id;

function nuevo(extra: Partial<DatosPedido> = {}) {
  // Lomito $13.900 + Gaseosa 1,5 L $3.800 = $17.700
  const gaseosa = m.productos.find((p) => p.nombre === 'Gaseosa')!;
  return crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'mesa',
      mesa: '7',
      items: [
        { productoId: id('Lomito completo'), varianteId: null, opcionesIds: [], cantidad: 1, nota: '' },
        { productoId: gaseosa.id, varianteId: gaseosa.variantes[1]!.id, opcionesIds: [], cantidad: 1, nota: '' },
      ],
      pagos: [],
      totalEsperadoCentavos: $(17700),
      ...extra,
    }),
    hoy,
  );
}

describe('cobrar después', () => {
  it('sin pagos se guarda como "a cobrar" y se cobra más tarde', () => {
    const p = nuevo();
    expect(p).toMatchObject({ numero: 1, cobrado: false, vueltoCentavos: 0 });
    expect(obtenerPedido(db, p.id)).toMatchObject({ cobrado: false, pagos: [], estado: 'pendiente' });
    // Ya cuenta en el día (es una venta), aunque falte cobrarla.
    expect(resumenDelDia(db, hoy).totalCentavos).toBe($(17700));

    expect(() => cobrarPedido(db, p.id, [])).toThrow('Elegí cómo paga');
    expect(() => cobrarPedido(db, p.id, [{ medio: 'efectivo', montoCentavos: $(10000) }])).toThrow('Los pagos suman');
    const r = cobrarPedido(db, p.id, [{ medio: 'efectivo', montoCentavos: $(17700), recibidoCentavos: $(20000) }]);
    expect(r).toMatchObject({ numero: 1, cobrado: true, vueltoCentavos: $(2300) });
    expect(obtenerPedido(db, p.id).pagos).toEqual([{ medio: 'efectivo', montoCentavos: $(17700), recibidoCentavos: $(20000), vueltoCentavos: $(2300) }]);
    expect(() => cobrarPedido(db, p.id, [{ medio: 'qr', montoCentavos: $(17700) }])).toThrow('ya estaba cobrado');
  });
});

describe('estados', () => {
  it('avanza, puede volver un paso, y no se entrega sin cobrar', () => {
    const p = nuevo();
    cambiarEstado(db, p.id, 'en_preparacion');
    cambiarEstado(db, p.id, 'listo');
    expect(() => cambiarEstado(db, p.id, 'entregado')).toThrow('todavía no está cobrado');
    cambiarEstado(db, p.id, 'en_preparacion'); // volver atrás
    expect(obtenerPedido(db, p.id).estado).toBe('en_preparacion');
    cobrarPedido(db, p.id, [{ medio: 'debito', montoCentavos: $(17700) }]);
    cambiarEstado(db, p.id, 'entregado');
    expect(obtenerPedido(db, p.id).estado).toBe('entregado');
  });

  it('anular pide motivo, no borra y deja de sumar en el día', () => {
    const a = nuevo();
    const b = nuevo({ tipo: 'mostrador', mesa: '', pagos: [{ medio: 'efectivo', montoCentavos: $(17700) }] });
    anularPedido(db, a.id, 'El cliente se fue');
    expect(obtenerPedido(db, a.id)).toMatchObject({ estado: 'anulado', motivoAnulacion: 'El cliente se fue' });
    expect(() => anularPedido(db, a.id, 'otra vez')).toThrow('ya estaba anulado');
    expect(() => cambiarEstado(db, a.id, 'listo')).toThrow('está anulado');
    expect(() => cobrarPedido(db, a.id, [{ medio: 'efectivo', montoCentavos: $(17700) }])).toThrow('está anulado');
    expect(resumenDelDia(db, hoy)).toMatchObject({ pedidos: 1, totalCentavos: $(17700) });
    expect(listarPedidos(db, { fecha: '2026-11-09' }).map((p) => [p.numero, p.estado])).toEqual([
      [1, 'anulado'],
      [2, 'pendiente'],
    ]);
    expect(b.cobrado).toBe(true);
  });

  it('el listado trae renglones, agregados y pagos de cada pedido', () => {
    const clasica = m.productos.find((p) => p.nombre === 'Clásica')!;
    const jugosa = m.grupos.flatMap((g) => g.opciones).find((o) => o.nombre === 'Jugosa')!;
    crearPedido(
      db,
      esquemaPedido.parse({
        tipo: 'llevar',
        clienteNombre: 'Mario',
        items: [{ productoId: clasica.id, varianteId: null, opcionesIds: [jugosa.id], cantidad: 2, nota: 'sin sal' }],
        pagos: [{ medio: 'qr', montoCentavos: $(17000) }],
        totalEsperadoCentavos: $(17000),
      }),
      hoy,
    );
    const [p] = listarPedidos(db, { fecha: '2026-11-09' });
    expect(p).toMatchObject({
      numero: 1,
      hora: '21:15',
      tipo: 'llevar',
      clienteNombre: 'Mario',
      cobrado: true,
      items: [{ nombre: 'Clásica', cantidad: 2, nota: 'sin sal', vaACocina: true, agregados: [{ grupoNombre: 'Punto de la carne', nombre: 'Jugosa', precioCentavos: 0 }] }],
      pagos: [{ medio: 'qr', montoCentavos: $(17000) }],
    });
    expect(listarPedidos(db, { fecha: '2026-11-10' })).toEqual([]);
  });
});

describe('migración 3 sobre una base con pedidos', () => {
  it('los pedidos que ya existían quedan como cobrados', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'caja-'));
    const ruta = path.join(carpeta, 'caja.db');
    try {
      // Armamos una base "de la etapa 2" a mano: solo migraciones 1 y 2.
      const vieja = new Database(ruta);
      MIGRACIONES.slice(0, 2).forEach((mg, i) => {
        vieja.exec(mg.sql);
        vieja.pragma(`user_version = ${i + 1}`);
      });
      vieja.exec(`INSERT INTO pedidos (numero, fecha, hora, tipo, subtotal_centavos, total_centavos) VALUES (1, '2026-11-08', '20:00', 'mostrador', 100, 100)`);
      vieja.close();

      cerrarBaseDeDatos();
      const base = abrirBaseDeDatos(ruta);
      expect(base.$client.prepare('SELECT numero, cobrado, motivo_anulacion FROM pedidos').all()).toEqual([
        { numero: 1, cobrado: 1, motivo_anulacion: '' },
      ]);
      expect(base.$client.prepare("SELECT valor FROM configuracion WHERE clave = 'ancho_papel'").get()).toEqual({ valor: '80' });
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
