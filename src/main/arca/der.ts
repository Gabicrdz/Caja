// Lo mínimo de DER (el formato binario de los certificados) para armar la firma a mano.
// Cada valor DER es: [etiqueta][largo][contenido]. Acá solo hacemos lo que hace falta.

function largo(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(etiqueta: number, ...partes: Buffer[]): Buffer {
  const contenido = Buffer.concat(partes);
  return Buffer.concat([Buffer.from([etiqueta]), largo(contenido.length), contenido]);
}

export const secuencia = (...p: Buffer[]) => tlv(0x30, ...p);
export const conjunto = (...p: Buffer[]) => tlv(0x31, ...p);
export const octetos = (b: Buffer) => tlv(0x04, b);
export const nulo = () => Buffer.from([0x05, 0x00]);
/** Etiqueta "específica del contexto" [n] constructed (EXPLICIT / IMPLICIT de un SET). */
export const contexto = (n: number, ...p: Buffer[]) => tlv(0xa0 + n, ...p);

export function entero(valor: number): Buffer {
  return tlv(0x02, Buffer.from([valor]));
}

export function oid(texto: string): Buffer {
  const nums = texto.split('.').map(Number);
  const bytes: number[] = [nums[0]! * 40 + nums[1]!];
  for (const n of nums.slice(2)) {
    const pila = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) pila.unshift((v & 0x7f) | 0x80);
    bytes.push(...pila);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/** UTCTime: AAMMDDhhmmssZ (en UTC). */
export function horaUtc(fecha: Date): Buffer {
  const dos = (n: number) => String(n).padStart(2, '0');
  const t =
    dos(fecha.getUTCFullYear() % 100) +
    dos(fecha.getUTCMonth() + 1) +
    dos(fecha.getUTCDate()) +
    dos(fecha.getUTCHours()) +
    dos(fecha.getUTCMinutes()) +
    dos(fecha.getUTCSeconds()) +
    'Z';
  return tlv(0x17, Buffer.from(t, 'ascii'));
}

export interface NodoDer {
  etiqueta: number;
  /** Posición del primer byte del nodo (la etiqueta). */
  inicio: number;
  /** Posición del primer byte del contenido. */
  desde: number;
  /** Posición justo después del último byte (= inicio del siguiente nodo). */
  hasta: number;
}

/** Lee el nodo DER que empieza en `pos`. */
export function leer(buf: Buffer, pos: number): NodoDer {
  const etiqueta = buf[pos];
  const primero = buf[pos + 1];
  if (etiqueta === undefined || primero === undefined) throw new Error('El certificado está incompleto.');
  let desde = pos + 2;
  let n = primero;
  if (primero & 0x80) {
    const cantidad = primero & 0x7f;
    n = 0;
    for (let i = 0; i < cantidad; i++) n = n * 256 + (buf[desde + i] ?? 0);
    desde += cantidad;
  }
  if (desde + n > buf.length) throw new Error('El certificado está dañado.');
  return { etiqueta, inicio: pos, desde, hasta: desde + n };
}
