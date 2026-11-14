import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { caja, desenvolver } from '@/lib/api';
import type { Rango } from './rangos';

export function useReporte(rango: Rango) {
  return useQuery({
    queryKey: ['reportes', rango.desde, rango.hasta],
    queryFn: () => desenvolver(caja().reportes.obtener(rango)),
    // Mientras carga otro período, se sigue viendo el anterior (sin "saltos").
    placeholderData: keepPreviousData,
  });
}

/** Facturas y notas de crédito del período (solo del ambiente en uso). */
export function useLibroDeVentas(rango: Rango) {
  return useQuery({
    queryKey: ['reportes', 'libro', rango.desde, rango.hasta],
    queryFn: () => desenvolver(caja().libro.obtener(rango)),
    placeholderData: keepPreviousData,
  });
}

export function useExportarLibro() {
  return useMutation({
    mutationFn: (rango: Rango) => desenvolver(caja().libro.exportar(rango)),
    onSuccess: (r) => toast.success('Libro de ventas guardado', { description: r.ruta }),
    onError: (e) => toast.error(e.message),
  });
}
