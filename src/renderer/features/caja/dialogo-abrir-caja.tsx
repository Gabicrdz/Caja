import { useEffect, useState } from 'react';
import { leerPesos } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAbrirCaja } from './consultas';
import { CampoPesos } from './campo-pesos';

export function DialogoAbrirCaja({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const [fondo, setFondo] = useState('');
  const abrir = useAbrirCaja();
  useEffect(() => {
    if (abierto) {
      setFondo('');
      abrir.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  const centavos = fondo.trim() === '' ? 0 : leerPesos(fondo);

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (centavos === null) return;
            abrir.mutate(centavos, { onSuccess: alCerrar });
          }}
        >
          <DialogHeader>
            <DialogTitle>Abrir caja</DialogTitle>
            <DialogDescription>¿Con cuánto cambio empezás? Contá el efectivo que hay en el cajón.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Fondo inicial</span>
            <CampoPesos etiqueta="Fondo inicial" valor={fondo} alCambiar={setFondo} autoFocus />
            {centavos === null && <p className="text-[13px] font-semibold text-rojo">Escribí un importe, por ejemplo 20.000</p>}
            {abrir.error && <p role="alert" className="text-[13px] font-semibold text-rojo">{abrir.error.message}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
            <Button type="submit" disabled={centavos === null || abrir.isPending}>Abrir caja</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
