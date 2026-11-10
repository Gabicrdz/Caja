import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import type { Usuario } from '../src/compartido/tipos';
import { cargarDemo, CAJERA_DEMO, DIAS_DEMO, hayPedidos } from '../src/main/servicios/demo';
import { guardarUsuario } from '../src/main/servicios/usuarios';
import { abrirCaja, cajaAbierta, historialDeCajas } from '../src/main/servicios/caja';
import { obtenerReporte } from '../src/main/servicios/reportes';
import { listarClientes } from '../src/main/servicios/clientes';
import { esquemaListarClientes, esquemaRango } from '../src/compartido/esquemas';
import { baseNueva } from './ayudantes';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';

let db: BaseDeDatos;
let dueno: Usuario;
const ahora = new Date(2026, 10, 10, 21, 30);

beforeEach(() => {
  db = baseNueva();
  dueno = { id: guardarUsuario(db, { nombre: 'Sergio', rol: 'dueno', pin: '1234' }), nombre: 'Sergio', rol: 'dueno' };
});

describe('datos de demostración', () => {
  it(`carga ${DIAS_DEMO} días de ventas con cajas cerradas, clientes y una cajera`, () => {
    expect(hayPedidos(db)).toBe(false);
    const r = cargarDemo(db, dueno, ahora);
    expect(r.pedidos).toBeGreaterThan(600);
    expect(hayPedidos(db)).toBe(true);

    const reporte = obtenerReporte(db, esquemaRango.parse({ desde: '2026-09-27', hasta: '2026-11-10' }));
    expect(reporte.porDia.filter((d) => d.pedidos > 0)).toHaveLength(DIAS_DEMO);
    expect(reporte.porUsuario.map((u) => u.nombre).sort()).toEqual([CAJERA_DEMO.nombre, 'Sergio']);
    expect(reporte.anulados.cantidad).toBeGreaterThan(0);
    expect(reporte.porHora.slice(0, 11).every((h) => h.pedidos === 0)).toBe(true); // nada antes de las 11
    expect(listarClientes(db, esquemaListarClientes.parse({}))).toHaveLength(8);

    // Una caja por día: las viejas cerradas (historial) y la de hoy abierta
    expect(historialDeCajas(db, 100)).toHaveLength(DIAS_DEMO - 1);
    expect(cajaAbierta(db)).not.toBeNull();

    // Hoy: nada después de la hora actual, y el tablero con pedidos en curso
    const deHoy = db.$client.prepare(`SELECT max(hora) AS ultima, count(*) AS n FROM pedidos WHERE fecha = '2026-11-10'`).get() as { ultima: string; n: number };
    expect(deHoy.ultima <= '21:30').toBe(true);
    const pendientes = db.$client.prepare(`SELECT count(*) AS n FROM pedidos WHERE estado IN ('pendiente','en_preparacion','listo')`).get() as { n: number };
    expect(pendientes.n).toBeGreaterThan(0);
    const viejosSinEntregar = db.$client.prepare(`SELECT count(*) AS n FROM pedidos WHERE fecha < '2026-11-10' AND estado NOT IN ('entregado','anulado')`).get();
    expect(viejosSinEntregar).toEqual({ n: 0 });
  });

  it('no se carga si ya hay pedidos o si hay una caja abierta', () => {
    abrirCaja(db, 0, dueno, ahora);
    expect(() => cargarDemo(db, dueno, ahora)).toThrow('Cerrá la caja');
  });

  it('siempre sale igual (azar con semilla) y no se puede cargar dos veces', () => {
    const a = cargarDemo(db, dueno, ahora);
    expect(() => cargarDemo(db, dueno, ahora)).toThrow('sin pedidos');
    const otra = baseNueva();
    const otroDueno: Usuario = { id: guardarUsuario(otra, { nombre: 'Sergio', rol: 'dueno', pin: '1234' }), nombre: 'Sergio', rol: 'dueno' };
    expect(cargarDemo(otra, otroDueno, ahora).pedidos).toBe(a.pedidos);
  });

  it('cargada a la madrugada: la caja de hoy no queda abierta "en el futuro"', () => {
    const temprano = new Date(2026, 10, 10, 8, 30);
    cargarDemo(db, dueno, temprano);
    expect(cajaAbierta(db)!.abiertaEn).toBe('2026-11-10 08:29:00');
  });

  it('con un menú propio, la demo vende ese menú', () => {
    cargarMenuDeEjemplo(db); // como si el dueño ya hubiera armado su menú
    expect(cargarDemo(db, dueno, ahora).pedidos).toBeGreaterThan(600);
  });

  it('sin productos disponibles avisa en vez de romperse', () => {
    cargarMenuDeEjemplo(db);
    db.$client.exec('UPDATE productos SET disponible = 0');
    expect(() => cargarDemo(db, dueno, ahora)).toThrow('al menos un producto disponible');
    expect(hayPedidos(db)).toBe(false); // no quedó nada a medias
  });
});
