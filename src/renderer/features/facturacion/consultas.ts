import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DatosReceptor } from '@compartido/esquemas';
import { caja, desenvolver } from '@/lib/api';
import { CLAVE_PEDIDOS } from '@/features/pedidos/consultas';

export const CLAVE_FACTURACION = ['facturacion-estado'] as const;

/** ¿Está la facturación lista para usarse? (activa + certificado + datos completos) */
export function useEstadoFacturacion() {
  return useQuery({
    queryKey: CLAVE_FACTURACION,
    queryFn: () => desenvolver(caja().facturacion.estado()),
    staleTime: 15_000,
  });
}

function useRefrescarFacturas() {
  const cliente = useQueryClient();
  return () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: CLAVE_PEDIDOS }),
      cliente.invalidateQueries({ queryKey: CLAVE_FACTURACION }),
    ]);
}

export function useFacturar() {
  const refrescar = useRefrescarFacturas();
  return useMutation({
    mutationFn: ({ pedidoId, receptor }: { pedidoId: number; receptor: DatosReceptor | null }) =>
      desenvolver(caja().facturacion.facturar(pedidoId, receptor)),
    // Si falla, el pedido queda con la factura pendiente: también hay que refrescar.
    onSettled: refrescar,
  });
}

export function useDescartarPendiente() {
  const refrescar = useRefrescarFacturas();
  return useMutation({
    mutationFn: (pedidoId: number) => desenvolver(caja().facturacion.descartarPendiente(pedidoId)),
    onSuccess: refrescar,
  });
}
