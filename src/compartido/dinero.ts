// Todo el dinero se guarda en CENTAVOS enteros (como en el gimnasio y el stock):
// $ 8.500,50 se guarda como 850050. Así nunca aparecen errores de redondeo.

// Sin centavos se muestra "8.500"; con centavos, siempre los dos: "8.500,50".
const sinDecimales = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const conDecimales = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function numero(centavos: number): string {
  return (centavos % 100 === 0 ? sinDecimales : conDecimales).format(centavos / 100);
}

/** 850000 → "$ 8.500" · 850050 → "$ 8.500,50" · -50000 → "-$ 500" */
export function pesos(centavos: number): string {
  return `${centavos < 0 ? '-' : ''}$ ${numero(Math.abs(centavos))}`;
}

/**
 * Lee lo que escribe la persona: "8500", "8.500", "8.500,50", "$ 8.500".
 * El punto separa miles y la coma los decimales (como se escribe en Argentina).
 * Devuelve centavos, o null si no es un importe válido.
 */
export function leerPesos(texto: string): number | null {
  const limpio = texto.replace(/\$/g, '').replace(/\s/g, '');
  if (limpio === '') return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.replace(/\./g, '').split(',');
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** 850000 → "8.500" · 850050 → "8.500,50" (para mostrar dentro de un campo). */
export function pesosParaCampo(centavos: number): string {
  return numero(centavos);
}
