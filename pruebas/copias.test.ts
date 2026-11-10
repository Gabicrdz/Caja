import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { abrirBaseDeDatos, cerrarBaseDeDatos, VERSION_BASE } from '../src/main/db/conexion';
import { cargarMenuDeEjemplo } from '../src/main/servicios/menu-ejemplo';
import {
  COPIAS_AUTOMATICAS_A_GUARDAR,
  copiaAutomatica,
  copiasAutomaticas,
  descripcionDeCopia,
  hacerCopia,
  nombreDeCopia,
  reemplazarBase,
  revisarCopia,
} from '../src/main/servicios/copias';
import { esquemaLocal } from '../src/compartido/esquemas';
import { guardarLocal, obtenerConfiguracion } from '../src/main/servicios/configuracion';
import { htmlTicket } from '../src/main/impresion/plantillas';

let carpeta: string;
const ruta = (nombre: string) => path.join(carpeta, nombre);

beforeEach(() => {
  carpeta = mkdtempSync(path.join(tmpdir(), 'caja-copias-'));
});
afterEach(() => {
  cerrarBaseDeDatos();
  rmSync(carpeta, { recursive: true, force: true });
});

describe('copias de seguridad', () => {
  it('nombre con fecha y hora', () => {
    expect(nombreDeCopia(new Date(2026, 10, 10, 9, 5))).toBe('caja-2026-11-10-0905.db');
  });

  it('hace una copia que se puede revisar, y restaurarla trae los datos de vuelta', async () => {
    const db = abrirBaseDeDatos(ruta('caja.db'));
    cargarMenuDeEjemplo(db);
    const copia = await hacerCopia(db, ruta('copias/caja-1.db'));
    expect(copia.nombre).toBe('caja-1.db');
    expect(copia.bytes).toBeGreaterThan(0);
    const resumen = revisarCopia(copia.ruta);
    expect(resumen).toEqual({ version: VERSION_BASE, pedidos: 0, productos: 24, ultimoPedido: null });
    expect(descripcionDeCopia(resumen)).toBe('0 pedidos y 24 productos');

    // Después de la copia se borra todo el menú…
    db.$client.exec('DELETE FROM producto_grupos; DELETE FROM variantes; DELETE FROM productos;');
    cerrarBaseDeDatos();
    // …y al restaurar vuelve.
    reemplazarBase(copia.ruta, ruta('caja.db'));
    const restaurada = abrirBaseDeDatos(ruta('caja.db'));
    expect(restaurada.$client.prepare('SELECT count(*) AS n FROM productos').get()).toEqual({ n: 24 });
  });

  it('no restaura la base sobre sí misma', () => {
    expect(() => reemplazarBase(ruta('caja.db'), ruta('caja.db'))).toThrow('el archivo que la Caja está usando');
  });

  it('rechaza archivos que no son de la Caja o de una versión más nueva', () => {
    writeFileSync(ruta('foto.db'), 'esto no es una base de datos');
    expect(() => revisarCopia(ruta('foto.db'))).toThrow('no es una copia de la Caja');

    const otra = new Database(ruta('gimnasio.db'));
    otra.exec('CREATE TABLE socios (id INTEGER PRIMARY KEY)');
    otra.pragma('user_version = 3');
    otra.close();
    expect(() => revisarCopia(ruta('gimnasio.db'))).toThrow('no es una copia de la Caja');

    const futura = new Database(ruta('futura.db'));
    futura.exec('CREATE TABLE pedidos (id INTEGER); CREATE TABLE productos (id INTEGER, activo INTEGER); CREATE TABLE categorias (id INTEGER); CREATE TABLE configuracion (clave TEXT);');
    futura.pragma(`user_version = ${VERSION_BASE + 1}`);
    futura.close();
    expect(() => revisarCopia(ruta('futura.db'))).toThrow('versión más nueva');

    expect(() => revisarCopia(ruta('no-existe.db'))).toThrow('No se encontró');
  });

  it('copia automática: una por día y guarda solo las últimas 10', async () => {
    const db = abrirBaseDeDatos(ruta('caja.db'));
    const auto = ruta('automaticas');
    for (let dia = 1; dia <= 12; dia++) {
      const hecha = await copiaAutomatica(db, auto, new Date(2026, 10, dia, 9, 0));
      expect(hecha).not.toBeNull();
      utimesSync(hecha!.ruta, new Date(2026, 10, dia), new Date(2026, 10, dia));
    }
    // El mismo día, a la tarde, no hace otra
    expect(await copiaAutomatica(db, auto, new Date(2026, 10, 12, 18, 0))).toBeNull();
    const lista = copiasAutomaticas(auto);
    expect(lista).toHaveLength(COPIAS_AUTOMATICAS_A_GUARDAR);
    expect(lista[0]!.nombre).toBe('caja-automatica-2026-11-12-0900.db'); // la más nueva primero
    expect(lista[9]!.nombre).toBe('caja-automatica-2026-11-03-0900.db');
    expect(existsSync(path.join(auto, 'caja-automatica-2026-11-01-0900.db'))).toBe(false);
  });
});

describe('datos del local', () => {
  it('se guardan y salen en el ticket', () => {
    const db = abrirBaseDeDatos(':memory:');
    expect(obtenerConfiguracion(db)).toMatchObject({ nombreLocal: 'Mi Local', pieTicket: '¡Gracias por tu compra!', envioCentavos: 150000 });
    expect(() => esquemaLocal.parse({ nombreLocal: '  ', envioCentavos: 0 })).toThrow('nombre del local');
    guardarLocal(db, esquemaLocal.parse({ nombreLocal: 'El Mostrador', direccionLocal: 'Belgrano 845', telefonoLocal: '370 455-0000', pieTicket: 'Volvé pronto', envioCentavos: 200000 }));
    const c = obtenerConfiguracion(db);
    expect(c).toMatchObject({ nombreLocal: 'El Mostrador', direccionLocal: 'Belgrano 845', telefonoLocal: '370 455-0000', pieTicket: 'Volvé pronto', envioCentavos: 200000 });

    const pedido = {
      id: 1, numero: 7, fecha: '2026-11-10', hora: '21:00', tipo: 'mostrador' as const, mesa: '', clienteNombre: '', clienteTelefono: '',
      clienteDireccion: '', nota: '', estado: 'pendiente' as const, cobrado: true, subtotalCentavos: 100, envioCentavos: 0, totalCentavos: 100,
      motivoAnulacion: '', items: [], pagos: [],
    };
    const ticket = htmlTicket(pedido as never, { nombre: c.nombreLocal, direccion: c.direccionLocal, telefono: c.telefonoLocal, pie: c.pieTicket }, 80).replace(/<[^>]+>/g, ' ');
    expect(ticket).toContain('El Mostrador');
    expect(ticket).toContain('Belgrano 845');
    expect(ticket).toContain('Tel. 370 455-0000');
    expect(ticket).toContain('Volvé pronto');
  });
});
