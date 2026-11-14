import { describe, expect, it } from 'vitest';
import { createPublicKey, createVerify, X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { firmarCms, datosDelCertificado } from '../src/main/arca/cms';
import { leer } from '../src/main/arca/der';
import { crearTra, leerTicket, pedirTicket, sobreLoginCms } from '../src/main/arca/wsaa';
import { desglosarIva, importe, leerRespuestaSolicitar, sobreSolicitar, xmlDetalle } from '../src/main/arca/wsfe';
import { notaDeCreditoDe, problemaDeConfig, ServicioArca, tipoDeFactura } from '../src/main/arca/servicio';
import { urlQr } from '../src/main/arca/qr';
import { TIPO_COMPROBANTE, type ConfigArca, type DatosComprobante } from '../src/main/arca/tipos';
import { opcionesTls, type Transporte } from '../src/main/arca/transporte';
import { CERTIFICADO_PRUEBA, CLAVE_PRUEBA } from './fixtures-arca';
import { cuitConGuiones, cuitValido, soloNumeros } from '../src/compartido/cuit';
import { esquemaArca } from '../src/compartido/esquemas';
import { existeArchivo, guardarTicket, importarArchivo, leerTicket as leerTicketGuardado, vencimientoDelCertificado } from '../src/main/arca/almacen';
import { abrirBaseDeDatos, cerrarBaseDeDatos } from '../src/main/db/conexion';
import { guardarDatosArca, obtenerDatosArca } from '../src/main/servicios/configuracion';

const AHORA = Date.UTC(2026, 10, 14, 15, 0, 0); // 14/11/2026 12:00 en Argentina

const CONFIG: ConfigArca = {
  activa: true,
  ambiente: 'homologacion',
  cuit: '20446474937',
  puntoVenta: 1,
  condicionIva: 'monotributo',
  rutaCertificado: 'cert.crt',
  rutaClave: 'clave.key',
};
const leerArchivo = (ruta: string) => (ruta === 'cert.crt' ? CERTIFICADO_PRUEBA : CLAVE_PRUEBA);

// ── Respuestas de ARCA simuladas (con la forma de las reales) ──
const escapar = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TICKET_XML = `<?xml version="1.0"?><loginTicketResponse version="1"><header><expirationTime>2026-11-15T00:00:00.000-03:00</expirationTime></header><credentials><token>TOKEN123</token><sign>FIRMA456</sign></credentials></loginTicketResponse>`;
const respuestaLogin = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse><loginCmsReturn>${escapar(TICKET_XML)}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
const sobreRespuesta = (cuerpo: string) => `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${cuerpo}</soap:Body></soap:Envelope>`;
const dummy = (estado = 'OK') => sobreRespuesta(`<FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEDummyResult><AppServer>${estado}</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></FEDummyResult></FEDummyResponse>`);
const ultimo = (n: number) => sobreRespuesta(`<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>1</PtoVta><CbteTipo>11</CbteTipo><CbteNro>${n}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`);
const aprobada = (n: number) =>
  sobreRespuesta(
    `<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>1</Concepto><CbteDesde>${n}</CbteDesde><CbteHasta>${n}</CbteHasta><Resultado>A</Resultado><CAE>74123456789012</CAE><CAEFchVto>20261124</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`,
  );
const rechazada = sobreRespuesta(
  `<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>5</CbteDesde><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>DocNro invalido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`,
);
const conError = (codigo: number, msg: string) => sobreRespuesta(`<R><Errors><Err><Code>${codigo}</Code><Msg>${msg}</Msg></Err></Errors></R>`);

/** Transporte falso: contesta según a qué operación le hablan y guarda lo que se le mandó. */
function transporteFalso(respuestas: Partial<Record<string, string | (() => string)>> = {}) {
  const llamadas: { operacion: string; cuerpo: string; url: string }[] = [];
  const t: Transporte = async (url, accion, cuerpo) => {
    const operacion = url.includes('LoginCms') ? 'login' : (accion.split('/').pop() ?? '');
    llamadas.push({ operacion, cuerpo, url });
    const r = respuestas[operacion];
    if (r === undefined) throw new Error(`Sin respuesta simulada para ${operacion}`);
    return typeof r === 'function' ? r() : r;
  };
  return { t, llamadas };
}

const COMPROBANTE: DatosComprobante = {
  tipo: TIPO_COMPROBANTE.facturaC,
  concepto: 1,
  docTipo: 99,
  docNro: '0',
  condicionIvaReceptor: 5,
  fecha: '2026-11-14',
  totalCentavos: 1250000,
};

async function falla(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    return (e as Error).message;
  }
  return '(no falló)';
}

