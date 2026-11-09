import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaPedido, type DatosPedido } from '../src/compartido/esquemas';
import type { Menu } from '../src/compartido/tipos';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { crearPedido, resumenDelDia } from '../src/main/servicios/pedidos';
import { $, baseNueva } from './ayudantes';

let db: BaseDeDatos;
let m: Menu;
beforeEach(() => {
  db = baseNueva();
  cargarMenuDeEjemplo(db);
  m = menu.obtenerMenu(db);
});

const producto = (nombre: string) => m.productos.find((p) => p.nombre === nombre)!;
const variante = (prod: string, nombre: string) => producto(prod).variantes.find((v) => v.nombre === nombre)!.id;
const opcion = (nombre: string) => m.grupos.flatMap((g) => g.opciones).find((o) => o.nombre === nombre)!.id;
const lunes = new Date(2026, 10, 9, 12, 30);
const martes = new Date(2026, 10, 10, 9, 5);

function cobrar(datos: Partial<DatosPedido> & Pick<DatosPedido, 'items' | 'totalEsperadoCentavos'>, cuando = lunes) {
  return crearPedido(
    db,
    esquemaPedido.parse({
      tipo: 'mostrador',
      pagos: [{ medio: 'efectivo', montoCentavos: datos.totalEsperadoCentavos }],
      ...datos,
    }),
    cuando,
  );
}

// Clásica $8.500 + jugosa + cheddar $900 + panceta $1.300 = $10.700 c/u
const clasicaConExtras = () => ({
  productoId: producto('Clásica').id,
  varianteId: null,
  opcionesIds: [opcion('Panceta'), opcion('Jugosa'), opcion('Cheddar')],
  cantidad: 2,
  nota: 'bien tostado el pan',
});

