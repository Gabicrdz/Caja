// Genera la clave privada y el "pedido de certificado" (CSR) que ARCA pide para dar un certificado.
// Es lo que normalmente se hace con OpenSSL; se hace acá a mano (con `crypto` de Node) para que
// el cliente no tenga que instalar nada. No depende de Electron: recibe la carpeta base.
import { createPrivateKey, createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { AmbienteArca } from '@compartido/tipos';
import { cuitValido } from '@compartido/cuit';
import { carpetaDe, ErrorDeArchivo, rutaDe } from './almacen';
import { conjunto, entero, oid, secuencia, tlv } from './der';

const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_PAIS = '2.5.4.6';
const OID_ORGANIZACION = '2.5.4.10';
const OID_NOMBRE_COMUN = '2.5.4.3';
const OID_SERIE = '2.5.4.5';

const imprimible = (t: string) => tlv(0x13, Buffer.from(t, 'ascii'));
const texto = (t: string) => tlv(0x0c, Buffer.from(t, 'utf8'));
const atributo = (tipo: string, valor: Buffer) => conjunto(secuencia(oid(tipo), valor));

export interface DatosPedido {
  cuit: string;
  razonSocial: string;
  /** Nombre del certificado en ARCA: solo letras y números. */
  alias: string;
}

/** Arma el CSR (PKCS#10) en DER, firmado con la clave. Es lo que ARCA recibe. */
export function armarCsr(clavePem: string, datos: DatosPedido): Buffer {
  const clave = createPrivateKey(clavePem);
  const publica = createPublicKey(clave).export({ type: 'spki', format: 'der' });
  const nombre = secuencia(
    atributo(OID_PAIS, imprimible('AR')),
    atributo(OID_ORGANIZACION, texto(datos.razonSocial)),
    atributo(OID_NOMBRE_COMUN, texto(datos.alias)),
    atributo(OID_SERIE, imprimible(`CUIT ${datos.cuit}`)),
  );
  // version 0, nombre, clave pública y "atributos" vacíos ([0] sin nada adentro).
  const info = secuencia(entero(0), nombre, publica, Buffer.from([0xa0, 0x00]));
  const algoritmo = secuencia(oid(OID_SHA256_RSA), Buffer.from([0x05, 0x00]));
  const firma = createSign('sha256').update(info).sign(clave);
  return secuencia(info, algoritmo, tlv(0x03, Buffer.from([0x00]), firma));
}

export const aPem = (der: Buffer, titulo: string) =>
  `-----BEGIN ${titulo}-----\n${(der.toString('base64').match(/.{1,64}/g) ?? []).join('\n')}\n-----END ${titulo}-----\n`;

/** Nombre sugerido para el certificado en ARCA (sin espacios ni signos, y distinto cada día). */
export function aliasSugerido(ambiente: AmbienteArca, ahora: Date): string {
  const dia = ahora.toISOString().slice(0, 10).replace(/-/g, '');
  return `caja${ambiente === 'produccion' ? 'prod' : 'homo'}${dia}`;
}

export interface ResultadoPedido {
  alias: string;
  /** Texto del .csr, listo para pegar o subir a ARCA. */
  csr: string;
  /** true si ya había una clave esperando su certificado y se volvió a usar la misma. */
  reutilizoClave: boolean;
}

/**
 * Deja la clave guardada en la carpeta del ambiente y devuelve el pedido de certificado.
 * - Sin clave: crea una nueva (RSA 2048).
 * - Con clave pero sin certificado: reusa la misma, así el certificado que ARCA entregue después coincide.
 * - Con clave Y certificado: no toca nada, salvo que `reemplazar` sea true (entonces los archivos
 *   viejos quedan guardados con la extensión .anterior).
 */
export function generarPedido(base: string, ambiente: AmbienteArca, d: { cuit: string; razonSocial: string }, reemplazar: boolean, ahora: Date = new Date()): ResultadoPedido {
  const razonSocial = d.razonSocial.trim();
  if (!cuitValido(d.cuit)) throw new ErrorDeArchivo('Falta el CUIT (o está mal). Cargalo y guardá los cambios antes de generar el pedido.');
  if (!razonSocial) throw new ErrorDeArchivo('Falta el nombre o razón social. Cargalo y guardá los cambios antes de generar el pedido.');

  const rutaClave = rutaDe(base, ambiente, 'clave');
  const rutaCert = rutaDe(base, ambiente, 'certificado');
  const hayClave = existsSync(rutaClave);
  const hayCert = existsSync(rutaCert);
  if (hayClave && hayCert && !reemplazar) {
    throw new ErrorDeArchivo('Ya hay un certificado y una clave cargados para este ambiente. Si generás un pedido nuevo, hay que pedir otro certificado en ARCA.');
  }

  mkdirSync(carpetaDe(base, ambiente), { recursive: true });
  let clavePem: string;
  let reutilizoClave = false;
  if (hayClave && !hayCert) {
    clavePem = readFileSync(rutaClave, 'utf8');
    try {
      createPrivateKey(clavePem);
      reutilizoClave = true;
    } catch {
      renameSync(rutaClave, `${rutaClave}.anterior`);
      clavePem = '';
    }
  } else {
    clavePem = '';
    if (hayClave) renameSync(rutaClave, `${rutaClave}.anterior`);
    if (hayCert) renameSync(rutaCert, `${rutaCert}.anterior`);
  }
  if (!clavePem) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    clavePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    // 0o600: que solo pueda leerla el usuario (en Windows se ignora, pero no molesta).
    writeFileSync(rutaClave, clavePem, { encoding: 'utf8', mode: 0o600 });
  }

  const alias = aliasSugerido(ambiente, ahora);
  const csr = aPem(armarCsr(clavePem, { cuit: d.cuit, razonSocial, alias }), 'CERTIFICATE REQUEST');
  return { alias, csr, reutilizoClave };
}
