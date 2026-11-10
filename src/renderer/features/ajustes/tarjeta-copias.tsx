// Copias de seguridad: lo más importante para que el negocio no pierda nada.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DatabaseBackup, FolderOpen, HardDriveDownload, History, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { caja, desenvolver } from '@/lib/api';
import { Confirmar, type Confirmacion } from '@/features/menu/confirmar';
import { fechaCorta } from '@/features/clientes/dialogo-cliente';

const tamano = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const cuando = (fecha: string) => `${fechaCorta(fecha.slice(0, 10)).toLowerCase()} a las ${fecha.slice(11)}`;

export function TarjetaCopias() {
  const cliente = useQueryClient();
  const estado = useQuery({ queryKey: ['copias'], queryFn: () => desenvolver(caja().copias.estado()) });
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [reiniciando, setReiniciando] = useState(false);

  const exportar = useMutation({
    mutationFn: () => desenvolver(caja().copias.exportar()),
    onSuccess: (copia) => {
      if (!copia) return;
      toast.success('Copia guardada', { description: copia.ruta });
      void cliente.invalidateQueries({ queryKey: ['copias'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const restaurar = useMutation({
    mutationFn: () => desenvolver(caja().copias.restaurar()),
    onSuccess: () => setReiniciando(true), // el programa se reinicia solo
    onError: (e) => toast.error(e.message),
  });

  const elegir = useMutation({
    mutationFn: () => desenvolver(caja().copias.elegir()),
    onSuccess: (copia) => {
      if (!copia) return;
      setConfirmacion({
        titulo: `¿Restaurar "${copia.nombre}"?`,
        descripcion: `La copia tiene ${copia.descripcion}. Todo lo que se cargó después de esa copia se pierde. Antes de reemplazar, se guarda una copia de cómo está todo ahora. El programa se va a reiniciar.`,
        boton: 'Restaurar y reiniciar',
        alConfirmar: () => restaurar.mutate(),
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const ultima = estado.data?.automaticas[0];

  return (
    <section className="rounded-xl border border-linea bg-superficie p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-verde-suave text-verde">
          <ShieldCheck className="size-6" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-xl font-semibold tracking-tight">Copias de seguridad</h2>
          <p className="text-sm text-tinta-suave">
            Todas las ventas viven en un solo archivo. Si la compu se rompe, con una copia no se pierde nada.
          </p>
          <p className="mt-3 flex items-center gap-2 text-[15px]">
            <History className="size-4 text-tinta-suave" aria-hidden="true" />
            {ultima ? (
              <span>
                Última copia automática: <strong>{cuando(ultima.fecha)}</strong> ({tamano(ultima.bytes)}) · se guardan las últimas 10, una por día
              </span>
            ) : (
              <span>La copia automática se hace una vez por día, al abrir el programa.</span>
            )}
          </p>
          {estado.data && <p className="mt-1 text-[13px] break-all text-tinta-suave">Carpeta: {estado.data.carpeta}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-linea pt-4">
        <Button onClick={() => exportar.mutate()} disabled={exportar.isPending}>
          <HardDriveDownload /> Guardar copia…
        </Button>
        <Button variant="outline" onClick={() => elegir.mutate()} disabled={elegir.isPending || restaurar.isPending}>
          <DatabaseBackup /> Restaurar una copia…
        </Button>
        <Button variant="ghost" onClick={() => void desenvolver(caja().copias.abrirCarpeta()).catch((e: Error) => toast.error(e.message))}>
          <FolderOpen /> Abrir carpeta
        </Button>
      </div>
      <p className="mt-3 text-[13px] text-tinta-suave">
        Consejo: una vez por semana, tocá <strong>Guardar copia…</strong> y elegí un pendrive o la carpeta de Google Drive. Las copias de la compu no sirven si se rompe la compu.
      </p>

      <Confirmar confirmacion={confirmacion} alCerrar={() => setConfirmacion(null)} />
      {reiniciando && (
        <div role="status" className="fixed inset-0 z-[100] grid place-items-center bg-riel/90 text-xl font-semibold text-white">
          Restaurando la copia… el programa se reinicia en un momento.
        </div>
      )}
    </section>
  );
}
