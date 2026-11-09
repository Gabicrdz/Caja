import type { GrupoAgregados } from '@compartido/tipos';
import { pesos } from '@compartido/dinero';

/** Explica en palabras la regla de un grupo: "Elegir 1 · obligatorio". */
export function reglaDelGrupo({ minimo, maximo }: Pick<GrupoAgregados, 'minimo' | 'maximo'>): string {
  if (minimo === 0 && maximo === null) return 'Opcional · sin límite';
  if (minimo === 0) return `Opcional · hasta ${maximo}`;
  if (maximo === minimo) return `Elegir ${minimo} · obligatorio`;
  if (maximo === null) return `Elegir al menos ${minimo}`;
  return `Elegir entre ${minimo} y ${maximo}`;
}

/** "+ $ 900" o "sin cargo". */
export function precioAdicional(centavos: number): string {
  return centavos === 0 ? 'sin cargo' : `+ ${pesos(centavos)}`;
}

export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}
