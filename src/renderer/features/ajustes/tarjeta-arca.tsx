// Facturación electrónica con ARCA: datos del local, certificado y prueba de conexión.
// El certificado y la clave nunca llegan a esta ventana: el main los copia a su carpeta
// y acá solo se ve si están cargados.
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, FileKey, Plug, X } from 'lucide-react';
import { cuitConGuiones } from '@compartido/cuit';
import { avisoDelCertificado, diasParaVencer, textoDelAviso } from '@compartido/certificado';
import { esquemaArca } from '@compartido/esquemas';
import type { AmbienteArca, CondicionIvaEmisor, PasoPruebaArca, PedidoCertificado } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { caja, desenvolver } from '@/lib/api';

const CLAVE = ['arca-estado'];

export function TarjetaArca() {
  const cliente = useQueryClient();
  const estado = useQuery({ queryKey: CLAVE, queryFn: () => desenvolver(caja().arca.estado()) });
  const [activa, setActiva] = useState(false);
  const [ambiente, setAmbiente] = useState<AmbienteArca>('homologacion');
  const [cuit, setCuit] = useState('');
  const [punto, setPunto] = useState('1');
  const [condicion, setCondicion] = useState<CondicionIvaEmisor>('monotributo');
  const [razonSocial, setRazonSocial] = useState('');
  const [ingresosBrutos, setIngresosBrutos] = useState('');
  const [inicio, setInicio] = useState('');
  const [error, setError] = useState('');
  const [pasos, setPasos] = useState<PasoPruebaArca[] | null>(null);
  const [pedido, setPedido] = useState<PedidoCertificado | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const e = estado.data;
  useEffect(() => {
    if (!e) return;
    setActiva(e.activa);
    setAmbiente(e.ambiente);
    setCuit(e.cuit ? cuitConGuiones(e.cuit) : '');
    setPunto(String(e.puntoVenta));
    setCondicion(e.condicionIva);
    setRazonSocial(e.razonSocial);
    setIngresosBrutos(e.ingresosBrutos);
    setInicio(e.inicioActividades);
  }, [e]);

  const guardar = useMutation({
    mutationFn: (datos: Parameters<ReturnType<typeof caja>['arca']['guardar']>[0]) => desenvolver(caja().arca.guardar(datos)),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE });
      setPasos(null);
      toast.success('Datos de facturación guardados');
    },
    onError: (err) => setError(err.message),
  });

  const elegir = useMutation({
    mutationFn: (archivo: 'certificado' | 'clave') => desenvolver(caja().arca.elegirArchivo(archivo, e!.ambiente)),
    onSuccess: async (elegido, archivo) => {
      if (!elegido) return;
      await cliente.invalidateQueries({ queryKey: CLAVE });
      setPasos(null);
      toast.success(archivo === 'certificado' ? 'Certificado cargado' : 'Clave cargada');
    },
    onError: (err) => toast.error(err.message),
  });

  const generar = useMutation({
    mutationFn: (reemplazar: boolean) => desenvolver(caja().arca.generarPedido(e!.ambiente, reemplazar)),
    onSuccess: async (r) => {
      setPedido(r);
      setConfirmando(false);
      setPasos(null);
      await cliente.invalidateQueries({ queryKey: CLAVE });
    },
    onError: (err) => toast.error(err.message),
  });

  const probar = useMutation({
    mutationFn: () => desenvolver(caja().arca.probar()),
    onSuccess: setPasos,
    onError: (err) => toast.error(err.message),
  });

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    const r = esquemaArca.safeParse({ activa, ambiente, cuit, puntoVenta: Number(punto), condicionIva: condicion, razonSocial, ingresosBrutos, inicioActividades: inicio });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    if (r.data.activa && !r.data.cuit) return setError('Para facturar hace falta el CUIT.');
    setError('');
    guardar.mutate(r.data);
  }

  const hayCambio = !!e && (activa !== e.activa || ambiente !== e.ambiente || cuit.replace(/\D/g, '') !== e.cuit || Number(punto) !== e.puntoVenta || condicion !== e.condicionIva || razonSocial.trim() !== e.razonSocial || ingresosBrutos.trim() !== e.ingresosBrutos || inicio !== e.inicioActividades);
  // Los archivos se guardan por ambiente: si se cambió el ambiente sin guardar, primero se guarda.
  const ambienteSinGuardar = !!e && ambiente !== e.ambiente;
  const puedePedir = !!e && !hayCambio && !!e.cuit && !!e.razonSocial.trim();
  const hoyLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const diasCert = e?.tieneCertificado ? diasParaVencer(e.vencimientoCertificado, hoyLocal) : null;
  const avisoCert = avisoDelCertificado(diasCert);
  const listo = !!e && e.tieneCertificado && e.tieneClave && !!e.cuit;

  return (
    <section className="rounded-xl border border-linea bg-superficie p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Facturación electrónica (ARCA)</h2>
          <p className="text-sm text-tinta-suave">Para emitir facturas con CAE desde la Caja. Se configura una sola vez por local.</p>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          Facturar
          <Switch checked={activa} onCheckedChange={setActiva} aria-label="Facturar con ARCA" />
        </label>
      </div>

      <form onSubmit={enviar} className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
        <Campo etiqueta="Ambiente" htmlFor="arca-ambiente" ayuda={ambiente === 'homologacion' ? 'Pruebas: las facturas NO tienen validez.' : 'Producción: las facturas son reales.'}>
          <Select value={ambiente} onValueChange={(v) => setAmbiente(v as AmbienteArca)}>
            <SelectTrigger id="arca-ambiente" aria-label="Ambiente">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="homologacion">Pruebas (homologación)</SelectItem>
              <SelectItem value="produccion">Producción</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo etiqueta="Condición frente al IVA" htmlFor="arca-condicion" ayuda={condicion === 'monotributo' ? 'Emite Factura C.' : 'Emite Factura A o B según el cliente.'}>
          <Select value={condicion} onValueChange={(v) => setCondicion(v as CondicionIvaEmisor)}>
            <SelectTrigger id="arca-condicion" aria-label="Condición frente al IVA">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monotributo">Monotributista</SelectItem>
              <SelectItem value="responsable_inscripto">Responsable inscripto</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo etiqueta="CUIT de quien factura" htmlFor="arca-cuit">
          <Input id="arca-cuit" inputMode="numeric" maxLength={13} placeholder="20-12345678-9" value={cuit} onChange={(ev) => setCuit(ev.target.value)} />
        </Campo>
        <Campo etiqueta="Punto de venta" htmlFor="arca-punto" ayuda="El que se creó en ARCA para facturar por web service.">
          <Input id="arca-punto" inputMode="numeric" maxLength={5} value={punto} onChange={(ev) => setPunto(ev.target.value.replace(/\D/g, ''))} />
        </Campo>
        <div className="col-span-2">
          <Campo etiqueta="Nombre o razón social (como figura en ARCA)" htmlFor="arca-razon" ayuda="Va impreso arriba de cada factura.">
            <Input id="arca-razon" maxLength={80} value={razonSocial} onChange={(ev) => setRazonSocial(ev.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Ingresos Brutos" htmlFor="arca-iibb" ayuda='Número de inscripción o "Exento".'>
          <Input id="arca-iibb" maxLength={30} value={ingresosBrutos} onChange={(ev) => setIngresosBrutos(ev.target.value)} />
        </Campo>
        <Campo etiqueta="Inicio de actividades" htmlFor="arca-inicio">
          <Input id="arca-inicio" type="date" value={inicio} onChange={(ev) => setInicio(ev.target.value)} />
        </Campo>

        <div className="col-span-2 flex flex-col gap-3 rounded-lg border border-linea p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">1. Pedido de certificado</span>
              <span className="text-[13px] text-tinta-suave">
                Crea la clave privada y el archivo (.csr) que se sube a ARCA para obtener el certificado. Usa el CUIT y el nombre guardados arriba.
              </span>
            </div>
            {listo && !confirmando ? (
              <Button type="button" variant="outline" size="sm" disabled={!puedePedir || ambienteSinGuardar} onClick={() => setConfirmando(true)}>
                <FileKey /> Hacer uno nuevo
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={!puedePedir || ambienteSinGuardar || generar.isPending} onClick={() => generar.mutate(listo)}>
                <FileKey /> {generar.isPending ? 'Generando…' : 'Generar pedido'}
              </Button>
            )}
          </div>
          {!puedePedir && <p className="text-[13px] text-tinta-suave">Cargá el CUIT y el nombre o razón social, y guardá los cambios.</p>}
          {confirmando && (
            <p role="alert" className="text-[13px] font-semibold text-rojo">
              Ya hay un certificado y una clave cargados. Si seguís, hay que pedir otro certificado en ARCA y los actuales quedan como copia (.anterior).{' '}
              <button type="button" className="underline" onClick={() => generar.mutate(true)}>
                Sí, generar uno nuevo
              </button>{' '}
              ·{' '}
              <button type="button" className="underline" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </p>
          )}
          {pedido && (
            <div role="status" className="rounded-md bg-secondary p-3 text-[13px]">
              <p className="font-semibold">Pedido listo. Nombre (alias) para ARCA: {pedido.alias}</p>
              <p className="text-tinta-suave">Archivo: {pedido.ruta}</p>
              <p className="text-tinta-suave">
                {pedido.reutilizoClave ? 'Se volvió a usar la clave que ya estaba guardada. ' : 'La clave quedó guardada en el programa. '}
                Subí ese archivo en ARCA, descargá el certificado (.crt) y cargalo abajo.
              </p>
            </div>
          )}
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-4 rounded-lg border border-linea p-4">
          <ArchivoCargado
            titulo="Certificado (.crt)"
            cargado={!!e?.tieneCertificado}
            detalle={e?.vencimientoCertificado ? `Vence el ${e.vencimientoCertificado.split('-').reverse().join('/')}` : undefined}
            deshabilitado={ambienteSinGuardar || elegir.isPending}
            alElegir={() => elegir.mutate('certificado')}
          />
          <ArchivoCargado titulo="Clave privada (.key)" cargado={!!e?.tieneClave} deshabilitado={ambienteSinGuardar || elegir.isPending} alElegir={() => elegir.mutate('clave')} />
          {avisoCert && (
            <p role="alert" className={`col-span-2 rounded-lg px-3 py-2 text-[13px] font-semibold ${avisoCert === 'vencido' ? 'bg-rojo-suave text-rojo' : 'bg-mostaza-suave text-tinta'}`}>
              {textoDelAviso(e?.vencimientoCertificado ?? null, diasCert)} Pasos: "Hacer uno nuevo" en el paso 1, subir el pedido en ARCA y cargar el certificado nuevo. Conviene hacerlo fuera del horario de venta.
            </p>
          )}
          {ambienteSinGuardar && <p className="col-span-2 text-[13px] text-tinta-suave">Guardá el cambio de ambiente antes de elegir los archivos: cada ambiente tiene los suyos.</p>}
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!hayCambio || guardar.isPending}>
            Guardar cambios
          </Button>
          <Button type="button" variant="outline" disabled={!listo || hayCambio || probar.isPending} onClick={() => probar.mutate()}>
            <Plug /> {probar.isPending ? 'Probando…' : 'Probar conexión'}
          </Button>
          {hayCambio && listo && <span className="text-[13px] text-tinta-suave">Guardá los cambios para poder probar.</span>}
          {error && (
            <p role="alert" className="text-sm font-semibold text-rojo">
              {error}
            </p>
          )}
        </div>
      </form>

      {pasos && (
        <ol aria-label="Resultado de la prueba" className="mt-4 divide-y divide-linea overflow-hidden rounded-lg border border-linea">
          {pasos.map((p) => (
            <li key={p.paso} className="flex items-start gap-3 px-4 py-2.5">
              <span className={p.ok ? 'mt-0.5 text-verde' : 'mt-0.5 text-rojo'} aria-label={p.ok ? 'Bien' : 'Falló'}>
                {p.ok ? <Check className="size-4" /> : <X className="size-4" />}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{p.paso}</span>
                <span className="text-[13px] text-tinta-suave">{p.detalle}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ArchivoCargado({ titulo, cargado, detalle, deshabilitado, alElegir }: { titulo: string; cargado: boolean; detalle?: string; deshabilitado: boolean; alElegir: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="flex items-center gap-2">
          <Badge variant={cargado ? 'verde' : 'mostaza'}>{cargado ? 'Cargado' : 'Falta'}</Badge>
          {detalle && <span className="text-[12px] text-tinta-suave">{detalle}</span>}
        </span>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={deshabilitado} onClick={alElegir}>
        {cargado ? 'Cambiar' : 'Elegir archivo'}
      </Button>
    </div>
  );
}
