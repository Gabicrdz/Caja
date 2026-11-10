// Modo demostración: para mostrarle el sistema a un cliente con datos.
// Solo aparece mientras la caja no tiene pedidos (no se mezcla con ventas reales).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { caja, desenvolver } from '@/lib/api';
import { Confirmar, type Confirmacion } from '@/features/menu/confirmar';

export function TarjetaDemo() {
  const cliente = useQueryClient();
  const disponible = useQuery({ queryKey: ['demo'], queryFn: () => desenvolver(caja().demo.disponible()) });
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const cargar = useMutation({
    mutationFn: () => desenvolver(caja().demo.cargar()),
    onSuccess: async (r) => {
      // Cambió todo: menú, pedidos, caja, clientes, usuarios…
      await cliente.invalidateQueries();
      toast.success(`Listo: ${r.pedidos.toLocaleString('es-AR')} pedidos de ejemplo en ${r.dias} días`, {
        description: 'Mirá Reportes, Pedidos y Clientes. Se creó la cajera Marta (PIN 1111).',
      });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!disponible.data) return null;

  return (
    <section className="flex items-start gap-4 rounded-xl border border-dashed border-linea-fuerte bg-superficie/60 p-5">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-mostaza-suave">
        <Sparkles className="size-6" />
      </div>
      <div className="flex-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Datos de demostración</h2>
        <p className="text-sm text-tinta-suave">
          Carga 45 días de ventas de ejemplo (menú, clientes, cajas cerradas y una cajera) para mostrarle el sistema a un cliente con los gráficos llenos. Solo se
          puede mientras no haya pedidos: <strong>no lo uses en la caja de un local real.</strong>
        </p>
        <Button
          className="mt-3"
          variant="outline"
          disabled={cargar.isPending}
          onClick={() =>
            setConfirmacion({
              titulo: '¿Cargar los datos de demostración?',
              descripcion: 'Se cargan unos 900 pedidos de ejemplo. Para volver a una caja vacía, después vas a tener que restaurar una copia o reinstalar.',
              boton: 'Cargar demo',
              alConfirmar: () => cargar.mutate(),
            })
          }
        >
          <Sparkles /> {cargar.isPending ? 'Cargando…' : 'Cargar datos de demostración'}
        </Button>
      </div>
      <Confirmar confirmacion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </section>
  );
}
