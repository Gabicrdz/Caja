import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosImpresion, DatosPagos } from '@compartido/esquemas';
import type { EstadoPedido, TipoImpresion } from '@compartido/tipos';
import { caja, desenvolver } from '@/lib/api';
import { CLAVE_RESUMEN } from '@/features/vender/consultas';

export const CLAVE_PEDIDOS = ['pedidos'] as const;

export function usePedidos(fecha: string) {
  return useQuery({
    queryKey: [...CLAVE_PEDIDOS, fecha],
    queryFn: () => desenvolver(caja().pedidos.listar(fecha)),
    // Por si la caja queda abierta: se refresca sola cada 20 segundos.
    refetchInterval: 20_000,
    staleTime: 5_000,
  });
}

/** Después de cualquier cambio en un pedido, se refrescan la lista y el resumen. */
function useRefrescar() {
  const cliente = useQueryClient();
  return () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: CLAVE_PEDIDOS }),
      cliente.invalidateQueries({ queryKey: CLAVE_RESUMEN }),
      cliente.invalidateQueries({ queryKey: ['caja'] }),
      cliente.invalidateQueries({ queryKey: ['clientes'] }),
      cliente.invalidateQueries({ queryKey: ['reportes'] }),
    ]);
}

export function useCambiarEstado() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: Exclude<EstadoPedido, 'anulado'> }) =>
      desenvolver(caja().pedidos.cambiarEstado(id, estado)),
    onSuccess: refrescar,
    onError: (e) => toast.error(e.message),
  });
}

export function useAnular() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => desenvolver(caja().pedidos.anular(id, motivo)),
    onSuccess: async () => {
      await refrescar();
      toast.success('Pedido anulado');
    },
  });
}

export function useCobrarPedido() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: ({ id, pagos }: { id: number; pagos: DatosPagos }) => desenvolver(caja().pedidos.cobrar(id, pagos)),
    onSuccess: refrescar,
  });
}

/** Imprimir (impresora elegida o diálogo de Windows) o guardar en PDF. */
export function useImprimir() {
  const imprimir = useMutation({
    mutationFn: ({ id, tipo }: { id: number; tipo: TipoImpresion }) => desenvolver(caja().impresion.imprimir(id, tipo)),
    onSuccess: (r, { tipo }) => {
      if (r.impreso) toast.success(`${{ comanda: 'Comanda', ticket: 'Ticket', cierre: 'Cierre' }[tipo]} enviado a la impresora`);
    },
    onError: (e) => toast.error(e.message),
  });
  const pdf = useMutation({
    mutationFn: ({ id, tipo }: { id: number; tipo: TipoImpresion }) => desenvolver(caja().impresion.pdf(id, tipo)),
    onSuccess: (r) => toast.success('PDF guardado', { description: r.ruta }),
    onError: (e) => toast.error(e.message),
  });
  return { imprimir, pdf, ocupado: imprimir.isPending || pdf.isPending };
}

export function useImpresoras(habilitado: boolean) {
  return useQuery({
    queryKey: ['impresoras'],
    queryFn: () => desenvolver(caja().impresion.impresoras()),
    enabled: habilitado,
    staleTime: 30_000,
  });
}

export function useGuardarImpresion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosImpresion) => desenvolver(caja().configuracion.guardarImpresion(datos)),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['configuracion'] });
      toast.success('Configuración de impresión guardada');
    },
    onError: (e) => toast.error(e.message),
  });
}
