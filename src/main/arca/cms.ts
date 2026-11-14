// Firma CMS / PKCS#7 ("SignedData") hecha a mano con el módulo `crypto` de Node.
// ARCA exige que el pedido de acceso (el TRA) vaya firmado con el certificado, en este formato.
// Se hace a mano para no depender de OpenSSL ni de paquetes extra dentro del instalador.
import { createHash, createPrivateKey, createSign, X509Certificate } from 'node:crypto';
import { conjunto, contexto, entero, horaUtc, leer, nulo, octetos, oid, secuencia } from './der';

const OID_DATOS = '1.2.840.113549.1.7.1';
const OID_FIRMADO = '1.2.840.113549.1.7.2';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_RSA = '1.2.840.113549.1.1.1';
const OID_TIPO_CONTENIDO = '1.2.840.113549.1.9.3';
const OID_HORA_FIRMA = '1.2.840.113549.1.9.5';
const OID_RESUMEN = '1.2.840.113549.1.9.4';

/** Del certificado necesitamos dos cosas, tal cual están escritas: el emisor y el número de serie. */
export function datosDelCertificado(der: Buffer): { emisor: Buffer; serie: Buffer } {
  const cert = leer(der, 0);
  const tbs = leer(der, cert.desde);
  let pos = tbs.desde;
  let nodo = leer(der, pos);
  if (nodo.etiqueta === 0xa0) {
    // versión (opcional)
    pos = nodo.hasta;
    nodo = leer(der, pos);
  }
  const serie = der.subarray(nodo.inicio, nodo.hasta);
  pos = nodo.hasta;
  const algoritmo = leer(der, pos); // algoritmo de firma
  pos = algoritmo.hasta;
  const emisor = leer(der, pos);
  return { emisor: der.subarray(emisor.inicio, emisor.hasta), serie };
}

/**
 * Firma `contenido` y devuelve el CMS en DER (con el contenido adentro, como `openssl cms -sign -nodetach`).
 * `certificadoPem` y `clavePem` son los textos de los archivos .crt y .key.
 */
export function firmarCms(contenido: Buffer, certificadoPem: string, clavePem: string, ahora: Date = new Date()): Buffer {
  const certificado = new X509Certificate(certificadoPem);
  const certDer = Buffer.from(certificado.raw);
  const { emisor, serie } = datosDelCertificado(certDer);
  const clave = createPrivateKey(clavePem);

  const algoritmoSha256 = secuencia(oid(OID_SHA256), nulo());
  const atributo = (tipo: string, valor: Buffer) => secuencia(oid(tipo), conjunto(valor));
  // Los atributos firmados van ordenados byte a byte (regla de DER para los SET).
  const atributos = [
    atributo(OID_TIPO_CONTENIDO, oid(OID_DATOS)),
    atributo(OID_HORA_FIRMA, horaUtc(ahora)),
    atributo(OID_RESUMEN, octetos(createHash('sha256').update(contenido).digest())),
  ].sort(Buffer.compare);

  // Lo que se firma son los atributos con etiqueta de SET (0x31); en el mensaje van con [0] (0xA0).
  const aFirmar = conjunto(...atributos);
  const firma = createSign('sha256').update(aFirmar).sign(clave);

  const firmante = secuencia(
    entero(1),
    secuencia(emisor, serie),
    algoritmoSha256,
    contexto(0, ...atributos),
    secuencia(oid(OID_RSA), nulo()),
    octetos(firma),
  );

  const datosFirmados = secuencia(
    entero(1),
    conjunto(algoritmoSha256),
    secuencia(oid(OID_DATOS), contexto(0, octetos(contenido))),
    contexto(0, certDer),
    conjunto(firmante),
  );
  return secuencia(oid(OID_FIRMADO), contexto(0, datosFirmados));
}

