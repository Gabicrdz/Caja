import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generarQr, qrComoSvg } from '../src/compartido/qr';
import type { ComprobanteResumen, PedidoDetalle } from '../src/compartido/tipos';
import { htmlTicket, type DatosEmisor } from '../src/main/impresion/plantillas';
import { urlQr } from '../src/main/arca/qr';

const $ = (n: number) => n * 100;
const huella = (texto: string) =>
  createHash('sha1')
    .update(generarQr(texto).map((f) => f.map((v) => (v ? '1' : '0')).join('')).join('\n'))
    .digest('hex');

const urlDeEjemplo = urlQr({
  comprobante: { resultado: 'A', tipo: 11, puntoVenta: 1, numero: 1, cae: '86461069119998', vencimientoCae: '2026-11-24', observaciones: [] },
  fecha: '2026-11-14',
  cuitEmisor: '20446474937',
  totalCentavos: $(8000),
  docTipo: 99,
  docNro: '0',
});

describe('código QR', () => {
  it('tiene el tamaño de cada versión', () => {
    expect(generarQr('hola')).toHaveLength(21); // versión 1
    expect(generarQr('http://192.168.0.10:3000/mozo.html')).toHaveLength(29); // versión 3 (nivel M)
    expect(generarQr(urlDeEjemplo)).toHaveLength(61); // versión 11 (nivel L)
  });

  it('los tres cuadrados de las esquinas están donde van', () => {
    const m = generarQr(urlDeEjemplo);
    const n = m.length;
    for (const [f, c] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      expect(m[f]![c]).toBe(true);
      expect(m[f + 3]![c + 3]).toBe(true);
      expect(m[f + 1]![c + 1]).toBe(false);
      expect(m[f + 6]![c + 6]).toBe(true);
    }
  });

  it('el dibujo no cambia (se verificó que un lector de QR lo decodifica)', () => {
    expect(huella(urlDeEjemplo)).toBe('4eba6619680dd56f28a4cb49650b82fde5fd08e1');
    expect(huella('hola')).toBe('54222151106bce232495496d00c563a7cbd78986');
    expect(huella('http://192.168.0.10:3000/mozo.html')).toBe('3b268590ba3bb212e5c29c48c04e6dcfc513ab67');
  });

  it('un texto demasiado largo da un error claro', () => {
    expect(() => generarQr('x'.repeat(500))).toThrow('demasiado largo');
  });

  it('el SVG tiene el tamaño pedido', () => {
    const svg = qrComoSvg('hola', 30);
    expect(svg).toContain('width="30mm"');
    expect(svg).toContain('viewBox="0 0 25 25"');
  });

  it('la dirección de ARCA lleva los datos del comprobante en base64', () => {
    const [base, p] = urlDeEjemplo.split('?p=');
    expect(base).toBe('https://www.afip.gob.ar/fe/qr/');
    expect(JSON.parse(Buffer.from(p!, 'base64').toString())).toEqual({
      ver: 1, fecha: '2026-11-14', cuit: 20446474937, ptoVta: 1, tipoCmp: 11, nroCmp: 1, importe: 8000, moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: 'E', codAut: 86461069119998,
    });
  });
});

