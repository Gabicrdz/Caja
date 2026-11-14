// WSFEv1: el servicio de ARCA que autoriza facturas y devuelve el CAE.
import { ErrorDeArca, type Ticket } from './wsaa';
import type { Transporte } from './transporte';
import {
  ALICUOTAS,
  DIRECCIONES,
  TIPO_COMPROBANTE,
  type Ambiente,
  type ComprobanteAutorizado,
  type ComprobanteConsultado,
  type DatosComprobante,
  type MensajeArca,
  type ResultadoArca,
} from './tipos';
import { desescapar, escapar, etiqueta, etiquetas } from './xml';

const ESPACIO = 'http://ar.gov.afip.dif.FEV1/';

export interface Credenciales {
  cuit: string;
  ticket: Ticket;
}

/** Centavos → "12.50" (ARCA pide punto decimal y 2 decimales). */
export function importe(centavos: number): string {
  const negativo = centavos < 0 ? '-' : '';
  const c = Math.abs(Math.round(centavos));
  return `${negativo}${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

function sobre(operacion: string, cuerpo: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">' +
    `<soapenv:Header/><soapenv:Body><ar:${operacion}>${cuerpo}</ar:${operacion}></soapenv:Body></soapenv:Envelope>`
  );
}

function auth(c: Credenciales): string {
  return `<ar:Auth><ar:Token>${escapar(c.ticket.token)}</ar:Token><ar:Sign>${escapar(c.ticket.sign)}</ar:Sign><ar:Cuit>${escapar(c.cuit)}</ar:Cuit></ar:Auth>`;
}

/** Lo que cobra de IVA un total que ya lo incluye: neto = total / (1 + alícuota). */
export function desglosarIva(totalCentavos: number, alicuotaId: number): { neto: number; iva: number } {
  const porcentaje = ALICUOTAS[alicuotaId];
  if (porcentaje === undefined) throw new ErrorDeArca('La alícuota de IVA no es válida.');
  const neto = Math.round((totalCentavos * 100) / (100 + porcentaje));
  return { neto, iva: totalCentavos - neto };
}

const ES_FACTURA_C = (tipo: number) => tipo === TIPO_COMPROBANTE.facturaC || tipo === TIPO_COMPROBANTE.notaCreditoC;

export function xmlDetalle(numero: number, puntoVenta: number, d: DatosComprobante): string {
  const c = ES_FACTURA_C(d.tipo);
  let neto = d.totalCentavos;
  let iva = 0;
  let bloqueIva = '';
  if (!c) {
    const alicuotaId = d.alicuotaId ?? 5;
    ({ neto, iva } = desglosarIva(d.totalCentavos, alicuotaId));
    bloqueIva = `<ar:Iva><ar:AlicIva><ar:Id>${alicuotaId}</ar:Id><ar:BaseImp>${importe(neto)}</ar:BaseImp><ar:Importe>${importe(iva)}</ar:Importe></ar:AlicIva></ar:Iva>`;
  }
  const asociado = d.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${d.asociado.tipo}</ar:Tipo><ar:PtoVta>${d.asociado.puntoVenta}</ar:PtoVta><ar:Nro>${d.asociado.numero}</ar:Nro></ar:CbteAsoc></ar:CbtesAsoc>`
    : '';
  // El orden de los elementos importa: ARCA valida contra un esquema fijo.
  return (
    '<ar:FECAEDetRequest>' +
    `<ar:Concepto>${d.concepto}</ar:Concepto>` +
    `<ar:DocTipo>${d.docTipo}</ar:DocTipo>` +
    `<ar:DocNro>${escapar(d.docNro || '0')}</ar:DocNro>` +
    `<ar:CbteDesde>${numero}</ar:CbteDesde><ar:CbteHasta>${numero}</ar:CbteHasta>` +
    `<ar:CbteFch>${d.fecha.replace(/-/g, '')}</ar:CbteFch>` +
    `<ar:ImpTotal>${importe(d.totalCentavos)}</ar:ImpTotal>` +
    '<ar:ImpTotConc>0.00</ar:ImpTotConc>' +
    `<ar:ImpNeto>${importe(neto)}</ar:ImpNeto>` +
    '<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib>' +
    `<ar:ImpIVA>${importe(iva)}</ar:ImpIVA>` +
    '<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>' +
    `<ar:CondicionIVAReceptorId>${d.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    asociado +
    bloqueIva +
    '</ar:FECAEDetRequest>'
  );
}

export function sobreSolicitar(c: Credenciales, puntoVenta: number, numero: number, d: DatosComprobante): string {
  return sobre(
    'FECAESolicitar',
    auth(c) +
      `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${d.tipo}</ar:CbteTipo></ar:FeCabReq>` +
      `<ar:FeDetReq>${xmlDetalle(numero, puntoVenta, d)}</ar:FeDetReq></ar:FeCAEReq>`,
  );
}

function mensajes(xml: string, contenedor: string, item: string): MensajeArca[] {
  const bloque = etiqueta(xml, contenedor);
  if (!bloque) return [];
  return etiquetas(bloque, item).map((m) => ({
    codigo: Number(etiqueta(m, 'Code') ?? 0),
    mensaje: desescapar(etiqueta(m, 'Msg') ?? ''),
  }));
}

/** Explica los códigos de error más frecuentes. El resto se muestra como lo manda ARCA. */
export function explicarError(e: MensajeArca): string {
  switch (e.codigo) {
    case 600:
    case 601:
      return 'ARCA no acepta este CUIT con este certificado. Falta delegar el servicio "Facturación Electrónica" al certificado.';
    case 501:
    case 502:
      return 'ARCA tuvo un problema interno. Probá de nuevo en un rato.';
    case 10016:
      return 'El número de comprobante no coincide con el siguiente de ARCA. Se vuelve a consultar solo.';
    case 10015:
      return `El documento del cliente no es válido para ARCA (${e.mensaje}).`;
    case 10242:
      return 'Falta indicar la condición frente al IVA del cliente.';
    default:
      return `ARCA: ${e.mensaje} (código ${e.codigo}).`;
  }
}

function fallaSi(xml: string): void {
  const falla = etiqueta(xml, 'faultstring');
  if (falla) throw new ErrorDeArca(`ARCA respondió con un error: ${desescapar(falla)}`);
  const errores = mensajes(xml, 'Errors', 'Err');
  if (errores.length) throw new ErrorDeArca(errores.map(explicarError).join(' '), String(errores[0]!.codigo));
}

export function leerRespuestaSolicitar(xml: string, tipo: number, puntoVenta: number): ComprobanteAutorizado {
  fallaSi(xml);
  const resultado = (etiqueta(xml, 'Resultado') ?? 'R') as ResultadoArca;
  const detalle = etiqueta(xml, 'FECAEDetResponse') ?? '';
  const observaciones = mensajes(detalle, 'Observaciones', 'Obs');
  const numero = Number(etiqueta(detalle, 'CbteDesde') ?? 0);
  if (resultado === 'R') {
    const motivo = observaciones.map(explicarError).join(' ') || 'ARCA rechazó el comprobante.';
    throw new ErrorDeArca(motivo, String(observaciones[0]?.codigo ?? ''));
  }
  const cae = etiqueta(detalle, 'CAE') ?? '';
  const vto = etiqueta(detalle, 'CAEFchVto') ?? '';
  if (!cae || cae.length < 10 || !vto) throw new ErrorDeArca('ARCA no devolvió el CAE.');
  return {
    resultado,
    tipo,
    puntoVenta,
    numero,
    cae,
    vencimientoCae: `${vto.slice(0, 4)}-${vto.slice(4, 6)}-${vto.slice(6, 8)}`,
    observaciones,
  };
}

export function sobreConsultar(c: Credenciales, puntoVenta: number, tipo: number, numero: number): string {
  return sobre('FECompConsultar', `${auth(c)}<ar:FeCompConsReq><ar:CbteTipo>${tipo}</ar:CbteTipo><ar:CbteNro>${numero}</ar:CbteNro><ar:PtoVta>${puntoVenta}</ar:PtoVta></ar:FeCompConsReq>`);
}

const aFecha = (t: string | null) => (t && t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : '');
/** "123.45" → 12345 (sin errores de coma flotante). */
const aCentavos = (t: string | null) => {
  const [e = '0', d = ''] = (t ?? '0').split('.');
  return Number(e) * 100 + Number((d + '00').slice(0, 2)) * (e.startsWith('-') ? -1 : 1);
};

/** Lee FECompConsultar. Devuelve null si ARCA dice que ese número no existe (código 602). */
export function leerRespuestaConsultar(xml: string, tipo: number, puntoVenta: number, numero: number): ComprobanteConsultado | null {
  try {
    fallaSi(xml);
  } catch (e) {
    if (e instanceof ErrorDeArca && e.codigo === '602') return null;
    throw e;
  }
  const r = etiqueta(xml, 'ResultGet');
  if (!r) return null;
  const aso = etiqueta(r, 'CbteAsoc');
  const cae = etiqueta(r, 'CodAutorizacion') ?? '';
  if (!cae) return null;
  return {
    tipo,
    puntoVenta,
    numero,
    docTipo: Number(etiqueta(r, 'DocTipo') ?? 0),
    docNro: etiqueta(r, 'DocNro') ?? '0',
    fecha: aFecha(etiqueta(r, 'CbteFch')),
    totalCentavos: aCentavos(etiqueta(r, 'ImpTotal')),
    cae,
    vencimientoCae: aFecha(etiqueta(r, 'FchVto')),
    resultado: (etiqueta(r, 'Resultado') ?? 'A') as ResultadoArca,
    asociado: aso ? { tipo: Number(etiqueta(aso, 'Tipo') ?? 0), puntoVenta: Number(etiqueta(aso, 'PtoVta') ?? 0), numero: Number(etiqueta(aso, 'Nro') ?? 0) } : undefined,
  };
}

export class ClienteWsfe {
  constructor(
    private readonly ambiente: Ambiente,
    private readonly transporte: Transporte,
  ) {}

  private llamar(operacion: string, xml: string): Promise<string> {
    return this.transporte(DIRECCIONES[this.ambiente].wsfe, `${ESPACIO}${operacion}`, xml);
  }

  /** ¿Están andando los servidores de ARCA? No necesita ticket. */
  async estado(): Promise<{ app: string; db: string; auth: string }> {
    const xml = await this.llamar('FEDummy', sobre('FEDummy', ''));
    fallaSi(xml);
    return { app: etiqueta(xml, 'AppServer') ?? '?', db: etiqueta(xml, 'DbServer') ?? '?', auth: etiqueta(xml, 'AuthServer') ?? '?' };
  }

  /** Último número autorizado para ese punto de venta y tipo (0 si todavía no hay). */
  async ultimoAutorizado(c: Credenciales, puntoVenta: number, tipo: number): Promise<number> {
    const xml = await this.llamar('FECompUltimoAutorizado', sobre('FECompUltimoAutorizado', `${auth(c)}<ar:PtoVta>${puntoVenta}</ar:PtoVta><ar:CbteTipo>${tipo}</ar:CbteTipo>`));
    fallaSi(xml);
    return Number(etiqueta(xml, 'CbteNro') ?? 0);
  }

  /** Un comprobante que ya está en ARCA (null si ese número no existe). */
  async consultar(c: Credenciales, puntoVenta: number, tipo: number, numero: number): Promise<ComprobanteConsultado | null> {
    const xml = await this.llamar('FECompConsultar', sobreConsultar(c, puntoVenta, tipo, numero));
    return leerRespuestaConsultar(xml, tipo, puntoVenta, numero);
  }

  /** Autoriza UN comprobante con el número que corresponde. */
  async autorizar(c: Credenciales, puntoVenta: number, d: DatosComprobante): Promise<ComprobanteAutorizado> {
    const siguiente = (await this.ultimoAutorizado(c, puntoVenta, d.tipo)) + 1;
    const xml = await this.llamar('FECAESolicitar', sobreSolicitar(c, puntoVenta, siguiente, d));
    return leerRespuestaSolicitar(xml, d.tipo, puntoVenta);
  }

  /** Puntos de venta habilitados para facturar por web service. */
  async puntosDeVenta(c: Credenciales): Promise<number[]> {
    const xml = await this.llamar('FEParamGetPtosVenta', sobre('FEParamGetPtosVenta', auth(c)));
    fallaSi(xml);
    return etiquetas(xml, 'PtoVenta')
      .filter((p) => (etiqueta(p, 'Bloqueado') ?? 'N') === 'N')
      .map((p) => Number(etiqueta(p, 'Nro')))
      .filter((n) => n > 0);
  }
}
