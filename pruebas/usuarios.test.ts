import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../src/main/db/conexion';
import { esquemaUsuario } from '../src/compartido/esquemas';
import { darDeBajaUsuario, guardarUsuario, hashDePin, listarUsuarios, pinCorrecto } from '../src/main/servicios/usuarios';
import { cerrarSesion, iniciarSesion, reiniciarSesionParaPruebas, requerir, sesionActual } from '../src/main/servicios/sesion';
import { baseNueva } from './ayudantes';

let db: BaseDeDatos;
beforeEach(() => {
  db = baseNueva();
  reiniciarSesionParaPruebas();
});
const crear = (nombre: string, rol: 'dueno' | 'cajero', pin = '1234') => guardarUsuario(db, esquemaUsuario.parse({ nombre, rol, pin }));

describe('PIN', () => {
  it('se guarda como hash con sal, nunca el PIN', () => {
    const a = hashDePin('1234');
    const b = hashDePin('1234');
    expect(a.hash === b.hash).toBe(false); // otra sal → otro hash
    expect(pinCorrecto('1234', a.hash, a.sal)).toBe(true);
    expect(pinCorrecto('4321', a.hash, a.sal)).toBe(false);
    crear('Sergio', 'dueno', '9876');
    const fila = db.$client.prepare('SELECT * FROM usuarios').get() as Record<string, unknown>;
    expect(JSON.stringify(fila).includes('9876')).toBe(false);
  });

  it('Zod pide de 4 a 6 números', () => {
    expect(() => esquemaUsuario.parse({ nombre: 'A', rol: 'cajero', pin: '12' })).toThrow('4 a 6 números');
    expect(() => esquemaUsuario.parse({ nombre: 'A', rol: 'cajero', pin: 'abcd' })).toThrow('4 a 6 números');
    expect(() => crear('Sin pin', 'cajero', '')).toThrow('Elegí un PIN');
  });
});

describe('usuarios', () => {
  it('no repite nombres y siempre queda al menos un dueño', () => {
    const dueno = crear('Sergio', 'dueno');
    const cajera = crear('Ana', 'cajero');
    expect(() => crear('sergio', 'cajero')).toThrow('Ya hay un usuario');
    expect(() => guardarUsuario(db, esquemaUsuario.parse({ id: dueno, nombre: 'Sergio', rol: 'cajero' }))).toThrow('al menos un dueño');
    expect(() => darDeBajaUsuario(db, dueno, cajera)).toThrow('al menos un dueño');
    expect(() => darDeBajaUsuario(db, cajera, cajera)).toThrow('a vos mismo');
    darDeBajaUsuario(db, cajera, dueno);
    expect(listarUsuarios(db).map((u) => u.nombre)).toEqual(['Sergio']);
    crear('Ana', 'cajero'); // el nombre quedó libre
  });

  it('editar sin PIN conserva el PIN anterior', () => {
    const id = crear('Ana', 'cajero', '5555');
    guardarUsuario(db, esquemaUsuario.parse({ id, nombre: 'Ana María', rol: 'cajero', pin: '' }));
    expect(iniciarSesion(db, id, '5555')).toEqual({ id, nombre: 'Ana María', rol: 'cajero' });
  });
});

describe('sesión', () => {
  it('entra con el PIN correcto y respeta el rol', () => {
    const dueno = crear('Sergio', 'dueno', '1111');
    const cajera = crear('Ana', 'cajero', '2222');
    expect(() => requerir()).toThrow('Volvé a ingresar');
    expect(() => iniciarSesion(db, cajera, '1111')).toThrow('PIN incorrecto');
    iniciarSesion(db, cajera, '2222');
    expect(requerir().nombre).toBe('Ana');
    expect(() => requerir('dueno')).toThrow('solo el dueño');
    iniciarSesion(db, dueno, '1111');
    expect(requerir('dueno').nombre).toBe('Sergio');
    cerrarSesion();
    expect(sesionActual()).toBeNull();
  });

  it('después de 5 intentos fallidos hay que esperar 30 segundos', () => {
    const id = crear('Ana', 'cajero', '2222');
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(() => iniciarSesion(db, id, '0000', t)).toThrow('PIN incorrecto.');
    expect(() => iniciarSesion(db, id, '0000', t)).toThrow('Esperá 30 segundos');
    expect(() => iniciarSesion(db, id, '2222', t + 10_000)).toThrow('Esperá 20 segundos'); // ni con el correcto
    expect(iniciarSesion(db, id, '2222', t + 31_000).nombre).toBe('Ana');
  });
});
