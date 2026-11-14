// El QR de la factura: una dirección de ARCA con los datos del comprobante en base64.
// Quien lo escanea ve en ARCA que la factura existe. (RG 4291)
import type { ComprobanteAutorizado } from './tipos';
import { importe } from './wsfe';

export interface DatosQr {
  comprobante: ComprobanteAutorizado;
  /** AAAA-MM-DD */
  fecha: string;
  cuitEmisor: string;
  totalCentavos: number;
  docTipo: number;
  docNro: string;
}

export function urlQr(d: DatosQr): string {
  const json = {
    ver: 1,
    fecha: d.fecha,
    cuit: Number(d.cuitEmisor),
    ptoVta: d.comprobante.puntoVenta,
    tipoCmp: d.comprobante.tipo,
    nroCmp: d.comprobante.numero,
    importe: Number(importe(d.totalCentavos)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: d.docTipo,
    nroDocRec: Number(d.docNro || 0),
    tipoCodAut: 'E',
    codAut: Number(d.comprobante.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(json)).toString('base64')}`;
}
