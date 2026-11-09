import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import * as menu from '../src/main/servicios/menu';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import { $, baseNueva, guardar, guardarGrupo } from './ayudantes';

let db: BaseDeDatos;
beforeEach(() => {
  db = baseNueva();
});

describe('categorías', () => {
  it('se crean en orden y no se repiten (sin importar mayúsculas)', () => {
    const a = menu.crearCategoria(db, 'Pizzas');
    menu.crearCategoria(db, 'Bebidas');
    expect(() => menu.crearCategoria(db, 'PIZZAS')).toThrow('Ya hay una categoría que se llama "PIZZAS"');
    expect(menu.obtenerMenu(db).categorias.map((c) => c.nombre)).toEqual(['Pizzas', 'Bebidas']);
    expect(a).toBeGreaterThan(0);
  });

  it('se mueven arriba y abajo, y en las puntas no hacen nada', () => {
    const a = menu.crearCategoria(db, 'A');
    const b = menu.crearCategoria(db, 'B');
    const c = menu.crearCategoria(db, 'C');
    menu.moverCategoria(db, c, 'arriba');
    menu.moverCategoria(db, a, 'arriba'); // ya está primera
    expect(menu.obtenerMenu(db).categorias.map((x) => x.nombre)).toEqual(['A', 'C', 'B']);
    menu.moverCategoria(db, b, 'abajo'); // ya está última
    menu.moverCategoria(db, a, 'abajo');
    expect(menu.obtenerMenu(db).categorias.map((x) => x.nombre)).toEqual(['C', 'A', 'B']);
  });

  it('al ocultarla avisa si querés crear una con el mismo nombre', () => {
    const id = menu.crearCategoria(db, 'Postres');
    menu.cambiarEstadoCategoria(db, id, false);
    expect(menu.obtenerMenu(db).categorias[0]?.activa).toBe(false);
    expect(() => menu.crearCategoria(db, 'postres')).toThrow('categoría oculta');
  });

  it('se puede renombrar, pero no con el nombre de otra', () => {
    const a = menu.crearCategoria(db, 'Minutas');
    menu.crearCategoria(db, 'Pastas');
    menu.renombrarCategoria(db, a, 'Minutas caseras');
    expect(() => menu.renombrarCategoria(db, a, 'pastas')).toThrow('Ya hay una categoría');
    menu.renombrarCategoria(db, a, 'MINUTAS CASERAS'); // ella misma: se permite
    expect(menu.obtenerMenu(db).categorias[0]?.nombre).toBe('MINUTAS CASERAS');
  });
});

