import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
