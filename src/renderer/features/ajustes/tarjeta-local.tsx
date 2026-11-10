// Datos del local: salen arriba del ticket y en la pantalla de ingreso.
// A la derecha se ve cómo queda el ticket mientras se escribe.
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { leerPesos, pesos, pesosParaCampo } from '@compartido/dinero';
import { esquemaLocal } from '@compartido/esquemas';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { caja, desenvolver } from '@/lib/api';
import { CampoPesos } from '@/features/caja/campo-pesos';
import { useConfiguracion } from '@/features/vender/consultas';

export function TarjetaLocal() {
  const configuracion = useConfiguracion();
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pie, setPie] = useState('');
  const [envio, setEnvio] = useState('');
  const [error, setError] = useState('');

  const c = configuracion.data;
  useEffect(() => {
    if (!c) return;
    setNombre(c.nombreLocal);
    setDireccion(c.direccionLocal);
    setTelefono(c.telefonoLocal);
    setPie(c.pieTicket);
    setEnvio(pesosParaCampo(c.envioCentavos));
  }, [c]);

  const guardar = useMutation({
    mutationFn: (datos: Parameters<ReturnType<typeof caja>['configuracion']['guardarLocal']>[0]) => desenvolver(caja().configuracion.guardarLocal(datos)),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['configuracion'] });
      toast.success('Datos del local guardados');
    },
    onError: (e) => setError(e.message),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    const envioCentavos = envio.trim() === '' ? 0 : leerPesos(envio);
    if (envioCentavos === null) return setError('El envío no es un importe válido.');
    const r = esquemaLocal.safeParse({ nombreLocal: nombre, direccionLocal: direccion, telefonoLocal: telefono, pieTicket: pie, envioCentavos });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    setError('');
    guardar.mutate(r.data);
  }

  const cambio =
    !!c &&
    (nombre !== c.nombreLocal || direccion !== c.direccionLocal || telefono !== c.telefonoLocal || pie !== c.pieTicket || leerPesos(envio || '0') !== c.envioCentavos);

  return (
    <section className="rounded-xl border border-linea bg-superficie p-5">
      <h2 className="font-display text-xl font-semibold tracking-tight">Tu local</h2>
      <p className="text-sm text-tinta-suave">Sale arriba de cada ticket y en la pantalla de ingreso.</p>
      <form onSubmit={enviar} className="mt-4 grid grid-cols-[1fr_250px] gap-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Campo etiqueta="Nombre del local" htmlFor="local-nombre" className="col-span-2">
            <Input id="local-nombre" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Dirección (opcional)" htmlFor="local-direccion">
            <Input id="local-direccion" maxLength={80} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </Campo>
          <Campo etiqueta="Teléfono (opcional)" htmlFor="local-telefono">
            <Input id="local-telefono" inputMode="tel" maxLength={40} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </Campo>
          <Campo etiqueta="Mensaje al final del ticket" htmlFor="local-pie">
            <Input id="local-pie" maxLength={80} placeholder="¡Gracias por tu compra!" value={pie} onChange={(e) => setPie(e.target.value)} />
          </Campo>
          <Campo etiqueta="Envío por defecto (delivery)" ayuda="Se puede cambiar en cada pedido.">
            <CampoPesos etiqueta="Envío por defecto" valor={envio} alCambiar={setEnvio} chico />
          </Campo>
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={!cambio || guardar.isPending}>
              Guardar cambios
            </Button>
            {error && (
              <p role="alert" className="text-sm font-semibold text-rojo">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Vista previa del encabezado del ticket */}
        <figure aria-label="Así se ve el ticket" className="self-start">
          <div className="rounded-sm bg-white px-5 py-4 text-center font-mono text-[12px] leading-relaxed text-black shadow-[0_1px_3px_rgba(0,0,0,0.15),0_8px_20px_rgba(0,0,0,0.06)]">
            <p className="text-[15px] font-bold">{nombre || 'Nombre del local'}</p>
            {direccion && <p>{direccion}</p>}
            {telefono && <p>Tel. {telefono}</p>}
            <p className="my-2 border-t border-dashed border-black/40" />
            <p className="flex justify-between">
              <span>1 × Clásica</span>
              <span>{pesos(850000)}</span>
            </p>
            <p className="my-2 border-t border-dashed border-black/40" />
            <p className="text-[10px]">Comprobante no válido como factura</p>
            {pie && <p className="font-bold">{pie}</p>}
          </div>
          <figcaption className="mt-2 text-center text-[12px] text-tinta-suave">Así se ve el ticket</figcaption>
        </figure>
      </form>
    </section>
  );
}
