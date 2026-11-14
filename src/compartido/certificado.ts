// Cuánto le queda al certificado de ARCA. Dura unos 2 años: avisamos con tiempo para renovarlo.

/** Desde cuántos días antes del vencimiento se avisa. */
export const DIAS_AVISO_CERTIFICADO = 30;

const aDia = (fecha: string) => {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
};

/** Días que faltan entre `hoy` y el vencimiento (AAAA-MM-DD). Negativo si ya venció; null si no hay certificado. */
export function diasParaVencer(vencimiento: string | null, hoy: string): number | null {
  if (!vencimiento || !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) return null;
  return Math.round(aDia(vencimiento) - aDia(hoy));
}

export type AvisoCertificado = 'vencido' | 'por_vencer' | null;

export function avisoDelCertificado(dias: number | null): AvisoCertificado {
  if (dias === null) return null;
  if (dias < 0) return 'vencido';
  return dias <= DIAS_AVISO_CERTIFICADO ? 'por_vencer' : null;
}

const ddmmaaaa = (f: string) => f.split('-').reverse().join('/');

/** Frase para mostrar en pantalla. Vacía si no hay nada que avisar. */
export function textoDelAviso(vencimiento: string | null, dias: number | null): string {
  const aviso = avisoDelCertificado(dias);
  if (!aviso || !vencimiento || dias === null) return '';
  if (aviso === 'vencido') return `El certificado de ARCA venció el ${ddmmaaaa(vencimiento)}: hasta renovarlo no se puede facturar.`;
  if (dias === 0) return `El certificado de ARCA vence hoy (${ddmmaaaa(vencimiento)}). Renovalo para no dejar de facturar.`;
  return `El certificado de ARCA vence en ${dias} ${dias === 1 ? 'día' : 'días'} (${ddmmaaaa(vencimiento)}). Renovalo con tiempo para no dejar de facturar.`;
}