describe('Firma CMS (el pedido de acceso firmado)', () => {
  const contenido = Buffer.from('<loginTicketRequest>hola</loginTicketRequest>');

  it('lee el emisor y el número de serie del certificado', () => {
    const der = Buffer.from(new X509Certificate(CERTIFICADO_PRUEBA).raw);
    const { emisor, serie } = datosDelCertificado(der);
    expect(emisor[0]).toBe(0x30);
    expect(serie[0]).toBe(0x02);
    expect(leer(emisor, 0).hasta).toBe(emisor.length);
  });

  it('la firma es válida: se verifica con la clave pública del certificado', () => {
    const cms = firmarCms(contenido, CERTIFICADO_PRUEBA, CLAVE_PRUEBA, new Date(AHORA));
    // Recorremos el DER: ContentInfo → [0] → SignedData → signerInfos → SignerInfo.
    const hijos = (buf: Buffer, desde: number, hasta: number) => {
      const lista = [];
      for (let pos = desde; pos < hasta; ) {
        const n = leer(buf, pos);
        lista.push(n);
        pos = n.hasta;
      }
      return lista;
    };
    const contentInfo = leer(cms, 0);
    const explicito = hijos(cms, contentInfo.desde, contentInfo.hasta)[1]!;
    const datosFirmados = leer(cms, explicito.desde);
    const partes = hijos(cms, datosFirmados.desde, datosFirmados.hasta);
    const firmantes = partes[partes.length - 1]!; // SET de SignerInfo
    const firmante = leer(cms, firmantes.desde);
    const campos = hijos(cms, firmante.desde, firmante.hasta);
    const atributos = campos[3]!; // [0] signedAttrs
    const firma = cms.subarray(campos[5]!.desde, campos[5]!.hasta);
    // Para firmar, la etiqueta [0] (0xA0) se cambia por la de SET (0x31).
    const aFirmar = Buffer.from(cms.subarray(atributos.inicio, atributos.hasta));
    aFirmar[0] = 0x31;
    const publica = createPublicKey(CERTIFICADO_PRUEBA);
    expect(createVerify('sha256').update(aFirmar).verify(publica, firma)).toBe(true);
    // Y si cambia un solo byte de lo firmado, ya no verifica.
    aFirmar[aFirmar.length - 1] = (aFirmar[aFirmar.length - 1] ?? 0) ^ 1;
    expect(createVerify('sha256').update(aFirmar).verify(publica, firma)).toBe(false);
  });

  it('OpenSSL la acepta y recupera el contenido (si hay openssl instalado)', () => {
    const prueba = spawnSync('openssl', ['version']);
    if (prueba.status !== 0) return; // en la PC del dueño puede no estar: se omite
    const dir = mkdtempSync(path.join(tmpdir(), 'cms-'));
    writeFileSync(path.join(dir, 'f.der'), firmarCms(contenido, CERTIFICADO_PRUEBA, CLAVE_PRUEBA, new Date(AHORA)));
    const r = spawnSync('openssl', ['cms', '-verify', '-inform', 'DER', '-in', path.join(dir, 'f.der'), '-noverify'], { encoding: 'buffer' });
    expect(r.status).toBe(0);
    expect(r.stdout.toString()).toBe(contenido.toString());
  });
});

