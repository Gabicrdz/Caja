import { ArrowDown, ArrowUp, Ellipsis, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import type { Categoria } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { caja } from '@/lib/api';
import { useAccion } from './consultas';

export type Seleccion = 'todas' | number;

interface Props {
  categorias: Categoria[];
  totalProductos: number;
  seleccion: Seleccion;
  alSeleccionar: (s: Seleccion) => void;
  alCrear: () => void;
  alRenombrar: (c: Categoria) => void;
}

export function PanelCategorias({
  categorias,
  totalProductos,
  seleccion,
  alSeleccionar,
  alCrear,
  alRenombrar,
}: Props) {
  const mover = useAccion(caja().categorias.mover);
  const cambiarEstado = useAccion(caja().categorias.cambiarEstado);
  const visibles = categorias.filter((c) => c.activa);
  const ocultas = categorias.filter((c) => !c.activa);

  const fila = (c: Categoria, indice: number) => (
    <li key={c.id} className="group relative">
      <BotonCategoria
        activo={seleccion === c.id}
        apagado={!c.activa}
        onClick={() => alSeleccionar(c.id)}
        nombre={c.nombre}
        cantidad={c.cantidadProductos}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Opciones de ${c.nombre}`}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem onSelect={() => alRenombrar(c)}>
            <Pencil /> Renombrar
          </DropdownMenuItem>
          {c.activa && (
            <>
              <DropdownMenuItem disabled={indice === 0} onSelect={() => mover.mutate([c.id, 'arriba'])}>
                <ArrowUp /> Subir
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={indice === visibles.length - 1}
                onSelect={() => mover.mutate([c.id, 'abajo'])}
              >
                <ArrowDown /> Bajar
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {c.activa ? (
            <DropdownMenuItem onSelect={() => cambiarEstado.mutate([c.id, false])}>
              <EyeOff /> Ocultar de la venta
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => cambiarEstado.mutate([c.id, true])}>
              <Eye /> Mostrar en la venta
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );

  return (
    <aside aria-label="Categorías" className="flex flex-col gap-1">
      <div className="mb-2 flex items-center justify-between pl-3">
        <h2 className="text-[13px] font-semibold tracking-wide text-tinta-suave">Categorías</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Nueva categoría" onClick={alCrear}>
          <Plus />
        </Button>
      </div>
      <ul className="flex flex-col gap-0.5">
        <li>
          <BotonCategoria
            activo={seleccion === 'todas'}
            onClick={() => alSeleccionar('todas')}
            nombre="Todo el menú"
            cantidad={totalProductos}
          />
        </li>
        {visibles.map(fila)}
      </ul>
      {ocultas.length > 0 && (
        <>
          <h3 className="mt-5 mb-1 pl-3 text-[13px] font-semibold tracking-wide text-tinta-suave">
            Ocultas
          </h3>
          <ul className="flex flex-col gap-0.5">{ocultas.map(fila)}</ul>
        </>
      )}
    </aside>
  );
}

function BotonCategoria({
  activo,
  apagado = false,
  nombre,
  cantidad,
  onClick,
}: {
  activo: boolean;
  apagado?: boolean;
  nombre: string;
  cantidad: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activo ? 'true' : undefined}
      className={cn(
        'relative flex h-11 w-full items-center gap-2 rounded-md pr-12 pl-3 text-left text-[15px] outline-none transition-colors',
        'focus-visible:ring-[3px] focus-visible:ring-ring/25',
        activo
          ? 'bg-superficie font-semibold shadow-[0_1px_0_var(--linea)] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-r before:bg-mostaza'
          : 'hover:bg-black/[0.04]',
        apagado && 'text-tinta-suave',
      )}
    >
      {apagado && <EyeOff className="size-4 shrink-0" aria-label="Oculta" />}
      <span className="truncate">{nombre}</span>
      <span className="numeros absolute right-3 text-[13px] text-tinta-suave group-hover:opacity-0 group-has-[[data-state=open]]:opacity-0">
        {cantidad}
      </span>
    </button>
  );
}
