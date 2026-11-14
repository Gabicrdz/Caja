// Manda un pedido SOAP por HTTPS. Es lo único que toca la red, así que en las pruebas
// se reemplaza por una función falsa (`Transporte`).
import https from 'node:https';

export type Transporte = (url: string, accion: string, cuerpo: string) => Promise<string>;

const HOSTS_PERMITIDOS = new Set(['wsaahomo.afip.gov.ar', 'wswhomo.afip.gov.ar', 'wsaa.afip.gov.ar', 'servicios1.afip.gov.ar']);

export class ErrorDeRed extends Error {}

/**
 * Los servidores de ARCA usan una clave Diffie-Hellman corta que el OpenSSL moderno rechaza
 * ("dh key too small"). En Node común se baja el nivel de seguridad SOLO para estos cuatro hosts.
 * Electron usa BoringSSL: no tiene ese problema (no usa DHE) y NO entiende `@SECLEVEL`, porque
 * da INVALID_COMMAND. Por eso la opción se agrega solo fuera de Electron.
 */
export function opcionesTls(enElectron: boolean): { ciphers?: string } {
  return enElectron ? {} : { ciphers: 'DEFAULT@SECLEVEL=0' };
}

export const transporteHttps: Transporte = (url, accion, cuerpo) =>
  new Promise((resolver, rechazar) => {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !HOSTS_PERMITIDOS.has(u.hostname)) {
      rechazar(new ErrorDeRed('Dirección no permitida.'));
      return;
    }
    const pedido = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        ...opcionesTls(!!process.versions.electron),
        timeout: 30_000,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(cuerpo),
          SOAPAction: accion,
        },
      },
      (respuesta) => {
        const trozos: Buffer[] = [];
        respuesta.on('data', (t: Buffer) => trozos.push(t));
        respuesta.on('end', () => resolver(Buffer.concat(trozos).toString('utf8')));
      },
    );
    pedido.on('timeout', () => pedido.destroy(new ErrorDeRed('ARCA tardó demasiado en responder.')));
    pedido.on('error', (e) =>
      rechazar(e instanceof ErrorDeRed ? e : new ErrorDeRed(`No se pudo conectar con ARCA (${(e as NodeJS.ErrnoException).code ?? e.message}). Revisá la conexión a internet.`)),
    );
    pedido.end(cuerpo);
  });
