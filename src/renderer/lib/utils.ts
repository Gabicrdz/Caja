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
