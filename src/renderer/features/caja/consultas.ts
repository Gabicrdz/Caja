import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosCerrarCaja, DatosMovimiento } from '@compartido/esquemas';
import { caja, desenvolver } from '@/lib/api';

export const CLAVE_CAJA = ['caja'] as const;

/** La caja abierta con su resumen (null = cerrada). */
export function useCajaActual() {
  return useQuery({
    queryKey: CLAVE_CAJA,
    queryFn: () => desenvolver(caja().caja.actual()),
    refetchInterval: 30_000,
  });
}

function useRefrescarCaja() {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: CLAVE_CAJA });
}

export function useAbrirCaja() {
  const refrescar = useRefrescarCaja();
  return useMutation({
    mutationFn: (fondoCentavos: number) => desenvolver(caja().caja.abrir(fondoCentavos)),
    onSuccess: async () => {
      await refrescar();
      toast.success('Caja abierta');
    },
  });
}

export function useMovimiento() {
  const refrescar = useRefrescarCaja();
  return useMutation({
    mutationFn: (datos: DatosMovimiento) => desenvolver(caja().caja.movimiento(datos)),
    onSuccess: refrescar,
  });
}

export function useCerrarCaja() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosCerrarCaja) => desenvolver(caja().caja.cerrar(datos)),
    onSuccess: () =>
      Promise.all([
        cliente.invalidateQueries({ queryKey: CLAVE_CAJA }),
        cliente.invalidateQueries({ queryKey: ['historial-cajas'] }),
      ]),
  });
}

export function useHistorialCajas(habilitado: boolean) {
  return useQuery({
    queryKey: ['historial-cajas'],
    queryFn: () => desenvolver(caja().caja.historial()),
    enabled: habilitado,
  });
}

export function useResumenDeCaja(id: number | null) {
  return useQuery({
    queryKey: ['caja-resumen', id],
    queryFn: () => desenvolver(caja().caja.resumen(id!)),
    enabled: id !== null,
  });
}