describe('WSAA: ticket de acceso', () => {
  it('el pedido (TRA) tiene hora argentina y el servicio wsfe', () => {
    const tra = crearTra('wsfe', AHORA);
    expect(tra).toContain('<service>wsfe</service>');
    expect(tra).toContain('<generationTime>2026-11-14T11:00:00-03:00</generationTime>');
    expect(tra).toContain('<expirationTime>2026-11-14T13:00:00-03:00</expirationTime>');
  });

  it('lee token, firma y vencimiento de la respuesta', () => {
    const t = leerTicket(respuestaLogin);
    expect(t.token).toBe('TOKEN123');
    expect(t.sign).toBe('FIRMA456');
    expect(t.venceMs).toBe(Date.UTC(2026, 10, 15, 3, 0, 0));
  });

  it('traduce los errores de ARCA a un mensaje claro', () => {
    const falla1 = `<soapenv:Fault><faultstring>ns1:cms.cert.untrusted: Certificado no emitido por AC de confianza</faultstring></soapenv:Fault>`;
    expect(() => leerTicket(falla1)).toThrow('ARCA rechazó el acceso');
    const falla2 = `<soapenv:Fault><faultstring>El CEE ya posee un TA valido para el acceso al WS solicitado</faultstring></soapenv:Fault>`;
    expect(() => leerTicket(falla2)).toThrow('ya entregó un acceso válido');
    const falla3 = `<soapenv:Fault><faultstring>Computador no autorizado a acceder al servicio</faultstring></soapenv:Fault>`;
    expect(() => leerTicket(falla3)).toThrow('Falta autorizarlo');
  });

  it('pide el ticket al servidor correcto con el CMS en base64', async () => {
    const { t, llamadas } = transporteFalso({ login: respuestaLogin });
    const ticket = await pedirTicket({ ambiente: 'homologacion', certificadoPem: CERTIFICADO_PRUEBA, clavePem: CLAVE_PRUEBA, ahoraMs: AHORA, transporte: t });
    expect(ticket.token).toBe('TOKEN123');
    expect(llamadas[0]!.url).toBe('https://wsaahomo.afip.gov.ar/ws/services/LoginCms');
    const m = /<wsaa:in0>([A-Za-z0-9+/=]+)<\/wsaa:in0>/.exec(llamadas[0]!.cuerpo);
    expect(m).toBeDefined();
    expect(Buffer.from(m![1]!, 'base64')[0]).toBe(0x30);
    expect(sobreLoginCms('AAAA')).toContain('<wsaa:in0>AAAA</wsaa:in0>');
  });
});

