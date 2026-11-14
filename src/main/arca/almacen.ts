// Dónde viven el certificado, la clave y el ticket de acceso. No depende de Electron:
// recibe la carpeta base (en Windows: AppData\Roaming\caja\arca), así tiene pruebas.
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AmbienteArca } from '@compartido/tipos';
import type { Ticket } from './wsaa';

export type ArchivoArca = 'certificado' | 'clave';

const NOMBRE: Record<ArchivoArca, string> = { certificado: 'certificado.crt', clave: 'clave.key' };

/** Cada ambiente (pruebas / producción) tiene su propio certificado, en su propia carpeta. */
export const carpetaDe = (base: string, ambiente: AmbienteArca) => path.join(base, ambiente);
export const rutaDe = (base: string, ambiente: AmbienteArca, archivo: ArchivoArca) => path.join(carpetaDe(base, ambiente), NOMBRE[archivo]);

export class ErrorDeArchivo extends Error {}

/** Revisa que el archivo elegido sea de verdad un certificado o una clave y devuelve su texto. */
export function revisarArchivo(archivo: ArchivoArca, texto: string): string {
  if (texto.includes('PRIVATE KEY') && archivo === 'certificado') {
    throw new ErrorDeArchivo('Elegiste la clave privada. Acá va el certificado (.crt) que descargaste de ARCA.');
  }
  if (texto.includes('BEGIN CERTIFICATE') && archivo === 'clave') {
    throw new ErrorDeArchivo('Elegiste el certificado. Acá va la clave privada (.key) que se generó junto con el pedido.');
  }
  try {
    if (archivo === 'certificado') {
      const c = new X509Certificate(texto);
      if (new Date(c.validTo).getTime() < Date.now()) throw new ErrorDeArchivo('Ese certificado ya venció. Hay que generar uno nuevo en ARCA.');
    } else {
      const k = createPrivateKey(texto);
      if (k.asymmetricKeyType !== 'rsa') throw new ErrorDeArchivo('La clave tiene que ser RSA.');
    }
  } catch (e) {
    if (e instanceof ErrorDeArchivo) throw e;
    throw new ErrorDeArchivo(
      archivo === 'certificado'
        ? 'Ese archivo no es un certificado válido. Tiene que ser el .crt en formato PEM (empieza con BEGIN CERTIFICATE).'
        : 'Ese archivo no es una clave privada válida o tiene contraseña. Tiene que ser el .key (empieza con BEGIN PRIVATE KEY).',
    );
  }
  return texto;
}

/** ¿El certificado corresponde a la clave? Si no, ARCA rechazaría todo y el mensaje sería confuso. */
export function certificadoYClaveCoinciden(certificado: string, clave: string): boolean {
  try {
    return new X509Certificate(certificado).checkPrivateKey(createPrivateKey(clave));
  } catch {
    return false;
  }
}

/** Copia el archivo elegido a la carpeta del programa (así no se pierde si el pendrive se saca). */
export function importarArchivo(base: string, ambiente: AmbienteArca, archivo: ArchivoArca, origen: string): void {
  let texto: string;
  try {
    texto = readFileSync(origen, 'utf8');
  } catch {
    throw new ErrorDeArchivo('No se pudo leer ese archivo.');
  }
  revisarArchivo(archivo, texto);
  const otro = archivo === 'certificado' ? 'clave' : 'certificado';
  const rutaOtro = rutaDe(base, ambiente, otro);
  if (existsSync(rutaOtro)) {
    const ya = readFileSync(rutaOtro, 'utf8');
    const [cert, clave] = archivo === 'certificado' ? [texto, ya] : [ya, texto];
    if (!certificadoYClaveCoinciden(cert, clave)) {
      throw new ErrorDeArchivo(
        archivo === 'certificado'
          ? 'Este certificado no corresponde a la clave que ya está cargada. Tiene que ser el que se creó con ese mismo pedido (.csr).'
          : 'Esta clave no corresponde al certificado que ya está cargado.',
      );
    }
  }
  mkdirSync(carpetaDe(base, ambiente), { recursive: true });
  const destino = rutaDe(base, ambiente, archivo);
  copyFileSync(origen, destino);
}

export function existeArchivo(base: string, ambiente: AmbienteArca, archivo: ArchivoArca): boolean {
  return existsSync(rutaDe(base, ambiente, archivo));
}

/** Fecha de vencimiento (AAAA-MM-DD) del certificado cargado, o null. */
export function vencimientoDelCertificado(base: string, ambiente: AmbienteArca): string | null {
  try {
    return new Date(new X509Certificate(readFileSync(rutaDe(base, ambiente, 'certificado'), 'utf8')).validTo).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// ── Ticket de acceso guardado (el WSAA no da otro mientras el anterior sirva) ──
const rutaTicket = (base: string, clave: string) => path.join(base, `ticket-${clave}.json`);

export function guardarTicket(base: string, clave: string, ticket: Ticket): void {
  mkdirSync(base, { recursive: true });
  writeFileSync(rutaTicket(base, clave), JSON.stringify(ticket), 'utf8');
}

export function leerTicket(base: string, clave: string): Ticket | null {
  try {
    const t = JSON.parse(readFileSync(rutaTicket(base, clave), 'utf8')) as Partial<Ticket>;
    return typeof t.token === 'string' && typeof t.sign === 'string' && typeof t.venceMs === 'number' ? (t as Ticket) : null;
  } catch {
    return null;
  }
}
