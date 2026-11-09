import { useEffect, useState } from 'react';
import { leerPesos } from '@compartido/dinero';
import { esquemaMovimiento } from '@compartido/esquemas';
import { NOMBRE_MOVIMIENTO, type TipoMovimiento } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useMovimiento } from './consultas';
import { CampoPesos } from './campo-pesos';

const AYUDA: Record<TipoMovimiento, { detalle: string; ejemplo: string }> = {
  ingreso: { detalle: 'Efectivo que se agrega a la caja (por ejemplo, más cambio).', ejemplo: 'Más cambio' },
  retiro: { detalle: 'Efectivo que se saca de la caja y no es un gasto (por ejemplo, para depositar).', ejemplo: 'Depósito en el banco' },
  gasto: { detalle: 'Efectivo que se usa para pagar algo del local.', ejemplo: 'Pan, hielo, proveedor…' },
};

export function DialogoMovimiento({ tipo, alCerrar }: { tipo: TipoMovimiento | null; alCerrar: () => void }) {
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const registrar = useMovimiento();
  useEffect(() => {
    setMonto('');
    setMotivo('');
    setError('');
  }, [tipo]);
  if (!tipo) return null;

  function enviar() {
    const r = esquemaMovimiento.safeParse({ tipo, montoCentavos: leerPesos(monto) ?? -1, motivo });
    if (!r.success) return setError(leerPesos(monto) === null ? 'Escribí el monto.' : (r.error.issues[0]?.message ?? 'Revisá los datos.'));
    registrar.mutate(r.data, { onSuccess: alCerrar, onError: (e) => setError(e.message) });
  }

  return (
    <Dialog open onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <DialogHeader>
            <DialogTitle>{NOMBRE_MOVIMIENTO[tipo]}</DialogTitle>
            <DialogDescription>{AYUDA[tipo].detalle}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <CampoPesos etiqueta="Monto" valor={monto} alCambiar={setMonto} autoFocus />
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Motivo</span>
              <Input value={motivo} maxLength={80} placeholder={AYUDA[tipo].ejemplo} onChange={(e) => setMotivo(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-[13px] font-semibold text-rojo">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
            <Button type="submit" disabled={registrar.isPending}>Registrar {NOMBRE_MOVIMIENTO[tipo].toLowerCase()}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
