// WSAA: el servicio de ARCA que da el "ticket de acceso" (token + sign) por unas 12 horas.
// Se le manda un pedido (TRA) firmado con nuestro certificado.
import { firmarCms } from './cms';
import type { Transporte } from './transporte';
import { DIRECCIONES, type Ambiente } from './tipos';
import { desescapar, escapar, etiqueta } from './xml';

export interface Ticket {
  token: string;
  sign: string;
  /** Momento (ms desde 1970) hasta el que sirve. */
  venceMs: number;
}

/** Hora de Argentina (UTC-3, sin horario de verano) en el formato del TRA. */
function horaArgentina(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 19) + '-03:00';
}

export function crearTra(servicio: string, ahoraMs: number): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(ahoraMs / 1000)}</uniqueId>` +
    // Una hora para cada lado: tolera que el reloj de la PC esté algo corrido (ARCA no acepta
    // una generationTime en el futuro ni de más de 24 horas atrás).
    `<generationTime>${horaArgentina(ahoraMs - 60 * 60_000)}</generationTime>` +
    `<expirationTime>${horaArgentina(ahoraMs + 60 * 60_000)}</expirationTime>` +
    `</header><service>${escapar(servicio)}</service></loginTicketRequest>`
  );
}

export function sobreLoginCms(cmsBase64: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
    `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`
  );
}

export class ErrorDeArca extends Error {
  constructor(
    mensaje: string,
    readonly codigo?: string,
  ) {
    super(mensaje);
  }
}

/** Traduce los errores más comunes del WSAA a algo que entienda el dueño del local. */
export function explicarErrorWsaa(texto: string): string {
  const t = texto.toLowerCase();
  if (t.includes('ya posee un ta valido')) return 'ARCA ya entregó un acceso válido y no lo tengo guardado. Esperá unos minutos y probá de nuevo.';
  if (t.includes('certificado expirado') || t.includes('certificate has expired')) return 'El certificado venció. Hay que generar uno nuevo.';
  if (t.includes('no pudo validar') || t.includes('computador no autorizado') || t.includes('no autorizado')) {
    return 'ARCA no reconoce este certificado para el servicio de facturación. Falta autorizarlo (wsfe) en ARCA.';
  }
  if (t.includes('generationtime') || t.includes('expirationtime') || t.includes('expired')) {
    return 'La hora de esta computadora no coincide con la de ARCA. Revisá la fecha y la hora de Windows.';
  }
  return `ARCA rechazó el acceso: ${texto}`;
}

export function leerTicket(respuestaSoap: string): Ticket {
  const falla = etiqueta(respuestaSoap, 'faultstring');
  if (falla) {
    const original = desescapar(falla);
    // Se muestra el texto original de ARCA siempre: la explicación en castellano es una interpretación nuestra.
    throw new ErrorDeArca(`${explicarErrorWsaa(original)} [ARCA dijo: ${original.slice(0, 300)}]`);
  }
  const retorno = etiqueta(respuestaSoap, 'loginCmsReturn');
  if (!retorno) throw new ErrorDeArca('La respuesta de ARCA no tiene el ticket de acceso.');
  const ticket = desescapar(retorno);
  const token = etiqueta(ticket, 'token');
  const sign = etiqueta(ticket, 'sign');
  const vence = etiqueta(ticket, 'expirationTime');
  if (!token || !sign || !vence) throw new ErrorDeArca('El ticket de ARCA llegó incompleto.');
  return { token, sign, venceMs: new Date(vence).getTime() };
}

export interface PedidoDeAcceso {
  ambiente: Ambiente;
  certificadoPem: string;
  clavePem: string;
  servicio?: string;
  ahoraMs: number;
  transporte: Transporte;
}

export async function pedirTicket(p: PedidoDeAcceso): Promise<Ticket> {
  const tra = crearTra(p.servicio ?? 'wsfe', p.ahoraMs);
  const cms = firmarCms(Buffer.from(tra, 'utf8'), p.certificadoPem, p.clavePem, new Date(p.ahoraMs));
  const respuesta = await p.transporte(DIRECCIONES[p.ambiente].wsaa, '', sobreLoginCms(cms.toString('base64')));
  return leerTicket(respuesta);
}
