// Pedidos de datos del menú con TanStack Query. El menú se pide UNA vez y
// queda en memoria; cuando algo cambia, "invalidamos" la clave ['menu'] y
// TanStack Query lo vuelve a pedir solo. Así todas las pantallas se actualizan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Respuesta } from '@compartido/tipos';
import { caja, desenvolver } from '@/lib/api';

export const CLAVE_MENU = ['menu'] as const;

export function useMenu() {
  return useQuery({
    queryKey: CLAVE_MENU,
    queryFn: () => desenvolver(caja().menu.obtener()),
  });
}

interface OpcionesAccion<R> {
  /** Mensaje del aviso verde al terminar bien. */
  exito?: string | ((resultado: R) => string);
  /** Si es false, el error no se muestra como aviso (lo muestra el formulario). */
  avisarError?: boolean;
}

/** Envuelve una acción del main (crear, guardar, borrar…) y refresca el menú. */
export function useAccion<A extends unknown[], R>(
  accion: (...args: A) => Promise<Respuesta<R>>,
  { exito, avisarError = true }: OpcionesAccion<R> = {},
) {
  const clienteConsultas = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => desenvolver(accion(...args)),
    onSuccess: async (resultado) => {
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_MENU });
      if (exito) toast.success(typeof exito === 'function' ? exito(resultado) : exito);
    },
    onError: (error) => {
      if (avisarError) toast.error(error.message);
    },
  });
}