describe('WSFE: importes y comprobantes', () => {
  it('formatea los importes con 2 decimales', () => {
    expect(importe(1250000)).toBe('12500.00');
    expect(importe(5)).toBe('0.05');
    expect(importe(100)).toBe('1.00');
  });

  it('separa el IVA de un total que ya lo incluye', () => {
    expect(desglosarIva(12100, 5)).toEqual({ neto: 10000, iva: 2100 });
    expect(desglosarIva(10000, 3)).toEqual({ neto: 10000, iva: 0 });
    const { neto, iva } = desglosarIva(99999, 5);
    expect(neto + iva).toBe(99999);
  });

  it('factura C: sin bloque de IVA y neto = total', () => {
    const xml = xmlDetalle(8, 1, COMPROBANTE);
    expect(xml).toContain('<ar:ImpTotal>12500.00</ar:ImpTotal>');
    expect(xml).toContain('<ar:ImpNeto>12500.00</ar:ImpNeto>');
    expect(xml).toContain('<ar:ImpIVA>0.00</ar:ImpIVA>');
    expect(xml.includes('<ar:Iva>')).toBe(false);
    expect(xml).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>');
    expect(xml).toContain('<ar:CbteFch>20261114</ar:CbteFch>');
  });

  it('factura B: separa el IVA 21 %', () => {
    const xml = xmlDetalle(3, 1, { ...COMPROBANTE, tipo: TIPO_COMPROBANTE.facturaB, totalCentavos: 12100 });
    expect(xml).toContain('<ar:ImpNeto>100.00</ar:ImpNeto>');
    expect(xml).toContain('<ar:ImpIVA>21.00</ar:ImpIVA>');
    expect(xml).toContain('<ar:Id>5</ar:Id><ar:BaseImp>100.00</ar:BaseImp><ar:Importe>21.00</ar:Importe>');
  });

  it('la nota de crédito lleva el comprobante que anula', () => {
    const xml = xmlDetalle(2, 1, { ...COMPROBANTE, tipo: TIPO_COMPROBANTE.notaCreditoC, asociado: { tipo: 11, puntoVenta: 1, numero: 8 } });
    expect(xml).toContain('<ar:CbteAsoc><ar:Tipo>11</ar:Tipo><ar:PtoVta>1</ar:PtoVta><ar:Nro>8</ar:Nro></ar:CbteAsoc>');
  });

  it('el pedido lleva las credenciales y el tipo de comprobante', () => {
    const xml = sobreSolicitar({ cuit: '20446474937', ticket: { token: 'T', sign: 'S', venceMs: 0 } }, 3, 9, COMPROBANTE);
    expect(xml).toContain('<ar:Token>T</ar:Token><ar:Sign>S</ar:Sign><ar:Cuit>20446474937</ar:Cuit>');
    expect(xml).toContain('<ar:PtoVta>3</ar:PtoVta><ar:CbteTipo>11</ar:CbteTipo>');
    expect(xml).toContain('<ar:CbteDesde>9</ar:CbteDesde><ar:CbteHasta>9</ar:CbteHasta>');
  });

  it('lee el CAE y su vencimiento de una respuesta aprobada', () => {
    const r = leerRespuestaSolicitar(aprobada(8), 11, 1);
    expect(r).toMatchObject({ resultado: 'A', numero: 8, cae: '74123456789012', vencimientoCae: '2026-11-24', tipo: 11, puntoVenta: 1 });
  });

  it('una factura rechazada o con errores lanza un mensaje claro', () => {
    expect(() => leerRespuestaSolicitar(rechazada, 11, 1)).toThrow('documento del cliente');
    expect(() => leerRespuestaSolicitar(conError(600, 'ValidacionDeToken'), 11, 1)).toThrow('Facturación Electrónica');
    expect(() => leerRespuestaSolicitar(conError(9999, 'Raro'), 11, 1)).toThrow('código 9999');
  });
});

