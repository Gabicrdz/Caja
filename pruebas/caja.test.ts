import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPedido } from '../src/compartido/esquemas';
import type { Menu, Usuario } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { anularPedido, cobrarPedido, crearPedido } from '../src/main/servicios/pedidos';
import { abrirCaja, cajaAbierta, cerrarCaja, historialDeCajas, registrarMovimiento, resumenDeCaja } from '../src/main/servicios/caja';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { htmlCierre } from '../src/main/impresion/plantillas';
import { $, baseNueva } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;
let dueno: Usuario;
let cajera: Usuario;
const t = (h: number, min = 0) => new Date(2026, 10, 9, h, min);

beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
  dueno = { id: guardarUsuario(db, { nombre: 'Sergio', rol: 'dueno', pin: '1234' }), nombre: 'Sergio', rol: 'dueno' };
  cajera = { id: guardarUsuario(db, { nombre: 'Ana', rol: 'cajero', pin: '5678' }), nombre: 'Ana', rol: 'cajero' };
});

// Tostado $5.200 · Lomito $13.900
const pedido = (nombre: string, total: number, pagos: { medio: string; montoCentavos: number; recibidoCentavos?: number }[], quien = cajera) =>
  crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'mostrador',
      items: [{ productoId: m.productos.find((p) => p.nombre === nombre)!.id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' }],
      pagos,
      totalEsperadoCentavos: total,
    }),
    t(12),
    quien.id,
  );

describe('caja', () => {
  it('sin caja abierta no se cobra (pero se puede guardar para cobrar después)', () => {
    expect(() => pedido('Tostado de jamón y queso', $(5200), [{ medio: 'efectivo', montoCentavos: $(5200) }])).toThrow('La caja está cerrada');
    const p = pedido('Tostado de jamón y queso', $(5200), []);
    expect(p.cobrado).toBe(false);
    expect(() => cobrarPedido(db, p.id, [{ medio: 'qr', montoCentavos: $(5200) }])).toThrow('La caja está cerrada');
  });

  it('solo una caja abierta a la vez', () => {
    abrirCaja(db, $(20000), cajera, t(8));
    expect(() => abrirCaja(db, 0, dueno, t(9))).toThrow('Ya hay una caja abierta');
    expect(cajaAbierta(db)).toMatchObject({ abiertaPor: 'Ana', fondoCentavos: $(20000), abiertaEn: '2026-11-09 08:00:00', cerradaEn: null });
  });

  it('arqueo: fondo + efectivo + ingresos − retiros − gastos, sin pedidos anulados', () => {
    const caja = abrirCaja(db, $(20000), cajera, t(8));
    pedido('Lomito completo', $(13900), [{ medio: 'efectivo', montoCentavos: $(13900), recibidoCentavos: $(20000) }]); // vuelto 6.100: entra 13.900
    pedido('Tostado de jamón y queso', $(5200), [{ medio: 'debito', montoCentavos: $(5200) }]);
    pedido('Tostado de jamón y queso', $(5200), [
      { medio: 'efectivo', montoCentavos: $(2000) },
      { medio: 'transferencia', montoCentavos: $(3200) },
    ]);
    const anulado = pedido('Lomito completo', $(13900), [{ medio: 'efectivo', montoCentavos: $(13900) }]);
    anularPedido(db, anulado.id, 'Se cargó dos veces', dueno.id);
    pedido('Tostado de jamón y queso', $(5200), []); // a cobrar

    registrarMovimiento(db, { tipo: 'ingreso', montoCentavos: $(5000), motivo: 'Más cambio' }, cajera, t(13));
    registrarMovimiento(db, { tipo: 'gasto', montoCentavos: $(3500), motivo: 'Pan' }, cajera, t(14));
    expect(() => registrarMovimiento(db, { tipo: 'retiro', montoCentavos: $(1000), motivo: 'x' }, cajera)).toThrow('solo el dueño');
    registrarMovimiento(db, { tipo: 'retiro', montoCentavos: $(10000), motivo: 'Depósito' }, dueno, t(15));
    expect(() => registrarMovimiento(db, { tipo: 'gasto', montoCentavos: $(999999), motivo: 'Mucho' }, dueno)).toThrow('no alcanza');

    const r = resumenDeCaja(db, caja.id);
    expect(r.porMedio.efectivo).toEqual({ cobros: 2, montoCentavos: $(15900) });
    expect(r.porMedio.debito).toEqual({ cobros: 1, montoCentavos: $(5200) });
    expect(r.porMedio.transferencia).toEqual({ cobros: 1, montoCentavos: $(3200) });
    expect([r.ventasCentavos, r.pedidosCobrados, r.pedidosAnulados]).toEqual([$(24300), 3, 1]);
    expect(r.sinCobrar).toEqual({ cantidad: 1, totalCentavos: $(5200) });
    expect([r.ingresosCentavos, r.retirosCentavos, r.gastosCentavos]).toEqual([$(5000), $(10000), $(3500)]);
    // 20.000 + 15.900 + 5.000 − 10.000 − 3.500 = 27.400
    expect(r.efectivoEsperadoCentavos).toBe($(27400));
    expect(r.movimientos.map((x) => [x.tipo, x.usuario, x.hora])).toEqual([
      ['ingreso', 'Ana', '13:00'],
      ['gasto', 'Ana', '14:00'],
      ['retiro', 'Sergio', '15:00'],
    ]);

    // Se guarda quién hizo cada cosa
    expect(db.$client.prepare('SELECT DISTINCT usuario_id FROM pedidos').all()).toEqual([{ usuario_id: cajera.id }]);
    expect(db.$client.prepare('SELECT anulado_por FROM pedidos WHERE id = ?').get(anulado.id)).toEqual({ anulado_por: dueno.id });

    // Cierre con faltante de $400
    const cierre = cerrarCaja(db, { contadoCentavos: $(27000), nota: 'Faltan 400' }, cajera, t(23, 30));
    expect(cierre.caja).toMatchObject({ cerradaPor: 'Ana', cerradaEn: '2026-11-09 23:30:00', esperadoCentavos: $(27400), contadoCentavos: $(27000), diferenciaCentavos: -$(400), nota: 'Faltan 400' });
    expect(cajaAbierta(db)).toBeNull();
    expect(() => cerrarCaja(db, { contadoCentavos: 0, nota: '' }, cajera)).toThrow('No hay una caja abierta');
    expect(historialDeCajas(db).map((c) => c.id)).toEqual([caja.id]);

    // Los cobros de la caja siguiente no se mezclan
    const otra = abrirCaja(db, $(15000), dueno, new Date(2026, 10, 10, 8));
    expect(resumenDeCaja(db, otra.id).efectivoEsperadoCentavos).toBe($(15000));

    // El cierre impreso
    const texto = htmlCierre(cierre, 'La Esquina', 80).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(texto).toContain('CIERRE DE CAJA');
    expect(texto).toContain('Efectivo esperado $ 27.400');
    expect(texto).toContain('Contado $ 27.000');
    expect(texto).toContain('Faltante $ 400');
    expect(texto).toContain('Débito (1) $ 5.200');
  });
});
