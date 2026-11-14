// Junta todo: lee el certificado, pide el ticket (y lo guarda para no pedirlo de más)
// y autoriza comprobantes. No sabe nada de Electron: recibe lo que necesita de afuera,
// así se prueba con respuestas simuladas.
import { X509Certificate } from 'node:crypto';
import { ClienteWsfe } from './wsfe';
import type { Transporte } from './transporte';
import { ErrorDeArca, pedirTicket, type Ticket } from './wsaa';
import { NOMBRE_COMPROBANTE, TIPO_COMPROBANTE, type ComprobanteAutorizado, type ComprobanteConsultado, type ConfigArca, type DatosComprobante } from './tipos';

export interface DependenciasArca {
  config: ConfigArca;
  transporte: Transporte;
  /** Lee un archivo de texto (certificado o clave). */
  leerArchivo(ruta: string): string;
  /** Dónde guardar el ticket entre una ejecución y otra (el WSAA no entrega otro mientras haya uno vigente). */
  guardarTicket?(clave: string, ticket: Ticket): void;
  leerTicket?(clave: string): Ticket | null;
  ahora?: () => number;
}

export interface PasoDePrueba {
  paso: string;
  ok: boolean;
  detalle: string;
}

/** Revisa que lo cargado en Ajustes alcance para hablar con ARCA. Devuelve el problema, o null. */
export function problemaDeConfig(c: ConfigArca): string | null {
  if (!/^\d{11}$/.test(c.cuit)) return 'El CUIT tiene que tener 11 números, sin guiones.';
  if (!Number.isInteger(c.puntoVenta) || c.puntoVenta < 1 || c.puntoVenta > 99999) return 'El punto de venta tiene que ser un número entre 1 y 99999.';
  if (!c.rutaCertificado) return 'Falta elegir el certificado (.crt).';
  if (!c.rutaClave) return 'Falta elegir la clave privada (.key).';
  return null;
}

/** Tipo de factura que corresponde al emisor: monotributo siempre C; responsable inscripto A o B según el cliente. */
export function tipoDeFactura(c: Pick<ConfigArca, 'condicionIva'>, condicionIvaReceptor: number): number {
  if (c.condicionIva === 'monotributo') return TIPO_COMPROBANTE.facturaC;
  return condicionIvaReceptor === 1 ? TIPO_COMPROBANTE.facturaA : TIPO_COMPROBANTE.facturaB;
}

/** La nota de crédito que anula a una factura (mismo tipo de letra). */
export function notaDeCreditoDe(tipoFactura: number): number {
  const mapa: Record<number, number> = { 1: 3, 6: 8, 11: 13 };
  const nc = mapa[tipoFactura];
  if (!nc) throw new ErrorDeArca('Solo se pueden anular facturas A, B o C.');
  return nc;
}

export class ServicioArca {
  private ticket: Ticket | null = null;
  private readonly wsfe: ClienteWsfe;
  private readonly ahora: () => number;

  constructor(private readonly dep: DependenciasArca) {
    this.wsfe = new ClienteWsfe(dep.config.ambiente, dep.transporte);
    this.ahora = dep.ahora ?? (() => Date.now());
  }

  private get claveTicket(): string {
    return `${this.dep.config.ambiente}-${this.dep.config.cuit}`;
  }

  private vigente(t: Ticket | null): t is Ticket {
    // Margen de 5 minutos para no usar un ticket a punto de vencer.
    return !!t && t.venceMs - this.ahora() > 5 * 60_000;
  }

  /** Devuelve un ticket vigente: el de memoria, el del disco o uno nuevo. */
  async obtenerTicket(forzarNuevo = false): Promise<Ticket> {
    if (!forzarNuevo) {
      if (this.vigente(this.ticket)) return this.ticket;
      const guardado = this.dep.leerTicket?.(this.claveTicket) ?? null;
      if (this.vigente(guardado)) {
        this.ticket = guardado;
        return guardado;
      }
    }
    const problema = problemaDeConfig(this.dep.config);
    if (problema) throw new ErrorDeArca(problema);
    let certificadoPem: string;
    let clavePem: string;
    try {
      certificadoPem = this.dep.leerArchivo(this.dep.config.rutaCertificado);
      clavePem = this.dep.leerArchivo(this.dep.config.rutaClave);
    } catch {
      throw new ErrorDeArca('No se pudo leer el certificado o la clave. Volvé a elegirlos en Ajustes.');
    }
    const ticket = await pedirTicket({
      ambiente: this.dep.config.ambiente,
      certificadoPem,
      clavePem,
      ahoraMs: this.ahora(),
      transporte: this.dep.transporte,
    });
    this.ticket = ticket;
    this.dep.guardarTicket?.(this.claveTicket, ticket);
    return ticket;
  }

