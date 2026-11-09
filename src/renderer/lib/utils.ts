import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta clases de Tailwind y resuelve conflictos ("p-2" + "p-4" → "p-4"). */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}

/** Pasa a minúsculas y saca tildes: "Milanesa Napolitana" → "milanesa napolitana". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es');
}

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** Fecha local 'AAAA-MM-DD' (la misma que usa el main para los pedidos). */
export function fechaISO(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`;
}

/** Suma (o resta) días a una fecha 'AAAA-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaISO(d);
}
