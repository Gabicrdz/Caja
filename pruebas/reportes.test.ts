import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPedido, esquemaRango } from '../src/compartido/esquemas';
import type { Menu, Usuario } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { anularPedido, crearPedido } from '../src/main/servicios/pedidos';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { abrirCaja } from '../src/main/servicios/caja';
import { diasEntre, obtenerReporte, sumarDias } from '../src/main/servicios/reportes';
import { $, baseNueva } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;
let dueno: Usuario;
let ana: Usuario;

beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
  dueno = { id: guardarUsuario(db, { nombre: 'Sergio', rol: 'dueno', pin: '1234' }), nombre: 'Sergio', rol: 'dueno' };
  ana = { id: guardarUsuario(db, { nombre: 'Ana', rol: 'cajero', pin: '5678' }), nombre: 'Ana', rol: 'cajero' };
  abrirCaja(db, 0, dueno, new Date(2026, 10, 1, 8));
});

const producto = (nombre: string) => m.productos.find((p) => p.nombre === nombre)!.id;
const item = (nombre: string, cantidad = 1) => ({ productoId: producto(nombre), varianteId: null, opcionesIds: [], cantidad, nota: '' });

/** Un pedido el día `dia` de noviembre a la hora `hora`. */
function pedido(
  dia: number,
  hora: number,
  items: ReturnType<typeof item>[],
  total: number,
  extra: { medio?: string; tipo?: string; quien?: Usuario; telefono?: string; cobrar?: boolean } = {},
) {
  const tipo = extra.tipo ?? 'mostrador';
  return crearPedido(
    db,
    esquemaPedido.parse({
      tipo,
      mesa: tipo === 'mesa' ? '3' : '',
      clienteTelefono: extra.telefono ?? '',
      clienteDireccion: tipo === 'delivery' ? 'Belgrano 845' : '',
      envioCentavos: tipo === 'delivery' ? $(1500) : 0,
      items,
      pagos: extra.cobrar === false ? [] : [{ medio: extra.medio ?? 'efectivo', montoCentavos: total }],
      totalEsperadoCentavos: total,
    }),
    new Date(2026, 10, dia, hora, 15),
    (extra.quien ?? ana).id,
  );
}

const rango = (desde: string, hasta: string) => esquemaRango.parse({ desde, hasta });

describe('reportes', () => {
  it('cuentas de fechas', () => {
    expect(sumarDias('2026-11-01', -1)).toBe('2026-10-31');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasEntre('2026-11-01', '2026-11-07')).toBe(7);
    expect(() => rango('2026-11-09', '2026-11-01')).toThrow('anterior');
    expect(() => rango('2025-01-01', '2026-11-01')).toThrow('hasta 366 días');
  });

  it('totales, ticket promedio, anulados y "a cobrar"', () => {
    pedido(2, 12, [item('Tostado de jamón y queso', 2)], $(10400)); // ana, efectivo
    pedido(3, 21, [item('Lomito completo')], $(13900), { medio: 'qr', quien: dueno });
    pedido(3, 21, [item('Flan casero')], $(4200), { cobrar: false }); // a cobrar: es venta
    const anulado = pedido(3, 22, [item('Lomito completo')], $(13900));
    anularPedido(db, anulado.id, 'se equivocó');
    pedido(9, 12, [item('Flan casero')], $(4200)); // fuera del rango

    const r = obtenerReporte(db, rango('2026-11-01', '2026-11-07'));
    expect(r).toMatchObject({
      dias: 7,
      pedidos: 3,
      ventasCentavos: $(28500),
      ticketPromedioCentavos: $(9500),
      anulados: { cantidad: 1, totalCentavos: $(13900) },
      sinCobrar: { cantidad: 1, totalCentavos: $(4200) },
    });
    expect(r.porDia).toHaveLength(7);
    expect(r.porDia.map((d) => d.ventasCentavos)).toEqual([0, $(10400), $(18100), 0, 0, 0, 0]);
    expect(r.porHora[21]).toEqual({ hora: 21, pedidos: 2, ventasCentavos: $(18100) });
    expect(r.porHora[22]!.pedidos).toBe(0); // el anulado no cuenta
    // Medios: solo lo cobrado (el flan "a cobrar" no tiene pago todavía)
    expect(r.porMedio.filter((x) => x.cobros)).toEqual([
      { medio: 'efectivo', cobros: 1, montoCentavos: $(10400) },
      { medio: 'qr', cobros: 1, montoCentavos: $(13900) },
    ]);
    expect(r.porUsuario).toEqual([
      { usuarioId: ana.id, nombre: 'Ana', pedidos: 2, ventasCentavos: $(14600) },
      { usuarioId: dueno.id, nombre: 'Sergio', pedidos: 1, ventasCentavos: $(13900) },
    ]);
  });

  it('productos más vendidos (por plata) y comparación con el período anterior', () => {
    pedido(1, 13, [item('Medialuna', 10)], $(9000)); // semana anterior a la del 8
    pedido(8, 13, [item('Medialuna', 6), item('Lomito completo')], $(5400 + 13900));
    pedido(9, 13, [item('Medialuna', 4)], $(3600));

    const r = obtenerReporte(db, rango('2026-11-08', '2026-11-14'));
    expect(r.productos).toEqual([
      { productoId: producto('Lomito completo'), nombre: 'Lomito completo', categoria: 'Lomitos y sándwiches', cantidad: 1, ventasCentavos: $(13900) },
      { productoId: producto('Medialuna'), nombre: 'Medialuna', categoria: 'Cafetería', cantidad: 10, ventasCentavos: $(9000) },
    ]);
    expect(r.anterior).toEqual({ desde: '2026-11-01', hasta: '2026-11-07', pedidos: 1, ventasCentavos: $(9000) });
  });

  it('por tipo, envíos y clientes nuevos', () => {
    pedido(2, 21, [item('Tostado de jamón y queso')], $(6700), { tipo: 'delivery', telefono: '3704556677' }); // ya era cliente
    pedido(8, 21, [item('Tostado de jamón y queso')], $(6700), { tipo: 'delivery', telefono: '3704556677' });
    pedido(8, 21, [item('Tostado de jamón y queso')], $(6700), { tipo: 'delivery', telefono: '3704112233' }); // nuevo
    pedido(8, 13, [item('Tostado de jamón y queso')], $(5200), { tipo: 'mesa' });

    const r = obtenerReporte(db, rango('2026-11-08', '2026-11-08'));
    expect(r.porTipo).toEqual([
      { tipo: 'mostrador', pedidos: 0, ventasCentavos: 0 },
      { tipo: 'llevar', pedidos: 0, ventasCentavos: 0 },
      { tipo: 'delivery', pedidos: 2, ventasCentavos: $(13400) },
      { tipo: 'mesa', pedidos: 1, ventasCentavos: $(5200) },
    ]);
    expect(r.envioCentavos).toBe($(3000));
    expect(r.clientes).toEqual({ conPedidos: 2, nuevos: 1 });
  });

  it('un período sin ventas devuelve ceros (no rompe)', () => {
    const r = obtenerReporte(db, rango('2026-01-01', '2026-01-31'));
    expect(r).toMatchObject({ pedidos: 0, ventasCentavos: 0, ticketPromedioCentavos: 0, productos: [], porUsuario: [] });
    expect(r.porDia).toHaveLength(31);
  });
});
