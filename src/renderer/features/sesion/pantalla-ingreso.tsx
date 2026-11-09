import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { NOMBRE_ROL, type Usuario } from '@compartido/tipos';
import { esquemaPin } from '@compartido/esquemas';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Input } from '@/components/ui/input';
import { Marca } from '@/components/layout/marca';
import { useConfiguracion } from '@/features/vender/consultas';
import { useCrearPrimerDueno, useIngresar, useUsuariosParaIngresar } from './consultas';
import { TecladoPin } from './teclado-pin';

/** Lo primero que se ve: elegir quién atiende y poner el PIN. */
export function PantallaIngreso() {
  const usuarios = useUsuariosParaIngresar();
  const configuracion = useConfiguracion();
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="grid h-full grid-cols-[minmax(320px,38%)_1fr]">
      <aside className="flex flex-col justify-between bg-riel p-10 text-white">
        <Marca className="size-14" />
        <div>
          <p className="font-display text-5xl font-semibold tracking-tight">{configuracion.data?.nombreLocal ?? 'Caja'}</p>
          <p className="mt-3 text-lg text-riel-texto first-letter:uppercase">
            {ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="numeros font-display text-7xl font-semibold">{ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        </div>
        <p className="text-sm text-riel-texto">Cada venta queda registrada con quién la hizo.</p>
      </aside>
      <main className="flex items-center justify-center p-10">
        {usuarios.isPending ? (
          <p className="text-tinta-suave">Cargando…</p>
        ) : usuarios.isError ? (
          <p className="text-rojo">{usuarios.error.message}</p>
        ) : usuarios.data.length === 0 ? (
          <PrimerDueno />
        ) : (
          <ElegirUsuario usuarios={usuarios.data} />
        )}
      </main>
    </div>
  );
}

function ElegirUsuario({ usuarios }: { usuarios: Usuario[] }) {
  const [elegido, setElegido] = useState<Usuario | null>(usuarios.length === 1 ? usuarios[0]! : null);
  const [pin, setPin] = useState('');
  const ingresar = useIngresar();

  function confirmar() {
    if (!elegido || ingresar.isPending) return;
    ingresar.mutate({ usuarioId: elegido.id, pin }, { onError: () => setPin('') });
  }

  if (!elegido) {
    return (
      <section className="flex w-full max-w-xl flex-col gap-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight">¿Quién atiende?</h1>
        <ul className="grid grid-cols-2 gap-3">
          {usuarios.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => {
                  setElegido(u);
                  setPin('');
                  ingresar.reset();
                }}
                className="flex w-full items-center gap-4 rounded-xl border border-linea bg-superficie p-4 text-left outline-none hover:border-linea-fuerte focus-visible:ring-[3px] focus-visible:ring-ring/25"
              >
                <Iniciales nombre={u.nombre} />
                <span className="flex flex-col">
                  <span className="font-display text-lg font-semibold">{u.nombre}</span>
                  <span className="text-sm text-tinta-suave">{NOMBRE_ROL[u.rol]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center gap-4">
      {usuarios.length > 1 && (
        <Button variant="ghost" className="self-start" onClick={() => setElegido(null)}>
          <ArrowLeft /> Cambiar usuario
        </Button>
      )}
      <Iniciales nombre={elegido.nombre} grande />
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{elegido.nombre}</h1>
        <p className="text-tinta-suave">Escribí tu PIN</p>
      </div>
      <TecladoPin
        valor={pin}
        alCambiar={(v) => {
          setPin(v);
          if (ingresar.isError) ingresar.reset();
        }}
        alConfirmar={confirmar}
        error={ingresar.error?.message}
        deshabilitado={ingresar.isPending}
      />
    </section>
  );
}

function PrimerDueno() {
  const crear = useCrearPrimerDueno();
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [repetido, setRepetido] = useState('');
  const [error, setError] = useState('');

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return setError('Escribí tu nombre.');
    if (!esquemaPin.safeParse(pin).success) return setError('El PIN tiene que ser de 4 a 6 números.');
    if (pin !== repetido) return setError('Los dos PIN no coinciden.');
    setError('');
    crear.mutate({ nombre: nombre.trim(), pin }, { onError: (err) => setError(err.message) });
  }

  return (
    <form onSubmit={enviar} noValidate className="flex w-full max-w-md flex-col gap-5">
      <div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Bienvenido</h1>
        <p className="mt-2 text-tinta-suave">
          Creá el usuario del <strong>dueño</strong>. Con ese usuario después cargás a los cajeros.
        </p>
      </div>
      <Campo etiqueta="Tu nombre" htmlFor="pd-nombre">
        <Input id="pd-nombre" autoFocus maxLength={30} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="PIN (4 a 6 números)" htmlFor="pd-pin">
          <Input id="pd-pin" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo etiqueta="Repetí el PIN" htmlFor="pd-pin2">
          <Input id="pd-pin2" type="password" inputMode="numeric" maxLength={6} value={repetido} onChange={(e) => setRepetido(e.target.value.replace(/\D/g, ''))} />
        </Campo>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-rojo">{error}</p>}
      <Button type="submit" size="lg" disabled={crear.isPending}>
        Crear y entrar
      </Button>
      <p className="text-[13px] text-tinta-suave">Anotá el PIN en un lugar seguro: no se puede recuperar, solo cambiar desde otro dueño.</p>
    </form>
  );
}

export function Iniciales({ nombre, grande = false, oscuro = false }: { nombre: string; grande?: boolean; oscuro?: boolean }) {
  const letras = nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className={
        grande
          ? 'flex size-20 items-center justify-center rounded-full bg-tinta font-display text-3xl font-semibold text-mostaza'
          : oscuro
            ? 'flex size-10 items-center justify-center rounded-full bg-white/10 font-display text-[15px] font-semibold text-white'
            : 'flex size-12 shrink-0 items-center justify-center rounded-full bg-tinta font-display text-lg font-semibold text-mostaza'
      }
    >
      {letras}
    </span>
  );
}
