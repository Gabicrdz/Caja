import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { esquemaUsuario } from '@compartido/esquemas';
import { NOMBRE_ROL, type Rol, type Usuario } from '@compartido/tipos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { caja, desenvolver } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Confirmar, type Confirmacion } from '@/features/menu/confirmar';
import { DialogoImpresion } from '@/features/pedidos/dialogo-impresion';
import { useConfiguracion } from '@/features/vender/consultas';
import { Iniciales } from '@/features/sesion/pantalla-ingreso';
import { useUsuario } from '@/features/sesion/consultas';

const PERMISOS: Record<Rol, string> = {
  dueno: 'Todo: menú, precios, anular pedidos, retiros, usuarios y reportes.',
  cajero: 'Vende, cobra, mueve pedidos, marca agotados y abre o cierra la caja.',
};

export function PaginaAjustes() {
  const { usuario: yo } = useUsuario();
  const cliente = useQueryClient();
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => desenvolver(caja().usuarios.listar()) });
  const configuracion = useConfiguracion();
  const [editando, setEditando] = useState<{ usuario: Usuario | null } | null>(null);
  const [impresion, setImpresion] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const baja = useMutation({
    mutationFn: (id: number) => desenvolver(caja().usuarios.darDeBaja(id)),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuario dado de baja');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-8 px-8 pt-7 pb-12">
      <header>
        <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-2 text-tinta-suave">Usuarios e impresión. (El resto de los ajustes llega en la etapa 6.)</p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Usuarios</h2>
            <p className="text-sm text-tinta-suave">Cada uno entra con su PIN. Así cada venta queda registrada con quién la hizo.</p>
          </div>
          <Button onClick={() => setEditando({ usuario: null })}>
            <Plus /> Nuevo usuario
          </Button>
        </div>
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
          {usuarios.data?.map((u) => (
            <li key={u.id} className="flex items-center gap-4 px-5 py-3.5">
              <Iniciales nombre={u.nombre} />
              <div className="flex flex-1 flex-col">
                <span className="flex items-center gap-2 font-semibold">
                  {u.nombre}
                  <Badge variant={u.rol === 'dueno' ? 'mostaza' : 'default'}>{NOMBRE_ROL[u.rol]}</Badge>
                  {u.id === yo?.id && <span className="text-[13px] font-normal text-tinta-suave">(vos)</span>}
                </span>
                <span className="text-[13px] text-tinta-suave">{PERMISOS[u.rol]}</span>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${u.nombre}`} onClick={() => setEditando({ usuario: u })}>
                <Pencil />
              </Button>
              {u.id !== yo?.id && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Dar de baja a ${u.nombre}`}
                  onClick={() =>
                    setConfirmacion({
                      titulo: `¿Dar de baja a ${u.nombre}?`,
                      descripcion: 'No va a poder entrar más. Sus ventas quedan registradas.',
                      boton: 'Dar de baja',
                      alConfirmar: () => baja.mutate(u.id),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-between rounded-xl border border-linea bg-superficie px-5 py-4">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Impresión</h2>
          <p className="text-sm text-tinta-suave">
            {configuracion.data?.impresora ? `Imprime directo en ${configuracion.data.impresora}` : 'Pregunta la impresora cada vez'} · papel de{' '}
            {configuracion.data?.anchoPapel ?? 80} mm
          </p>
        </div>
        <Button variant="outline" onClick={() => setImpresion(true)}>
          <Printer /> Configurar
        </Button>
      </section>

      <DialogoUsuario abierto={editando !== null} usuario={editando?.usuario ?? null} alCerrar={() => setEditando(null)} />
      <DialogoImpresion abierto={impresion} alCerrar={() => setImpresion(false)} />
      <Confirmar confirmacion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </div>
  );
}

function DialogoUsuario({ abierto, usuario, alCerrar }: { abierto: boolean; usuario: Usuario | null; alCerrar: () => void }) {
  const cliente = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('cajero');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const guardar = useMutation({
    mutationFn: () => desenvolver(caja().usuarios.guardar({ id: usuario?.id, nombre, rol, pin })),
    onSuccess: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['usuarios'] }),
        cliente.invalidateQueries({ queryKey: ['sesion'] }),
      ]);
      toast.success(usuario ? 'Usuario actualizado' : 'Usuario creado');
      alCerrar();
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (abierto) {
      setNombre(usuario?.nombre ?? '');
      setRol(usuario?.rol ?? 'cajero');
      setPin('');
      setError('');
    }
  }, [abierto, usuario]);

  function enviar() {
    const r = esquemaUsuario.safeParse({ id: usuario?.id, nombre, rol, pin });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá los datos.');
    if (!usuario && !pin) return setError('Elegí un PIN de 4 a 6 números.');
    guardar.mutate();
  }

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && alCerrar()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <DialogHeader>
            <DialogTitle>{usuario ? `Editar a ${usuario.nombre}` : 'Nuevo usuario'}</DialogTitle>
            <DialogDescription>El PIN es personal: que cada uno elija el suyo.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <Campo etiqueta="Nombre" htmlFor="u-nombre">
              <Input id="u-nombre" autoFocus maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </Campo>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Rol</legend>
              <div role="radiogroup" aria-label="Rol" className="grid grid-cols-2 gap-2">
                {(['cajero', 'dueno'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={rol === r}
                    onClick={() => setRol(r)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border px-3.5 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
                      rol === r ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-linea-fuerte',
                    )}
                  >
                    <span className="font-semibold">{NOMBRE_ROL[r]}</span>
                    <span className={cn('text-[12px] leading-snug', rol === r ? 'text-white/75' : 'text-tinta-suave')}>{PERMISOS[r]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <Campo etiqueta={usuario ? 'PIN nuevo (opcional)' : 'PIN (4 a 6 números)'} htmlFor="u-pin" ayuda={usuario ? 'Dejalo vacío para no cambiarlo.' : undefined}>
              <Input id="u-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </Campo>
            {error && <p role="alert" className="text-sm font-semibold text-rojo">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={alCerrar}>Cancelar</Button>
            <Button type="submit" disabled={guardar.isPending}>{usuario ? 'Guardar' : 'Crear usuario'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