describe('crear pedido', () => {
  it('calcula precios con tamaños y agregados, y guarda la "foto"', () => {
    const r = cobrar({
      items: [
        clasicaConExtras(),
        { productoId: producto('Muzzarella').id, varianteId: variante('Muzzarella', 'Grande'), opcionesIds: [], cantidad: 1, nota: '' },
      ],
      totalEsperadoCentavos: $(10700 * 2 + 12000),
      pagos: [{ medio: 'efectivo', montoCentavos: $(33400), recibidoCentavos: $(40000) }],
    });
    expect(r).toMatchObject({ numero: 1, totalCentavos: $(33400), vueltoCentavos: $(6600) });

    const items = db.$client
      .prepare('SELECT nombre, variante_nombre, cantidad, unitario_centavos, agregados_centavos, total_centavos, nota, va_a_cocina FROM pedido_items ORDER BY orden')
      .all();
    expect(items).toEqual([
      { nombre: 'Clásica', variante_nombre: '', cantidad: 2, unitario_centavos: $(8500), agregados_centavos: $(2200), total_centavos: $(21400), nota: 'bien tostado el pan', va_a_cocina: 1 },
      { nombre: 'Muzzarella', variante_nombre: 'Grande', cantidad: 1, unitario_centavos: $(12000), agregados_centavos: 0, total_centavos: $(12000), nota: '', va_a_cocina: 1 },
    ]);
    // Los agregados quedan en el orden del menú, no en el que se tocaron.
    expect(db.$client.prepare('SELECT grupo_nombre, nombre, precio_centavos FROM pedido_item_agregados ORDER BY id').all()).toEqual([
      { grupo_nombre: 'Punto de la carne', nombre: 'Jugosa', precio_centavos: 0 },
      { grupo_nombre: 'Extras de hamburguesa', nombre: 'Cheddar', precio_centavos: $(900) },
      { grupo_nombre: 'Extras de hamburguesa', nombre: 'Panceta', precio_centavos: $(1300) },
    ]);

    // Cambiar el precio después no toca el pedido guardado.
    const p = producto('Clásica');
    menu.guardarProducto(db, { ...p, precioCentavos: $(9900), variantes: [] });
    expect(db.$client.prepare("SELECT unitario_centavos FROM pedido_items WHERE nombre = 'Clásica'").get()).toEqual({ unitario_centavos: $(8500) });
  });

  it('numera por día: 1, 2… y al otro día vuelve a 1', () => {
    const item = { productoId: producto('Medialuna').id, varianteId: null, opcionesIds: [], cantidad: 3, nota: '' };
    expect(cobrar({ items: [item], totalEsperadoCentavos: $(2700) }).numero).toBe(1);
    expect(cobrar({ items: [item], totalEsperadoCentavos: $(2700) }).numero).toBe(2);
    expect(cobrar({ items: [item], totalEsperadoCentavos: $(2700) }, martes).numero).toBe(1);
    expect(resumenDelDia(db, lunes)).toEqual({ fecha: '2026-11-09', pedidos: 2, totalCentavos: $(5400) });
    expect(resumenDelDia(db, martes)).toMatchObject({ pedidos: 1, totalCentavos: $(2700) });
  });

  it('delivery suma el envío; en mostrador el envío se ignora', () => {
    const item = { productoId: producto('Lomito completo').id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' };
    const conEnvio = cobrar({
      tipo: 'delivery',
      clienteNombre: 'Ana',
      clienteTelefono: '370 4123456',
      clienteDireccion: 'San Martín 1234',
      envioCentavos: $(1500),
      items: [item],
      totalEsperadoCentavos: $(15400),
      pagos: [{ medio: 'transferencia', montoCentavos: $(15400) }],
    });
    expect(conEnvio.totalCentavos).toBe($(15400));
    const sinEnvio = cobrar({ envioCentavos: $(1500), items: [item], totalEsperadoCentavos: $(13900) });
    expect(sinEnvio.totalCentavos).toBe($(13900));
    expect(db.$client.prepare('SELECT tipo, cliente_direccion, envio_centavos FROM pedidos ORDER BY id').all()).toEqual([
      { tipo: 'delivery', cliente_direccion: 'San Martín 1234', envio_centavos: $(1500) },
      { tipo: 'mostrador', cliente_direccion: '', envio_centavos: 0 },
    ]);
    expect(() => esquemaPedido.parse({ tipo: 'delivery', items: [item], pagos: [], totalEsperadoCentavos: 0 })).toThrow('falta la dirección');
    expect(() => esquemaPedido.parse({ tipo: 'mesa', items: [item], pagos: [], totalEsperadoCentavos: 0 })).toThrow('número de mesa');
  });

  it('pago combinado: efectivo con vuelto + tarjeta', () => {
    const r = cobrar({
      items: [clasicaConExtras()],
      totalEsperadoCentavos: $(21400),
      pagos: [
        { medio: 'debito', montoCentavos: $(15000) },
        { medio: 'efectivo', montoCentavos: $(6400), recibidoCentavos: $(10000) },
      ],
    });
    expect(r.vueltoCentavos).toBe($(3600));
    expect(db.$client.prepare('SELECT medio, monto_centavos, recibido_centavos, vuelto_centavos FROM pagos ORDER BY id').all()).toEqual([
      { medio: 'debito', monto_centavos: $(15000), recibido_centavos: $(15000), vuelto_centavos: 0 },
      { medio: 'efectivo', monto_centavos: $(6400), recibido_centavos: $(10000), vuelto_centavos: $(3600) },
    ]);
  });

  it('rechaza pagos que no cierran', () => {
    const items = [clasicaConExtras()];
    expect(() => cobrar({ items, totalEsperadoCentavos: $(21400), pagos: [{ medio: 'efectivo', montoCentavos: $(20000) }] })).toThrow('Los pagos suman $ 20.000 y el total es $ 21.400');
    expect(() =>
      cobrar({ items, totalEsperadoCentavos: $(21400), pagos: [{ medio: 'efectivo', montoCentavos: $(21400), recibidoCentavos: $(20000) }] }),
    ).toThrow('no alcanza');
    expect(() =>
      cobrar({ items, totalEsperadoCentavos: $(21400), pagos: [{ medio: 'qr', montoCentavos: $(21400), recibidoCentavos: $(25000) }] }),
    ).toThrow('no hay vuelto');
  });

  it('rechaza lo que no se puede vender', () => {
    const clasica = producto('Clásica').id;
    const base = { varianteId: null, cantidad: 1, nota: '' };
    // Falta el punto de la carne (obligatorio)
    expect(() => cobrar({ items: [{ ...base, productoId: clasica, opcionesIds: [] }], totalEsperadoCentavos: $(8500) })).toThrow('Elegí una opción en "Punto de la carne"');
    // Dos puntos de la carne
    expect(() =>
      cobrar({ items: [{ ...base, productoId: clasica, opcionesIds: [opcion('Jugosa'), opcion('A punto')] }], totalEsperadoCentavos: $(8500) }),
    ).toThrow('se elige una sola opción');
    // Un agregado de otro producto
    expect(() =>
      cobrar({ items: [{ ...base, productoId: clasica, opcionesIds: [opcion('Jugosa'), opcion('Puré')] }], totalEsperadoCentavos: $(8500) }),
    ).toThrow('no corresponde');
    // Pizza sin tamaño
    expect(() => cobrar({ items: [{ ...base, productoId: producto('Muzzarella').id, opcionesIds: [] }], totalEsperadoCentavos: $(8000) })).toThrow('Elegí el tamaño');
    // Agotado
    menu.cambiarDisponible(db, producto('Medialuna').id, false);
    expect(() => cobrar({ items: [{ ...base, productoId: producto('Medialuna').id, opcionesIds: [] }], totalEsperadoCentavos: $(900) })).toThrow('está agotado');
    // Categoría oculta
    const postres = m.categorias.find((c) => c.nombre === 'Postres')!.id;
    menu.cambiarEstadoCategoria(db, postres, false);
    expect(() => cobrar({ items: [{ ...base, productoId: producto('Flan casero').id, opcionesIds: [] }], totalEsperadoCentavos: $(4200) })).toThrow('categoría oculta');
    // Pedido vacío
    expect(() => cobrar({ items: [], totalEsperadoCentavos: 0 })).toThrow('está vacío');
    // Nada quedó guardado
    expect(db.$client.prepare('SELECT count(*) AS n FROM pedidos').get()).toEqual({ n: 0 });
  });

  it('si el menú cambió mientras se armaba el pedido, avisa en vez de cobrar otro precio', () => {
    const tostado = producto('Tostado de jamón y queso');
    menu.guardarProducto(db, { ...tostado, precioCentavos: $(5800), variantes: [] });
    expect(() =>
      cobrar({ items: [{ productoId: tostado.id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' }], totalEsperadoCentavos: $(5200) }),
    ).toThrow('El total cambió (ahora es $ 5.800)');
  });
});
