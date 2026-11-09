import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useConfiguracion } from '@/features/vender/consultas';
import { useGuardarImpresion, useImpresoras } from './consultas';

const PREGUNTAR = '__preguntar__';

export function DialogoImpresion({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const configuracion = useConfiguracion();
  const impresoras = useImpresoras(abierto);
  const guardar = useGuardarImpresion();
  const [impresora, setImpresora] = useState(PREGUNTAR);
  const [ancho, setAncho] = useState<58 | 80>(80);

  useEffect(() => {
    if (abierto && configuracion.data) {
      setImpresora(configuracion.data.impresora || PREGUNTAR);
      setAncho(configuracion.data.anchoPapel);
    }
  }, [abierto, configuracion.data]);

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Impresión</DialogTitle>
          <DialogDescription>Dónde salen la comanda y el ticket.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-6">
          <Campo
            etiqueta="Impresora"
            ayuda={
              impresora === PREGUNTAR
                ? 'Cada vez se abre el diálogo de Windows (ahí podés elegir "Microsoft Print to PDF").'
                : 'Imprime directo en esta impresora, sin preguntar.'
            }
          >
            <Select value={impresora} onValueChange={setImpresora}>
              <SelectTrigger aria-label="Impresora">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PREGUNTAR}>Preguntar cada vez</SelectItem>
                {impresoras.data?.map((i) => (
                  <SelectItem key={i.nombre} value={i.nombre}>
                    {i.descripcion}
                  </SelectItem>
                ))}
                {/* Si la guardada ya no está conectada, igual se muestra. */}
                {configuracion.data?.impresora &&
                  !impresoras.data?.some((i) => i.nombre === configuracion.data.impresora) && (
                    <SelectItem value={configuracion.data.impresora}>{configuracion.data.impresora} (no encontrada)</SelectItem>
                  )}
              </SelectContent>
            </Select>
          </Campo>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Ancho del papel</legend>
            <div role="radiogroup" aria-label="Ancho del papel" className="grid grid-cols-2 gap-2">
              {([80, 58] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={ancho === a}
                  onClick={() => setAncho(a)}
                  className={cn(
                    'flex flex-col items-start rounded-lg border px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                    ancho === a ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-linea-fuerte',
                  )}
                >
                  <span className="font-display text-lg font-semibold">{a} mm</span>
                  <span className={cn('text-[13px]', ancho === a ? 'text-white/75' : 'text-tinta-suave')}>
                    {a === 80 ? 'La más común en locales' : 'Impresoras chicas o portátiles'}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
          <Button
            disabled={guardar.isPending}
            onClick={() =>
              guardar.mutate(
                { impresora: impresora === PREGUNTAR ? '' : impresora, anchoPapel: ancho },
                { onSuccess: alCerrar },
              )
            }
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
