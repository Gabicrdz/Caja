import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { avisoDelCertificado, DIAS_AVISO_CERTIFICADO, diasParaVencer, textoDelAviso } from '../src/compartido/certificado';
import { ServicioArca } from '../src/main/arca/servicio';
import type { ConfigArca } from '../src/main/arca/tipos';
import { CERTIFICADO_PRUEBA, CLAVE_PRUEBA } from './fixtures-arca';

describe('días que le quedan al certificado', () => {
  it('cuenta los días entre hoy y el vencimiento', () => {
    expect(diasParaVencer('2026-12-14', '2026-11-14')).toBe(30);
    expect(diasParaVencer('2026-11-15', '2026-11-14')).toBe(1);
    expect(diasParaVencer('2026-11-14', '2026-11-14')).toBe(0);
    expect(diasParaVencer('2026-11-13', '2026-11-14')).toBe(-1);
    expect(diasParaVencer('2028-11-13', '2026-11-14')).toBe(730);
  });

  it('atraviesa el cambio de año y el 29/2 sin errores', () => {
    expect(diasParaVencer('2027-01-02', '2026-12-30')).toBe(3);
    expect(diasParaVencer('2028-03-01', '2028-02-28')).toBe(2);
  });

  it('sin certificado o con fecha rara no hay días', () => {
    expect(diasParaVencer(null, '2026-11-14')).toBe(null);
    expect(diasParaVencer('', '2026-11-14')).toBe(null);
    expect(diasParaVencer('mañana', '2026-11-14')).toBe(null);
  });

  it('avisa desde los 30 días, y distingue vencido', () => {
    expect(DIAS_AVISO_CERTIFICADO).toBe(30);
    expect(avisoDelCertificado(null)).toBe(null);
    expect(avisoDelCertificado(31)).toBe(null);
    expect(avisoDelCertificado(30)).toBe('por_vencer');
    expect(avisoDelCertificado(0)).toBe('por_vencer');
    expect(avisoDelCertificado(-1)).toBe('vencido');
  });

  it('el texto cambia según el caso', () => {
    expect(textoDelAviso('2028-11-13', 730)).toBe('');
    expect(textoDelAviso('2026-12-04', 20)).toContain('vence en 20 días (04/12/2026)');
    expect(textoDelAviso('2026-11-15', 1)).toContain('vence en 1 día ');
    expect(textoDelAviso('2026-11-14', 0)).toContain('vence hoy');
    expect(textoDelAviso('2026-11-10', -4)).toContain('venció el 10/11/2026');
  });
});

describe('con el certificado vencido', () => {
  const CONFIG: ConfigArca = { activa: true, ambiente: 'homologacion', cuit: '20446474937', puntoVenta: 1, condicionIva: 'monotributo', rutaCertificado: 'c.crt', rutaClave: 'k.key' };

  it('avisa claro, sin llamar a ARCA', async () => {
    const vence = new Date(new X509Certificate(CERTIFICADO_PRUEBA).validTo);
    let llamadas = 0;
    const s = new ServicioArca({
      config: CONFIG,
      transporte: async () => {
        llamadas += 1;
        return '';
      },
      leerArchivo: (r) => (r === 'c.crt' ? CERTIFICADO_PRUEBA : CLAVE_PRUEBA),
      ahora: () => vence.getTime() + 3 * 86_400_000,
    });
    let mensaje = '';
    try {
      await s.obtenerTicket();
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain('El certificado venció el');
    expect(mensaje).toContain('Ajustes');
    expect(llamadas).toBe(0);
  });
});
