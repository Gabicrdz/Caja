// CUIT / CUIL: 11 números; el último es un dígito verificador (módulo 11).

/** Deja solo los números: "20-44647493-7" → "20446474937". */
export const soloNumeros = (texto: string) => texto.replace(/\D/g, '');

export function cuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(cuit[i]), 0);
  const resto = 11 - (suma % 11);
  const digito = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return digito === Number(cuit[10]);
}

/** "20446474937" → "20-44647493-7". */
export const cuitConGuiones = (cuit: string) => (cuit.length === 11 ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : cuit);
