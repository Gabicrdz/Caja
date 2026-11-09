import type { Respuesta } from '@compartido/tipos';

/**
 * Las respuestas del main vienen como { ok, datos } o { ok: false, error }.
 * Esto devuelve los datos o lanza un Error con el mensaje, que es lo que
 * espera TanStack Query para mostrar el error.
 */
export async function desenvolver<T>(promesa: Promise<Respuesta<T>>): Promise<T> {
  const respuesta = await promesa;
  if (!respuesta.ok) {
    // Si el main dice que no hay sesión, avisamos para volver a la pantalla de ingreso.
    if (respuesta.error.startsWith('La sesión se cerró')) window.dispatchEvent(new Event('sesion-cerrada'));
    throw new Error(respuesta.error);
  }
  return respuesta.datos;
}

export const caja = () => window.caja;
