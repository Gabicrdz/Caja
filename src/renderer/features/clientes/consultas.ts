import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DatosCliente, DatosListarClientes } from '@compartido/esquemas';
import { caja, desenvolver } from '@/lib/api';

export const CLAVE_CLIENTES = ['clientes'] as const;

export function useClientes(filtro: DatosListarClientes) {
  return useQuery({
    queryKey: [...CLAVE_CLIENTES, 'lista', filtro.texto ?? '', filtro.orden ?? 'reciente'],
    queryFn: () => desenvolver(caja().clientes.listar(filtro)),
    placeholderData: keepPreviousData,
  });
}

/** Sugerencias para el delivery (desde 2 letras o 3 números). */
export function useBuscarClientes(texto: string) {
  const limpio = texto.trim();
  return useQuery({
    queryKey: [...CLAVE_CLIENTES, 'buscar', limpio],
    queryFn: () => desenvolver(caja().clientes.buscar(limpio)),
    enabled: limpio.length >= 2,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function usePedidosDeCliente(id: number | null) {
  return useQuery({
    queryKey: [...CLAVE_CLIENTES, 'pedidos', id],
    queryFn: () => desenvolver(caja().clientes.pedidos(id!)),
    enabled: id !== null,
  });
}

export function useGuardarCliente() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosCliente) => desenvolver(caja().clientes.guardar(datos)),
    onSuccess: () => {
      toast.success('Cliente guardado');
      void cliente.invalidateQueries({ queryKey: CLAVE_CLIENTES });
    },
  });
}
