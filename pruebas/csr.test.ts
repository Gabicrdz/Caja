import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { aliasSugerido, armarCsr, aPem, generarPedido } from '../src/main/arca/csr';
import { importarArchivo, rutaDe } from '../src/main/arca/almacen';
import { CERTIFICADO_PRUEBA, CLAVE_PRUEBA } from './fixtures-arca';

const DATOS = { cuit: '20446474937', razonSocial: 'Pérez Juan, Kiosco "El Sol"' };
const AHORA = new Date(Date.UTC(2026, 10, 14, 15));
const carpeta = () => mkdtempSync(path.join(tmpdir(), 'csr-'));

describe('pedido de certificado (CSR)', () => {
  it('el alias no tiene espacios ni signos y cambia por ambiente y día', () => {
    expect(aliasSugerido('produccion', AHORA)).toBe('cajaprod20261114');
    expect(aliasSugerido('homologacion', AHORA)).toBe('cajahomo20261114');
    expect(/^[a-z0-9]+$/.test(aliasSugerido('produccion', AHORA))).toBe(true);
  });

  it('el CSR está bien firmado y lleva la clave pública correcta', () => {
    const csr = armarCsr(CLAVE_PRUEBA, { ...DATOS, alias: 'cajaprod1' });
    // Verificación con OpenSSL real (si está instalado): firma y datos del sujeto.
    const dir = carpeta();
    const ruta = path.join(dir, 'p.csr');
    writeFileSync(ruta, aPem(csr, 'CERTIFICATE REQUEST'));
    const r = spawnSync('openssl', ['req', '-in', ruta, '-noout', '-verify', '-subject', '-nameopt', 'RFC2253'], { encoding: 'utf8' });
    if (!r.error) {
      expect(r.stderr + r.stdout).toContain('verify OK');
      expect(r.stdout).toContain('CN=cajaprod1');
      expect(r.stdout).toContain('C=AR');
      expect(r.stdout).toContain('serialNumber=CUIT 20446474937');
      expect(r.stdout).toContain('Kiosco');
    }
    // Sin OpenSSL: al menos la clave pública debe estar adentro tal cual.
    const publica = createPublicKey(createPrivateKey(CLAVE_PRUEBA)).export({ type: 'spki', format: 'der' });
    expect(csr.includes(publica)).toBe(true);
  });

  it('sin clave: la crea y devuelve el pedido', () => {
    const base = carpeta();
    const r = generarPedido(base, 'produccion', DATOS, false, AHORA);
    expect(r.alias).toBe('cajaprod20261114');
    expect(r.reutilizoClave).toBe(false);
    expect(r.csr).toContain('BEGIN CERTIFICATE REQUEST');
    expect(existsSync(rutaDe(base, 'produccion', 'clave'))).toBe(true);
    expect(createPrivateKey(readFileSync(rutaDe(base, 'produccion', 'clave'), 'utf8')).asymmetricKeyType).toBe('rsa');
    // No toca el otro ambiente.
    expect(existsSync(rutaDe(base, 'homologacion', 'clave'))).toBe(false);
  });

  it('con clave y sin certificado: reusa la misma clave', () => {
    const base = carpeta();
    generarPedido(base, 'produccion', DATOS, false, AHORA);
    const antes = readFileSync(rutaDe(base, 'produccion', 'clave'), 'utf8');
    const r = generarPedido(base, 'produccion', DATOS, false, AHORA);
    expect(r.reutilizoClave).toBe(true);
    expect(readFileSync(rutaDe(base, 'produccion', 'clave'), 'utf8')).toBe(antes);
  });

  it('con clave y certificado: no pisa nada sin confirmación; con confirmación guarda copia', () => {
    const base = carpeta();
    generarPedido(base, 'produccion', DATOS, false, AHORA);
    writeFileSync(rutaDe(base, 'produccion', 'clave'), CLAVE_PRUEBA);
    writeFileSync(rutaDe(base, 'produccion', 'certificado'), CERTIFICADO_PRUEBA);
    expect(() => generarPedido(base, 'produccion', DATOS, false, AHORA)).toThrow('Ya hay un certificado');
    expect(readFileSync(rutaDe(base, 'produccion', 'clave'), 'utf8')).toBe(CLAVE_PRUEBA);
    const r = generarPedido(base, 'produccion', DATOS, true, AHORA);
    expect(r.reutilizoClave).toBe(false);
    expect(readFileSync(`${rutaDe(base, 'produccion', 'clave')}.anterior`, 'utf8')).toBe(CLAVE_PRUEBA);
    expect(existsSync(rutaDe(base, 'produccion', 'certificado'))).toBe(false);
    expect(readFileSync(rutaDe(base, 'produccion', 'clave'), 'utf8')).not.toBe(CLAVE_PRUEBA);
  });

  it('pide CUIT válido y razón social', () => {
    const base = carpeta();
    expect(() => generarPedido(base, 'produccion', { cuit: '20446474930', razonSocial: 'X' }, false)).toThrow('CUIT');
    expect(() => generarPedido(base, 'produccion', { cuit: '20446474937', razonSocial: '  ' }, false)).toThrow('razón social');
  });

  it('un certificado de otra clave se rechaza al cargarlo (flujo completo)', () => {
    const base = carpeta();
    generarPedido(base, 'produccion', DATOS, false, AHORA);
    const cert = path.join(carpeta(), 'c.crt');
    writeFileSync(cert, CERTIFICADO_PRUEBA);
    expect(() => importarArchivo(base, 'produccion', 'certificado', cert)).toThrow('no corresponde a la clave');
  });
});