const comprobante = (tipo: number, nombre: string, numero: number, extra: Partial<ComprobanteResumen> = {}): ComprobanteResumen => ({
  id: numero, tipo, nombre, puntoVenta: 1, numero, numeroCompleto: `0001-${String(numero).padStart(8, '0')}`, fecha: '2026-11-14', totalCentavos: $(26800),
  cae: '86461069119998', vencimientoCae: '2026-11-24', docTipo: 99, docNro: '0', condicionIvaReceptor: 5, ambiente: 'homologacion', cuitEmisor: '20446474937', ...extra,
});
const pedido: PedidoDetalle = {
  id: 1, numero: 12, fecha: '2026-11-14', hora: '21:15', tipo: 'mostrador', mesa: '', clienteNombre: '', clienteTelefono: '', clienteDireccion: '', nota: '',
  subtotalCentavos: $(26800), envioCentavos: 0, totalCentavos: $(26800), estado: 'entregado', cobrado: true, motivoAnulacion: '',
  items: [{ id: 1, nombre: 'Clásica', varianteNombre: '', cantidad: 2, unitarioCentavos: $(13400), agregadosCentavos: 0, totalCentavos: $(26800), nota: '', vaACocina: true, agregados: [] }],
  pagos: [{ medio: 'efectivo', montoCentavos: $(26800), recibidoCentavos: $(26800), vueltoCentavos: 0 }],
  comprobante: null, notaDeCredito: null, facturaPendiente: null,
};
const emisor: DatosEmisor = { razonSocial: 'Cardozo Sergio <SRL>', cuit: '20446474937', condicionIva: 'monotributo', ingresosBrutos: 'Exento', inicioActividades: '2024-03-01' };
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('ticket con factura', () => {
  it('sin factura sigue siendo un ticket "no válido como factura"', () => {
    const t = texto(htmlTicket(pedido, 'La Esquina', 80));
    expect(t).toContain('Comprobante no válido como factura');
    expect(t).not.toContain('CAE');
  });

  it('Factura C: emisor, número, cliente, CAE, QR y marca de prueba', () => {
    const html = htmlTicket({ ...pedido, comprobante: comprobante(11, 'Factura C', 1) }, { nombre: 'La Esquina', direccion: 'Belgrano 845' }, 80, emisor);
    const t = texto(html);
    expect(t).toContain('FACTURA · Cód. 011');
    expect(t).toContain('Nº 0001-00000001');
    expect(t).toContain('CUIT 20-44647493-7 · Responsable Monotributo');
    expect(t).toContain('Ingresos Brutos: Exento');
    expect(t).toContain('Inicio de actividades: 01/03/2024');
    expect(t).toContain('Cliente: Consumidor Final');
    expect(t).toContain('CAE Nº 86461069119998');
    expect(t).toContain('Vto. CAE 24/11/2024'.replace('2024', '2026'));
    expect(t).toContain('SIN VALIDEZ FISCAL');
    expect(t).not.toContain('no válido como factura');
    expect(t).not.toContain('IVA');
    expect(html).toContain('<svg');
  });

  it('escapa la razón social escrita por una persona', () => {
    const html = htmlTicket({ ...pedido, comprobante: comprobante(11, 'Factura C', 1) }, 'La Esquina', 80, emisor);
    expect(html).toContain('Cardozo Sergio &lt;SRL&gt;');
    expect(html).not.toContain('<SRL>');
  });

  it('en producción no lleva la marca de prueba', () => {
    const t = texto(htmlTicket({ ...pedido, comprobante: comprobante(11, 'Factura C', 1, { ambiente: 'produccion' }) }, 'La Esquina', 80, emisor));
    expect(t).not.toContain('SIN VALIDEZ FISCAL');
    expect(t).toContain('Comprobante autorizado por ARCA');
  });

  it('con DNI o CUIT muestra el documento del cliente', () => {
    const dni = texto(htmlTicket({ ...pedido, comprobante: comprobante(11, 'Factura C', 1, { docTipo: 96, docNro: '30123456' }) }, 'x', 80, emisor));
    expect(dni).toContain('Cliente: DNI 30123456 · Consumidor Final');
    const cuit = texto(htmlTicket({ ...pedido, comprobante: comprobante(1, 'Factura A', 2, { docTipo: 80, docNro: '30712345678', condicionIvaReceptor: 1 }) }, 'x', 80, { ...emisor, condicionIva: 'responsable_inscripto' }));
    expect(cuit).toContain('Cliente: CUIT 30-71234567-8 · IVA Responsable Inscripto');
  });

  it('Factura A discrimina el IVA y la B lo informa', () => {
    const emRI: DatosEmisor = { ...emisor, condicionIva: 'responsable_inscripto' };
    const a = texto(htmlTicket({ ...pedido, comprobante: comprobante(1, 'Factura A', 2, { docTipo: 80, docNro: '30712345678', condicionIvaReceptor: 1 }) }, 'x', 80, emRI));
    expect(a).toContain('Importe neto gravado $ 22.148,76'); // 26.800 / 1,21
    expect(a).toContain('IVA 21 % $ 4.651,24');
    const b = texto(htmlTicket({ ...pedido, comprobante: comprobante(6, 'Factura B', 3) }, 'x', 80, emRI));
    expect(b).toContain('IVA contenido (21 %) $ 4.651,24');
  });

  it('un pedido anulado muestra la nota de crédito y a qué factura corresponde', () => {
    const f = comprobante(11, 'Factura C', 1);
    const nc = comprobante(13, 'Nota de Crédito C', 2);
    const t = texto(htmlTicket({ ...pedido, estado: 'anulado', comprobante: f, notaDeCredito: nc }, 'x', 80, emisor));
    expect(t).toContain('NOTA DE CRÉDITO · Cód. 013');
    expect(t).toContain('Nº 0001-00000002');
    expect(t).toContain('Anula la Factura C Nº 0001-00000001');
    expect(t).not.toContain('Efectivo');
  });
});
