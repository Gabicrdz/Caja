import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { caja, desenvolver } from '@/lib/api';

export const CLAVE_SESION = ['sesion'] as const;

/** Quién está usando la caja (null = nadie: pantalla de ingreso). */
export function useSesion() {
  return useQuery({
    queryKey: CLAVE_SESION,
    queryFn: () => desenvolver(caja().sesion.actual()),
    staleTime: Infinity,
  });
}

export function useUsuario() {
  const { data } = useSesion();
  return { usuario: data ?? null, esDueno: data?.rol === 'dueno' };
}

export function useUsuariosParaIngresar() {
  return useQuery({
    queryKey: ['usuarios-ingreso'],
    queryFn: () => desenvolver(caja().usuarios.paraIngresar()),
  });
}

/** Al entrar o salir, se borra todo lo guardado en memoria (cada usuario ve lo suyo). */
function useCambioDeUsuario() {
  const cliente = useQueryClient();
  return async () => {
    toast.dismiss(); // los avisos del usuario anterior no le sirven al siguiente
    cliente.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sesion' });
    await cliente.invalidateQueries({ queryKey: CLAVE_SESION });
  };
}

export function useIngresar() {
  const cambio = useCambioDeUsuario();
  return useMutation({
    mutationFn: ({ usuarioId, pin }: { usuarioId: number; pin: string }) => desenvolver(caja().sesion.iniciar(usuarioId, pin)),
    onSuccess: cambio,
  });
}

export function useCrearPrimerDueno() {
  const cambio = useCambioDeUsuario();
  return useMutation({
    mutationFn: ({ nombre, pin }: { nombre: string; pin: string }) => desenvolver(caja().usuarios.crearPrimero(nombre, pin)),
    onSuccess: cambio,
  });
}

export function useBloquear() {
  const cambio = useCambioDeUsuario();
  return useMutation({
    mutationFn: () => desenvolver(caja().sesion.cerrar()),
    onSuccess: cambio,
  });
}