  private async credenciales(forzarNuevo = false) {
    return { cuit: this.dep.config.cuit, ticket: await this.obtenerTicket(forzarNuevo) };
  }

  /** Recorre los pasos de la conexión y dice en cuál falla. Nunca lanza: devuelve el informe. */
  async probar(): Promise<PasoDePrueba[]> {
    const pasos: PasoDePrueba[] = [];
    const c = this.dep.config;
    const problema = problemaDeConfig(c);
    if (problema) return [{ paso: 'Datos cargados', ok: false, detalle: problema }];
    pasos.push({ paso: 'Datos cargados', ok: true, detalle: `CUIT ${c.cuit}, punto de venta ${c.puntoVenta}, ${c.ambiente === 'homologacion' ? 'pruebas (homologación)' : 'producción'}` });

    try {
      const cert = new X509Certificate(this.dep.leerArchivo(c.rutaCertificado));
      const vence = new Date(cert.validTo);
      const dias = Math.floor((vence.getTime() - this.ahora()) / 86_400_000);
      if (dias < 0) {
        pasos.push({ paso: 'Certificado', ok: false, detalle: 'El certificado venció. Hay que generar uno nuevo.' });
        return pasos;
      }
      pasos.push({ paso: 'Certificado', ok: true, detalle: `Vence en ${dias} días.` });
    } catch {
      pasos.push({ paso: 'Certificado', ok: false, detalle: 'No se pudo leer el certificado. Tiene que ser el archivo .crt que descargaste de ARCA.' });
      return pasos;
    }

    try {
      const e = await this.wsfe.estado();
      const bien = [e.app, e.db, e.auth].every((x) => x === 'OK');
      pasos.push({ paso: 'Servidores de ARCA', ok: bien, detalle: bien ? 'Andan bien.' : `Con problemas (app ${e.app}, base ${e.db}, auth ${e.auth}). Probá más tarde.` });
      if (!bien) return pasos;
    } catch (e) {
      pasos.push({ paso: 'Servidores de ARCA', ok: false, detalle: (e as Error).message });
      return pasos;
    }

    let cred;
    try {
      cred = await this.credenciales();
      pasos.push({ paso: 'Acceso (WSAA)', ok: true, detalle: 'ARCA aceptó el certificado.' });
    } catch (e) {
      pasos.push({ paso: 'Acceso (WSAA)', ok: false, detalle: (e as Error).message });
      return pasos;
    }

    try {
      const tipo = tipoDeFactura(c, 5);
      const ultimo = await this.wsfe.ultimoAutorizado(cred, c.puntoVenta, tipo);
      pasos.push({ paso: 'Facturación (WSFE)', ok: true, detalle: `${NOMBRE_COMPROBANTE[tipo]}: último número autorizado ${ultimo}.` });
    } catch (e) {
      pasos.push({ paso: 'Facturación (WSFE)', ok: false, detalle: (e as Error).message });
    }
    return pasos;
  }

  /** Hace una operación con ticket; si venció (600/601), pide otro y repite UNA vez. */
  private async conTicket<T>(operacion: (cred: Awaited<ReturnType<ServicioArca['credenciales']>>) => Promise<T>): Promise<T> {
    try {
      return await operacion(await this.credenciales());
    } catch (e) {
      if (e instanceof ErrorDeArca && (e.codigo === '600' || e.codigo === '601') && this.ticket) {
        return operacion(await this.credenciales(true));
      }
      throw e;
    }
  }

  /**
   * Autoriza un comprobante. Si el ticket venció, pide otro y reintenta una vez.
   * El número lo decide ARCA (último + 1); no hay que llevar la cuenta acá.
   */
  autorizar(datos: DatosComprobante): Promise<ComprobanteAutorizado> {
    return this.conTicket((cred) => this.wsfe.autorizar(cred, this.dep.config.puntoVenta, datos));
  }

  /** Último número que ARCA autorizó para este punto de venta y tipo. */
  ultimoAutorizado(tipo: number): Promise<number> {
    return this.conTicket((cred) => this.wsfe.ultimoAutorizado(cred, this.dep.config.puntoVenta, tipo));
  }

  /** Un comprobante tal como lo tiene ARCA, o null si no existe. */
  consultar(tipo: number, numero: number): Promise<ComprobanteConsultado | null> {
    return this.conTicket((cred) => this.wsfe.consultar(cred, this.dep.config.puntoVenta, tipo, numero));
  }
}