describe('productos', () => {
  let pizzas: number;
  beforeEach(() => {
    pizzas = menu.crearCategoria(db, 'Pizzas');
  });

  it('con precio único', () => {
    const id = guardar(db, { categoriaId: pizzas, nombre: '  Fugazzeta ', precioCentavos: $(11000) });
    const p = menu.obtenerMenu(db).productos.find((x) => x.id === id)!;
    expect(p).toMatchObject({ nombre: 'Fugazzeta', precioCentavos: $(11000), disponible: true, vaACocina: true, codigo: '' });
    expect(p.variantes).toEqual([]);
  });

  it('con tamaños: el precio del producto es el más barato', () => {
    const id = guardar(db, {
      categoriaId: pizzas,
      nombre: 'Muzzarella',
      precioCentavos: 0,
      variantes: [
        { nombre: 'Grande', precioCentavos: $(12000) },
        { nombre: 'Chica', precioCentavos: $(8000) },
      ],
    });
    const p = menu.obtenerMenu(db).productos.find((x) => x.id === id)!;
    expect(p.precioCentavos).toBe($(8000));
    expect(p.variantes.map((v) => v.nombre)).toEqual(['Grande', 'Chica']);
  });

  it('al editar los tamaños conserva los ids y desactiva los que se quitaron', () => {
    const id = guardar(db, {
      categoriaId: pizzas,
      nombre: 'Napolitana',
      precioCentavos: 0,
      variantes: [
        { nombre: 'Chica', precioCentavos: $(9000) },
        { nombre: 'Grande', precioCentavos: $(13000) },
        { nombre: 'Familiar', precioCentavos: $(17000) },
      ],
    });
    const [chica, grande] = menu.obtenerMenu(db).productos[0]!.variantes;
    guardar(db, {
      id,
      categoriaId: pizzas,
      nombre: 'Napolitana',
      precioCentavos: 0,
      variantes: [
        { id: grande!.id, nombre: 'Grande', precioCentavos: $(14000) },
        { id: chica!.id, nombre: 'Chica', precioCentavos: $(9500) },
      ],
    });
    const p = menu.obtenerMenu(db).productos[0]!;
    expect(p.variantes).toEqual([
      { id: grande!.id, nombre: 'Grande', precioCentavos: $(14000) },
      { id: chica!.id, nombre: 'Chica', precioCentavos: $(9500) },
    ]);
    const todas = db.$client.prepare('SELECT nombre, activa FROM variantes ORDER BY id').all();
    expect(todas).toEqual([
      { nombre: 'Chica', activa: 1 },
      { nombre: 'Grande', activa: 1 },
      { nombre: 'Familiar', activa: 0 },
    ]);
  });

  it('pasar de tamaños a precio único desactiva los tamaños', () => {
    const id = guardar(db, {
      categoriaId: pizzas,
      nombre: 'Calabresa',
      precioCentavos: 0,
      variantes: [
        { nombre: 'Chica', precioCentavos: $(9000) },
        { nombre: 'Grande', precioCentavos: $(13000) },
      ],
    });
    guardar(db, { id, categoriaId: pizzas, nombre: 'Calabresa', precioCentavos: $(12500) });
    const p = menu.obtenerMenu(db).productos[0]!;
    expect(p.variantes).toEqual([]);
    expect(p.precioCentavos).toBe($(12500));
  });

  it('Zod rechaza un solo tamaño, tamaños repetidos y precios negativos', () => {
    const base = { categoriaId: pizzas, nombre: 'X', precioCentavos: 0 };
    expect(() => guardar(db, { ...base, variantes: [{ nombre: 'Única', precioCentavos: 1 }] })).toThrow('Con un solo tamaño');
    expect(() =>
      guardar(db, {
        ...base,
        variantes: [
          { nombre: 'Chica', precioCentavos: 1 },
          { nombre: 'CHICA', precioCentavos: 2 },
        ],
      }),
    ).toThrow('ya está en la lista');
    expect(() => guardar(db, { ...base, precioCentavos: -100 })).toThrow('negativo');
    expect(() => guardar(db, { ...base, precioCentavos: 10.5 })).toThrow('dos decimales');
  });

  it('no repite nombre en la misma categoría ni código rápido entre activos', () => {
    const bebidas = menu.crearCategoria(db, 'Bebidas');
    const id = guardar(db, { categoriaId: pizzas, nombre: 'Especial', codigo: 'P1', precioCentavos: 100 });
    expect(() => guardar(db, { categoriaId: pizzas, nombre: 'especial', precioCentavos: 100 })).toThrow('Ya hay un producto "especial"');
    guardar(db, { categoriaId: bebidas, nombre: 'Especial', precioCentavos: 100 }); // otra categoría: sí
    expect(() => guardar(db, { categoriaId: bebidas, nombre: 'Otro', codigo: 'p1', precioCentavos: 100 })).toThrow('ya lo usa "Especial"');
    // Al darlo de baja, el código queda libre.
    menu.darDeBajaProducto(db, id);
    guardar(db, { categoriaId: bebidas, nombre: 'Otro', codigo: 'P1', precioCentavos: 100 });
    expect(menu.obtenerMenu(db).productos.map((p) => p.nombre)).toEqual(['Especial', 'Otro']);
  });

  it('agotado, duplicar y dar de baja', () => {
    const id = guardar(db, {
      categoriaId: pizzas,
      nombre: 'Rúcula',
      codigo: 'P9',
      precioCentavos: 0,
      variantes: [
        { nombre: 'Chica', precioCentavos: $(9800) },
        { nombre: 'Grande', precioCentavos: $(14800) },
      ],
    });
    menu.cambiarDisponible(db, id, false);
    const copia = menu.duplicarProducto(db, id);
    const otraCopia = menu.duplicarProducto(db, id);
    const lista = menu.obtenerMenu(db).productos;
    expect(lista.map((p) => p.nombre)).toEqual(['Rúcula', 'Rúcula (copia)', 'Rúcula (copia 2)']);
    const p = lista.find((x) => x.id === copia)!;
    expect(p).toMatchObject({ disponible: false, codigo: '' });
    expect(p.variantes.map((v) => v.nombre)).toEqual(['Chica', 'Grande']);
    menu.darDeBajaProducto(db, otraCopia);
    expect(menu.obtenerMenu(db).productos).toHaveLength(2);
    expect(menu.obtenerMenu(db).categorias[0]?.cantidadProductos).toBe(2); // los dados de baja no cuentan
    expect(() => menu.cambiarDisponible(db, otraCopia, true)).toThrow('ya no existe');
  });

  it('cambiar de categoría lo manda al final de la nueva', () => {
    const otras = menu.crearCategoria(db, 'Otras');
    guardar(db, { categoriaId: otras, nombre: 'Primero', precioCentavos: 1 });
    const id = guardar(db, { categoriaId: pizzas, nombre: 'Viajero', precioCentavos: 1 });
    guardar(db, { id, categoriaId: otras, nombre: 'Viajero', precioCentavos: 1 });
    const enOtras = menu
      .obtenerMenu(db)
      .productos.filter((p) => p.categoriaId === otras)
      .map((p) => p.nombre);
    expect(enOtras).toEqual(['Primero', 'Viajero']);
  });
});

