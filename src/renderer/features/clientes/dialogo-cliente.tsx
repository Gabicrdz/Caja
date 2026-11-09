import { useEffect, useState } from 'react';
import { pesos } from '@compartido/dinero';
import { esquemaCliente } from '@compartido/esquemas';
import { NOMBRE_TIPO, type Cliente } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn, fechaISO } from '@/lib/utils';
import { useGuardarCliente, usePedidosDeCliente } from './consultas';

/** "hoy", "ayer" o "3/11" (con año si no es este). */
export function fechaCorta(fecha: string): string {
  const hoy = fechaISO();
  if (fecha === hoy) return 'Hoy';
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (fecha === fechaISO(ayer)) return 'Ayer';
  const [a, m, d] = fecha.split('-');
  return `${Number(d)}/${Number(m)}${a !== hoy.slice(0, 4) ? `/${a}` : ''}`;
}

export function DialogoCliente({ cliente, alCerrar }: { cliente: Cliente | null; alCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const guardar = useGuardarCliente();
  const pedidos = usePedidosDeCliente(cliente?.id ?? null);

  useEffect(() => {
    if (cliente) {
      setNombre(cliente.nombre);
      setTelefono(cliente.telefono);
      setDireccion(cliente.direccion);
      setNota(cliente.nota);
      setError('');
    }
  }, [cliente]);

  function enviar() {
    if (!cliente) return;
    const r = esquemaCliente.safeParse({ id: cliente.id, nombre, telefono, direccion, nota });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    guardar.mutate(r.data, { onSuccess: alCerrar, onError: (e) => setError(e.message) });
  }

  return (
    <Dialog open={cliente !== null} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-[760px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <DialogHeader>
            <DialogTitle>{cliente?.nombre || 'Cliente sin nombre'}</DialogTitle>
            <DialogDescription>
              {cliente && cliente.pedidos > 0
                ? `${cliente.pedidos === 1 ? '1 pedido' : `${cliente.pedidos} pedidos`} · ${pesos(cliente.gastadoCentavos)} en total`
                : 'Todavía sin pedidos que sumen'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid grid-cols-[1fr_300px] gap-6">
            <div className="flex flex-col gap-4">
              <Campo etiqueta="Nombre" htmlFor="cl-nombre">
                <Input id="cl-nombre" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </Campo>
              <Campo etiqueta="Teléfono" htmlFor="cl-telefono">
                <Input id="cl-telefono" inputMode="tel" maxLength={30} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </Campo>
              <Campo etiqueta="Dirección" htmlFor="cl-direccion" ayuda="La próxima vez que pida, se completa sola.">
                <Input id="cl-direccion" maxLength={120} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </Campo>
              <Campo etiqueta="Referencias (opcional)" htmlFor="cl-nota">
                <Input id="cl-nota" maxLength={120} placeholder="Ej.: portón verde, tocar timbre 2" value={nota} onChange={(e) => setNota(e.target.value)} />
              </Campo>
              {error && <p role="alert" className="text-sm font-semibold text-rojo">{error}</p>}
            </div>
            <aside className="flex min-h-0 flex-col gap-2">
              <h3 className="text-sm font-semibold">Últimos pedidos</h3>
              {pedidos.data?.length ? (
                <ul className="max-h-[300px] overflow-auto rounded-xl border border-linea">
                  {pedidos.data.map((p) => (
                    <li key={p.id} className={cn('flex items-baseline gap-2 border-b border-linea px-3 py-2 text-[14px] last:border-0', p.estado === 'anulado' && 'text-tinta-suave line-through')}>
                      <span className="w-12 text-tinta-suave">{fechaCorta(p.fecha)}</span>
                      <span className="flex-1 truncate">
                        #{p.numero} · {NOMBRE_TIPO[p.tipo]}
                      </span>
                      <span className="numeros font-semibold">{pesos(p.totalCentavos)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-tinta-suave">{pedidos.isPending ? 'Cargando…' : 'Sin pedidos.'}</p>
              )}
            </aside>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
