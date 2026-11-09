import { describe, expect, it } from 'vitest';
import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as esquema from '../src/main/db/esquema';
import { VERSION_BASE, abrirBaseDeDatos, cerrarBaseDeDatos } from '../src/main/db/conexion';
import { baseNueva } from './ayudantes';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('base de datos', () => {
  it('esquema.ts (Drizzle) coincide con las tablas que crean las migraciones', () => {
    const db = baseNueva();
    const tablas = (Object.values(esquema) as unknown[]).filter((t): t is SQLiteTable => is(t, SQLiteTable));
    expect(tablas.length).toBe(15);
    for (const tabla of tablas) {
      const config = getTableConfig(tabla);
      const enLaBase = (
        db.$client.prepare(`PRAGMA table_info(${config.name})`).all() as { name: string; notnull: number; pk: number }[]
      ).map((c) => `${c.name}${c.notnull || c.pk ? '!' : ''}`);
      const enDrizzle = config.columns.map((c) => `${c.name}${c.notNull ? '!' : ''}`);
      expect(enDrizzle.sort(), config.name).toEqual(enLaBase.sort());
    }
  });

  it('las migraciones se aplican una sola vez y guardan la versión', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'caja-'));
    const ruta = path.join(carpeta, 'caja.db');
    try {
      cerrarBaseDeDatos();
      const db = abrirBaseDeDatos(ruta);
      expect(db.$client.pragma('user_version', { simple: true })).toBe(VERSION_BASE);
      db.$client.prepare("INSERT INTO categorias (nombre) VALUES ('Guardada')").run();
      cerrarBaseDeDatos();
      const otraVez = abrirBaseDeDatos(ruta); // no debe fallar ni borrar nada
      expect(otraVez.$client.prepare('SELECT nombre FROM categorias').all()).toEqual([{ nombre: 'Guardada' }]);
      expect(otraVez.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('no abre una base de una versión más nueva del programa', () => {
    const carpeta = mkdtempSync(path.join(tmpdir(), 'caja-'));
    const ruta = path.join(carpeta, 'caja.db');
    try {
      cerrarBaseDeDatos();
      abrirBaseDeDatos(ruta).$client.pragma(`user_version = ${VERSION_BASE + 1}`);
      cerrarBaseDeDatos();
      expect(() => abrirBaseDeDatos(ruta)).toThrow('versión más nueva');
    } finally {
      cerrarBaseDeDatos();
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