describe('grupos de agregados', () => {
  it('se crean, se asignan a productos y cuentan cuántos los usan', () => {
    const cat = menu.crearCategoria(db, 'Hamburguesas');
    const extras = guardarGrupo(db, {
      nombre: 'Extras',
      minimo: 0,
      maximo: null,
      opciones: [
        { nombre: 'Cheddar', precioCentavos: $(900) },
        { nombre: 'Huevo', precioCentavos: $(700) },
      ],
    });
    const punto = guardarGrupo(db, {
      nombre: 'Punto',
      minimo: 1,
      maximo: 1,
      opciones: [
        { nombre: 'Jugosa', precioCentavos: 0 },
        { nombre: 'Cocida', precioCentavos: 0 },
      ],
    });
    guardar(db, { categoriaId: cat, nombre: 'Clásica', precioCentavos: $(8500), gruposIds: [punto, extras] });
    const m = menu.obtenerMenu(db);
    expect(m.productos[0]?.gruposIds).toEqual([punto, extras]);
    expect(m.grupos.map((g) => [g.nombre, g.cantidadProductos])).toEqual([
      ['Extras', 1],
      ['Punto', 1],
    ]);
  });

  it('valida mínimo, máximo y opciones repetidas', () => {
    const base = { nombre: 'G', opciones: [{ nombre: 'A', precioCentavos: 0 }] };
    expect(() => guardarGrupo(db, { ...base, minimo: 2, maximo: 1 })).toThrow('menor que el mínimo');
    expect(() => guardarGrupo(db, { ...base, minimo: 2, maximo: null })).toThrow('más opciones de las que hay');
    expect(() => guardarGrupo(db, { ...base, minimo: 0, maximo: null, opciones: [] })).toThrow('al menos una opción');
    expect(() =>
      guardarGrupo(db, {
        ...base,
        minimo: 0,
        maximo: null,
        opciones: [
          { nombre: 'Queso', precioCentavos: 0 },
          { nombre: 'queso', precioCentavos: 0 },
        ],
      }),
    ).toThrow('ya está en la lista');
  });

  it('al editar conserva las opciones y al eliminarlo lo saca de los productos', () => {
    const cat = menu.crearCategoria(db, 'Cafetería');
    const leche = guardarGrupo(db, {
      nombre: 'Leche',
      minimo: 0,
      maximo: 1,
      opciones: [
        { nombre: 'Descremada', precioCentavos: 0 },
        { nombre: 'Vegetal', precioCentavos: $(500) },
      ],
    });
    const [descremada, vegetal] = menu.obtenerMenu(db).grupos[0]!.opciones;
    guardarGrupo(db, {
      id: leche,
      nombre: 'Tipo de leche',
      minimo: 0,
      maximo: 1,
      opciones: [{ id: vegetal!.id, nombre: 'Vegetal', precioCentavos: $(600) }],
    });
    expect(menu.obtenerMenu(db).grupos[0]).toMatchObject({
      nombre: 'Tipo de leche',
      opciones: [{ id: vegetal!.id, nombre: 'Vegetal', precioCentavos: $(600) }],
    });
    expect(descremada).toBeDefined();
    const cafe = guardar(db, { categoriaId: cat, nombre: 'Café', precioCentavos: $(1900), gruposIds: [leche] });
    menu.darDeBajaGrupo(db, leche);
    const m = menu.obtenerMenu(db);
    expect(m.grupos).toEqual([]);
    expect(m.productos.find((p) => p.id === cafe)?.gruposIds).toEqual([]);
    expect(() => guardar(db, { categoriaId: cat, nombre: 'Té', precioCentavos: 1, gruposIds: [leche] })).toThrow(
      'ya no existe',
    );
  });
});