describe('ServicioArca', () => {
  function servicio(respuestas: Parameters<typeof transporteFalso>[0], config: Partial<ConfigArca> = {}, extra: Record<string, unknown> = {}) {
    const f = transporteFalso(respuestas);
    const s = new ServicioArca({ config: { ...CONFIG, ...config }, transporte: f.t, leerArchivo, ahora: () => AHORA, ...extra });
    return { s, ...f };
  }

  it('autoriza una factura C: pide el ticket, consulta el último número y usa el siguiente', async () => {
    const { s, llamadas } = servicio({ login: respuestaLogin, FECompUltimoAutorizado: ultimo(7), FECAESolicitar: aprobada(8) });
    const r = await s.autorizar(COMPROBANTE);
    expect(r.numero).toBe(8);
    expect(r.cae).toBe('74123456789012');
    expect(llamadas.map((l) => l.operacion)).toEqual(['login', 'FECompUltimoAutorizado', 'FECAESolicitar']);
    expect(llamadas[2]!.cuerpo).toContain('<ar:CbteDesde>8</ar:CbteDesde>');
    expect(llamadas[2]!.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');
  });

  it('reutiliza el ticket mientras sirve (no pide otro login)', async () => {
    const { s, llamadas } = servicio({ login: respuestaLogin, FECompUltimoAutorizado: ultimo(0), FECAESolicitar: aprobada(1) });
    await s.autorizar(COMPROBANTE);
    await s.autorizar(COMPROBANTE);
    expect(llamadas.filter((l) => l.operacion === 'login')).toHaveLength(1);
  });

  it('usa el ticket guardado en disco si todavía sirve', async () => {
    const guardado = { token: 'DEL_DISCO', sign: 'S', venceMs: AHORA + 3600_000 };
    const { s, llamadas } = servicio({ FECompUltimoAutorizado: ultimo(0), FECAESolicitar: aprobada(1) }, {}, { leerTicket: () => guardado });
    await s.autorizar(COMPROBANTE);
    expect(llamadas.some((l) => l.operacion === 'login')).toBe(false);
    expect(llamadas[0]!.cuerpo).toContain('<ar:Token>DEL_DISCO</ar:Token>');
  });

  it('guarda el ticket nuevo para la próxima vez', async () => {
    const guardados: string[] = [];
    const { s } = servicio({ login: respuestaLogin, FECompUltimoAutorizado: ultimo(0), FECAESolicitar: aprobada(1) }, {}, { guardarTicket: (k: string) => guardados.push(k) });
    await s.autorizar(COMPROBANTE);
    expect(guardados).toEqual(['homologacion-20446474937']);
  });

  it('si el ticket venció (error 600), pide uno nuevo y reintenta una vez', async () => {
    let intento = 0;
    const { s, llamadas } = servicio({
      login: respuestaLogin,
      FECompUltimoAutorizado: () => (++intento === 1 ? conError(600, 'token vencido') : ultimo(0)),
      FECAESolicitar: aprobada(1),
    });
    const r = await s.autorizar(COMPROBANTE);
    expect(r.cae).toBe('74123456789012');
    expect(llamadas.filter((l) => l.operacion === 'login')).toHaveLength(2);
  });

  it('no autoriza si faltan datos en Ajustes', async () => {
    const { s } = servicio({}, { rutaClave: '' });
    expect(await falla(s.autorizar(COMPROBANTE))).toContain('clave privada');
  });

  it('prueba de conexión: todos los pasos bien', async () => {
    const { s } = servicio({ FEDummy: dummy(), login: respuestaLogin, FECompUltimoAutorizado: ultimo(12) });
    const pasos = await s.probar();
    expect(pasos.map((p) => p.ok)).toEqual([true, true, true, true, true]);
    expect(pasos[4]!.detalle).toContain('Factura C');
    expect(pasos[4]!.detalle).toContain('12');
  });

  it('prueba de conexión: se detiene en el paso que falla y lo explica', async () => {
    const { s } = servicio({
      FEDummy: dummy(),
      login: sobreRespuesta('<soapenv:Fault><faultstring>Computador no autorizado a acceder al servicio</faultstring></soapenv:Fault>'),
    });
    const pasos = await s.probar();
    const ultimoPaso = pasos[pasos.length - 1]!;
    expect(ultimoPaso.paso).toBe('Acceso (WSAA)');
    expect(ultimoPaso.ok).toBe(false);
    expect(ultimoPaso.detalle).toContain('Falta autorizarlo');
  });

  it('prueba de conexión: ARCA caído no intenta el login', async () => {
    const { s, llamadas } = servicio({ FEDummy: dummy('NO') });
    const pasos = await s.probar();
    expect(pasos[pasos.length - 1]!.ok).toBe(false);
    expect(llamadas).toHaveLength(1);
  });

  it('una falla de red se informa sin romper', async () => {
    const f: Transporte = async () => {
      throw new Error('No se pudo conectar con ARCA (ENOTFOUND).');
    };
    const s = new ServicioArca({ config: CONFIG, transporte: f, leerArchivo, ahora: () => AHORA });
    const pasos = await s.probar();
    expect(pasos[pasos.length - 1]!.detalle).toContain('No se pudo conectar');
  });
});

describe('Reglas del emisor', () => {
  it('valida lo cargado en Ajustes', () => {
    expect(problemaDeConfig(CONFIG)).toBeNull();
    expect(problemaDeConfig({ ...CONFIG, cuit: '20-44647493-7' })).toContain('11 números');
    expect(problemaDeConfig({ ...CONFIG, puntoVenta: 0 })).toContain('punto de venta');
    expect(problemaDeConfig({ ...CONFIG, rutaCertificado: '' })).toContain('certificado');
  });

  it('el monotributista siempre emite factura C; el inscripto A o B según el cliente', () => {
    expect(tipoDeFactura(CONFIG, 5)).toBe(11);
    expect(tipoDeFactura(CONFIG, 1)).toBe(11);
    const ri = { ...CONFIG, condicionIva: 'responsable_inscripto' as const };
    expect(tipoDeFactura(ri, 1)).toBe(1);
    expect(tipoDeFactura(ri, 5)).toBe(6);
  });

  it('cada factura tiene su nota de crédito', () => {
    expect(notaDeCreditoDe(11)).toBe(13);
    expect(notaDeCreditoDe(6)).toBe(8);
    expect(notaDeCreditoDe(1)).toBe(3);
    expect(() => notaDeCreditoDe(99)).toThrow('Solo se pueden anular');
  });
});

describe('QR de la factura', () => {
  it('arma la dirección con los datos en base64', () => {
    const comprobante = leerRespuestaSolicitar(aprobada(8), 11, 1);
    const url = urlQr({ comprobante, fecha: '2026-11-14', cuitEmisor: '20446474937', totalCentavos: 1250000, docTipo: 99, docNro: '0' });
    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true);
    const datos = JSON.parse(Buffer.from(url.split('?p=')[1]!, 'base64').toString());
    expect(datos).toEqual({
      ver: 1,
      fecha: '2026-11-14',
      cuit: 20446474937,
      ptoVta: 1,
      tipoCmp: 11,
      nroCmp: 8,
      importe: 12500,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 99,
      nroDocRec: 0,
      tipoCodAut: 'E',
      codAut: 74123456789012,
    });
  });
});

