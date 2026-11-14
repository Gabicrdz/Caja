// Tipos y tablas de ARCA (ex AFIP). Los números son los códigos oficiales de los web services.

import type { AmbienteArca, CondicionIvaEmisor } from '@compartido/tipos';

export type Ambiente = AmbienteArca;
export type { CondicionIvaEmisor };

export interface ConfigArca {
  /** Facturar está encendido (si no, la Caja sigue vendiendo sin facturar). */
  activa: boolean;
  ambiente: Ambiente;
  /** CUIT de quien emite, solo números (11). */
  cuit: string;
  puntoVenta: number;
  condicionIva: CondicionIvaEmisor;
  /** Dónde están el certificado y la clave (el main los lee; no se guardan en la base). */
  rutaCertificado: string;
  rutaClave: string;
}

export const DIRECCIONES: Record<Ambiente, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
};

/** Códigos de tipo de comprobante (CbteTipo). */
export const TIPO_COMPROBANTE = {
  facturaA: 1,
  notaCreditoA: 3,
  facturaB: 6,
  notaCreditoB: 8,
  facturaC: 11,
  notaCreditoC: 13,
} as const;

export const NOMBRE_COMPROBANTE: Record<number, string> = {
  1: 'Factura A',
  3: 'Nota de Crédito A',
  6: 'Factura B',
  8: 'Nota de Crédito B',
  11: 'Factura C',
  13: 'Nota de Crédito C',
};

/** Letra del comprobante: A, B o C. */
export function letraDe(tipo: number): string {
  return NOMBRE_COMPROBANTE[tipo]?.slice(-1) ?? '?';
}

/** Tipo de documento del cliente (DocTipo). */
export const DOC_TIPO = { cuit: 80, cuil: 86, dni: 96, consumidorFinal: 99 } as const;

/** Condición frente al IVA de quien COMPRA (obligatoria en el comprobante). */
export const CONDICION_IVA_RECEPTOR = {
  responsableInscripto: 1,
  exento: 4,
  consumidorFinal: 5,
  monotributo: 6,
  noCategorizado: 7,
} as const;

/** Alícuotas de IVA: código de ARCA → porcentaje. */
export const ALICUOTAS: Record<number, number> = { 3: 0, 4: 10.5, 5: 21, 6: 27, 8: 5, 9: 2.5 };

export type ResultadoArca = 'A' | 'R' | 'P';

export interface MensajeArca {
  codigo: number;
  mensaje: string;
}

export interface DatosComprobante {
  tipo: number;
  /** 1 = productos, 2 = servicios, 3 = ambos. Un local de comidas vende productos. */
  concepto: 1 | 2 | 3;
  docTipo: number;
  docNro: string;
  /** Condición frente al IVA del receptor (CONDICION_IVA_RECEPTOR). */
  condicionIvaReceptor: number;
  /** AAAA-MM-DD. */
  fecha: string;
  /** Total con IVA incluido, en centavos. */
  totalCentavos: number;
  /** Alícuota de IVA incluida en los precios (solo facturas A y B). 5 = 21 %. */
  alicuotaId?: number;
  /** Comprobante que se anula o corrige (solo notas de crédito). */
  asociado?: { tipo: number; puntoVenta: number; numero: number };
}

export interface ComprobanteAutorizado {
  resultado: ResultadoArca;
  tipo: number;
  puntoVenta: number;
  numero: number;
  cae: string;
  /** AAAA-MM-DD. */
  vencimientoCae: string;
  observaciones: MensajeArca[];
}
