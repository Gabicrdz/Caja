import { useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import {
  ChartColumn,
  Lock,
  ReceiptText,
  Settings,
  ShoppingBag,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Marca } from './marca';
import { useBloquear, useUsuario } from '@/features/sesion/consultas';
import { Iniciales } from '@/features/sesion/pantalla-ingreso';

interface Seccion {
  ruta: string;
  nombre: string;
  icono: LucideIcon;
  /** Las secciones que todavía no existen se ven, pero apagadas. */
  llegaEn?: string;
}

const SECCIONES: Seccion[] = [
  { ruta: '/vender', nombre: 'Vender', icono: ShoppingBag },
  { ruta: '/pedidos', nombre: 'Pedidos', icono: ReceiptText },
  { ruta: '/caja', nombre: 'Caja', icono: Wallet },
  { ruta: '/menu', nombre: 'Menú', icono: UtensilsCrossed },
  { ruta: '/clientes', nombre: 'Clientes', icono: UsersRound },
];

const REPORTES: Seccion = { ruta: '/reportes', nombre: 'Reportes', icono: ChartColumn };

const AJUSTES: Seccion = { ruta: '/ajustes', nombre: 'Ajustes', icono: Settings };

function Boton({ seccion }: { seccion: Seccion }) {
  const Icono = seccion.icono;
  const contenido = (
    <>
      <Icono className="size-[22px]" strokeWidth={1.9} />
      <span className="text-[12px] font-semibold tracking-wide">{seccion.nombre}</span>
    </>
  );
  const base =
    'relative flex h-[68px] w-full flex-col items-center justify-center gap-1.5 rounded-lg outline-none transition-colors';

  if (seccion.llegaEn) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-disabled="true"
            tabIndex={0}
            className={cn(base, 'cursor-default text-riel-texto/45 focus-visible:ring-2 focus-visible:ring-mostaza')}
          >
            {contenido}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{seccion.llegaEn.startsWith('Solo') ? seccion.llegaEn : `Llega en ${seccion.llegaEn}`}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <NavLink
      to={seccion.ruta}
      className={({ isActive }) =>
        cn(
          base,
          'focus-visible:ring-2 focus-visible:ring-mostaza',
          isActive
            ? 'bg-white/[0.08] text-white before:absolute before:top-3 before:bottom-3 before:-left-3 before:w-1 before:rounded-r before:bg-mostaza'
            : 'text-riel-texto hover:bg-white/[0.05] hover:text-white',
        )
      }
    >
      {contenido}
    </NavLink>
  );
}

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 15_000);
    return () => window.clearInterval(intervalo);
  }, []);
  return (
    <div className="flex flex-col items-center gap-0.5 text-riel-texto">
      <span className="numeros font-display text-lg font-semibold text-white">
        {ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </span>
      <span className="text-[11px] capitalize">
        {ahora.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })}
      </span>
    </div>
  );
}

/** Quién está atendiendo, y el botón para bloquear (volver a la pantalla del PIN). */
function Atendiendo() {
  const { usuario } = useUsuario();
  const bloquear = useBloquear();
  if (!usuario) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => bloquear.mutate()}
          aria-label={`${usuario.nombre}: bloquear la caja`}
          className="group flex w-full flex-col items-center gap-1 rounded-lg py-2 text-riel-texto outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-mostaza"
        >
          <span className="relative">
            <Iniciales nombre={usuario.nombre} oscuro />
            <Lock className="absolute -right-1 -bottom-1 size-4 rounded-full bg-riel p-0.5 text-mostaza" />
          </span>
          <span className="max-w-full truncate px-1 text-[11px] font-semibold">{usuario.nombre}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Bloquear (pedir PIN)</TooltipContent>
    </Tooltip>
  );
}

export function Riel() {
  const { esDueno } = useUsuario();
  return (
    <nav
      aria-label="Secciones"
      className="flex w-[96px] shrink-0 flex-col items-center gap-1 bg-riel px-3 py-4"
    >
      <Marca className="mb-5 size-11" />
      {SECCIONES.map((s) => (
        <Boton key={s.ruta} seccion={s} />
      ))}
      <Boton seccion={esDueno ? REPORTES : { ...REPORTES, llegaEn: 'Solo el dueño' }} />
      <div className="mt-auto flex w-full flex-col items-center gap-4">
        <Boton seccion={esDueno ? AJUSTES : { ...AJUSTES, llegaEn: 'Solo el dueño' }} />
        <Atendiendo />
        <Reloj />
      </div>
    </nav>
  );
}