describe('CUIT', () => {
  it('valida el dígito verificador', () => {
    expect(cuitValido('20446474937')).toBe(true);
    expect(cuitValido('20446474938')).toBe(false);
    expect(cuitValido('2044647493')).toBe(false);
    expect(cuitValido('30-71234567-0'.replace(/\D/g, ''))).toBe(false);
  });

  it('acepta guiones y espacios al escribirlo', () => {
    expect(soloNumeros(' 20-44647493-7 ')).toBe('20446474937');
    expect(cuitConGuiones('20446474937')).toBe('20-44647493-7');
  });

  it('el esquema de Ajustes normaliza el CUIT y rechaza los inválidos', () => {
    const base = { activa: true, ambiente: 'homologacion', puntoVenta: 1, condicionIva: 'monotributo' } as const;
    expect(esquemaArca.parse({ ...base, cuit: '20-44647493-7' }).cuit).toBe('20446474937');
    expect(() => esquemaArca.parse({ ...base, cuit: '20-44647493-1' })).toThrow('El CUIT no es válido');
    expect(() => esquemaArca.parse({ ...base, cuit: '20446474937', puntoVenta: 0 })).toThrow('punto de venta');
    expect(esquemaArca.parse({ ...base, cuit: '' }).cuit).toBe('');
  });
});

