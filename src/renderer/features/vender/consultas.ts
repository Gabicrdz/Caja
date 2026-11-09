import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DatosPedido } from '@compartido/esquemas';
import { caja, desenvolver } from '@/lib/api';
import { CLAVE_MENU } from '@/features/menu/consultas';

export const CLAVE_RESUMEN = ['resumen-hoy'] as const;

export function useConfiguracion() {
  return useQuery({
    queryKey: ['configuracion'],
    queryFn: () => desenvolver(caja().configuracion.obtener()),
  });
}

export function useResumenDeHoy() {
  return useQuery({
    queryKey: CLAVE_RESUMEN,
    queryFn: () => desenvolver(caja().pedidos.resumenDeHoy()),
    // Si queda abierta de un día para el otro, que se actualice sola.
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useCrearPedido() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosPedido) => desenvolver(caja().pedidos.crear(datos)),
    onSuccess: () =>
      Promise.all([
        cliente.invalidateQueries({ queryKey: CLAVE_RESUMEN }),
        cliente.invalidateQueries({ queryKey: ['pedidos'] }),
        cliente.invalidateQueries({ queryKey: ['caja'] }),
        cliente.invalidateQueries({ queryKey: ['clientes'] }),
        cliente.invalidateQueries({ queryKey: ['reportes'] }),
      ]),
    // Si falló porque cambió el menú, lo volvemos a pedir para mostrar lo nuevo.
    onError: () => cliente.invalidateQueries({ queryKey: CLAVE_MENU }),
  });
}