describe('menú de ejemplo', () => {
  it('carga 8 categorías, 24 productos y 5 grupos, y solo en un menú vacío', () => {
    cargarMenuDeEjemplo(db);
    const m = menu.obtenerMenu(db);
    expect(m.categorias).toHaveLength(8);
    expect(m.productos).toHaveLength(24);
    expect(m.grupos).toHaveLength(5);
    expect(m.categorias.map((c) => c.cantidadProductos)).toEqual([3, 3, 3, 3, 3, 4, 3, 2]);
    expect(m.grupos.map((g) => g.cantidadProductos)).toEqual([2, 3, 5, 2, 1]);
    expect(m.productos.filter((p) => !p.vaACocina).map((p) => p.nombre)).toEqual([
      'Gaseosa',
      'Agua mineral',
      'Cerveza lata 473 ml',
      'Helado',
    ]);
    expect(() => cargarMenuDeEjemplo(db)).toThrow('ya tiene productos');
  });

  it('con categorías creadas pero sin productos, las reutiliza', () => {
    const pizzas = menu.crearCategoria(db, 'pizzas');
    menu.crearCategoria(db, 'Combos');
    cargarMenuDeEjemplo(db);
    const m = menu.obtenerMenu(db);
    expect(m.categorias.map((c) => c.nombre)).toEqual(['pizzas', 'Combos', 'Hamburguesas', 'Lomitos y sándwiches', 'Empanadas', 'Minutas', 'Bebidas', 'Cafetería', 'Postres']);
    expect(m.productos.filter((p) => p.categoriaId === pizzas)).toHaveLength(3);
    expect(m.productos).toHaveLength(24);
  });

  it('si algo falla a la mitad, no queda nada cargado (transacción)', () => {
    db.$client.exec("CREATE TRIGGER romper BEFORE INSERT ON productos WHEN NEW.nombre = 'Flan casero' BEGIN SELECT RAISE(ABORT, 'falla de prueba'); END;");
    expect(() => cargarMenuDeEjemplo(db)).toThrow('falla de prueba');
    const m = menu.obtenerMenu(db);
    expect([m.categorias.length, m.productos.length, m.grupos.length]).toEqual([0, 0, 0]);
  });
});