describe('Archivos de ARCA y datos guardados', () => {
  function entorno() {
    const dir = mkdtempSync(path.join(tmpdir(), 'arca-'));
    const cert = path.join(dir, 'origen.crt');
    const clave = path.join(dir, 'origen.key');
    writeFileSync(cert, CERTIFICADO_PRUEBA);
    writeFileSync(clave, CLAVE_PRUEBA);
    return { base: path.join(dir, 'arca'), cert, clave, dir };
  }

  it('copia el certificado y la clave a la carpeta del ambiente', () => {
    const { base, cert, clave } = entorno();
    importarArchivo(base, 'homologacion', 'certificado', cert);
    importarArchivo(base, 'homologacion', 'clave', clave);
    expect(existeArchivo(base, 'homologacion', 'certificado')).toBe(true);
    expect(existeArchivo(base, 'homologacion', 'clave')).toBe(true);
    expect(existeArchivo(base, 'produccion', 'certificado')).toBe(false);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(vencimientoDelCertificado(base, 'homologacion') ?? '')).toBe(true);
  });

  it('no deja poner la clave donde va el certificado ni al revés', () => {
    const { base, cert, clave } = entorno();
    expect(() => importarArchivo(base, 'homologacion', 'certificado', clave)).toThrow('clave privada');
    expect(() => importarArchivo(base, 'homologacion', 'clave', cert)).toThrow('Elegiste el certificado');
  });

  it('rechaza archivos que no son ni certificado ni clave', () => {
    const { base, dir } = entorno();
    const basura = path.join(dir, 'raro.txt');
    writeFileSync(basura, 'hola');
    expect(() => importarArchivo(base, 'homologacion', 'certificado', basura)).toThrow('no es un certificado válido');
    expect(() => importarArchivo(base, 'homologacion', 'clave', basura)).toThrow('no es una clave privada válida');
    expect(() => importarArchivo(base, 'homologacion', 'clave', path.join(dir, 'no-existe.key'))).toThrow('No se pudo leer');
  });

  it('avisa si el certificado no corresponde a la clave', () => {
    const { base, cert, dir } = entorno();
    const otra = path.join(dir, 'otra.key');
    const r = spawnSync('openssl', ['genrsa', '-out', otra, '2048']);
    if (r.status !== 0) return;
    importarArchivo(base, 'homologacion', 'clave', otra);
    expect(() => importarArchivo(base, 'homologacion', 'certificado', cert)).toThrow('no corresponde a la clave');
  });

  it('el ticket se guarda y se lee; un archivo roto se ignora', () => {
    const { base } = entorno();
    expect(leerTicketGuardado(base, 'homologacion-1')).toBeNull();
    guardarTicket(base, 'homologacion-1', { token: 'a', sign: 'b', venceMs: 5 });
    expect(leerTicketGuardado(base, 'homologacion-1')).toEqual({ token: 'a', sign: 'b', venceMs: 5 });
    writeFileSync(path.join(base, 'ticket-roto.json'), '{no es json');
    expect(leerTicketGuardado(base, 'roto')).toBeNull();
  });

  it('los datos de Ajustes se guardan en la base con valores por defecto seguros', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'arca-db-'));
    const db = abrirBaseDeDatos(path.join(dir, 'x.db'));
    try {
      expect(obtenerDatosArca(db)).toEqual({ activa: false, ambiente: 'homologacion', cuit: '', puntoVenta: 1, condicionIva: 'monotributo' });
      guardarDatosArca(db, { activa: true, ambiente: 'produccion', cuit: '20446474937', puntoVenta: 4, condicionIva: 'responsable_inscripto' });
      expect(obtenerDatosArca(db)).toEqual({ activa: true, ambiente: 'produccion', cuit: '20446474937', puntoVenta: 4, condicionIva: 'responsable_inscripto' });
    } finally {
      cerrarBaseDeDatos();
    }
  });
});

describe('Textos de ARCA', () => {
  it('desescapa letras con tilde que llegan como &#xE1;', () => {
    const f = `<soapenv:Fault><faultstring>generationTime posee formato o dato inv&#xE1;lido (m&#xE1;s de 24 horas de antig&#xFC;edad)</faultstring></soapenv:Fault>`;
    expect(() => leerTicket(f)).toThrow('inválido (más de 24 horas de antigüedad)');
  });
});

describe('Conexión TLS', () => {
  it('en Electron no se pide SECLEVEL (BoringSSL lo rechaza con INVALID_COMMAND)', () => {
    expect(opcionesTls(true)).toEqual({});
    expect(opcionesTls(false)).toEqual({ ciphers: 'DEFAULT@SECLEVEL=0' });
  });
});
