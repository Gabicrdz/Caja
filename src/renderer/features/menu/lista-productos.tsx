import { ChefHat, Copy, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { Categoria, GrupoAgregados, Producto } from '@compartido/tipos';
import { pesos } from '@compartido/dinero';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { caja } from '@/lib/api';
import { useAccion } from './consultas';
import { plural } from './textos';

interface Props {
  secciones: { categoria: Categoria; productos: Producto[] }[];
  grupos: GrupoAgregados[];
  alEditar: (p: Producto) => void;
  alDarDeBaja: (p: Producto) => void;
}

export function ListaProductos({ secciones, grupos, alEditar, alDarDeBaja }: Props) {
  return (
    <div className="flex flex-col gap-8">
      {secciones.map(({ categoria, productos }) => (
        <section key={categoria.id} aria-label={categoria.nombre}>
          <header className="mb-2 flex items-baseline gap-3">
            <h3 className="font-display text-xl font-semibold tracking-tight">{categoria.nombre}</h3>
            <span className="text-[13px] text-tinta-suave">
              {plural(productos.length, 'producto', 'productos')}
            </span>
            {!categoria.activa && <Badge variant="contorno">Oculta en la venta</Badge>}
          </header>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-superficie">
            {productos.map((p) => (
              <FilaProducto
                key={p.id}
                producto={p}
                grupos={grupos}
                alEditar={() => alEditar(p)}
                alDarDeBaja={() => alDarDeBaja(p)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FilaProducto({
  producto: p,
  grupos,
  alEditar,
  alDarDeBaja,
}: {
  producto: Producto;
  grupos: GrupoAgregados[];
  alEditar: () => void;
  alDarDeBaja: () => void;
}) {
  const disponible = useAccion(caja().productos.cambiarDisponible);
  const duplicar = useAccion(caja().productos.duplicar, { exito: 'Producto duplicado' });
  const nombresGrupos = p.gruposIds
    .map((id) => grupos.find((g) => g.id === id)?.nombre)
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={cn('group relative flex items-center gap-5 px-5 py-3.5 hover:bg-[#fafaf8]', !p.disponible && 'bg-[#fbfbfa]')}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2.5">
          {p.codigo && (
            <span className="numeros rounded bg-secondary px-1.5 py-0.5 text-[12px] font-bold tracking-wide text-tinta-suave">
              {p.codigo}
            </span>
          )}
          {/* El nombre es el botón; con "after" ocupa toda la fila para que
              se pueda tocar en cualquier parte y abrir el editor. */}
          <button
            type="button"
            onClick={alEditar}
            className={cn(
              'truncate text-left font-display text-[17px] font-semibold tracking-tight outline-none',
              'after:absolute after:inset-0 after:content-[""] focus-visible:underline',
              !p.disponible && 'text-tinta-suave',
            )}
          >
            {p.nombre}
          </button>
          {!p.vaACocina && (
            <Badge variant="contorno" title="No sale en la comanda de cocina">
              <ChefHat /> No va a cocina
            </Badge>
          )}
        </div>
        {(p.descripcion || nombresGrupos) && (
          <p className="truncate text-[13px] text-tinta-suave">
            {p.descripcion}
            {p.descripcion && nombresGrupos && <span className="mx-1.5">·</span>}
            {nombresGrupos && <span>Agregados: {nombresGrupos}</span>}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {p.variantes.length > 0 ? (
          p.variantes.map((v) => (
            <span key={v.id} className="flex flex-col items-end rounded-md bg-[#f4f4f1] px-2.5 py-1">
              <span className="text-[11px] font-semibold text-tinta-suave">{v.nombre}</span>
              <span className="numeros font-display text-[15px] font-semibold">{pesos(v.precioCentavos)}</span>
            </span>
          ))
        ) : (
          <span className="numeros font-display text-lg font-semibold">{pesos(p.precioCentavos)}</span>
        )}
      </div>

      <label className="relative z-10 flex w-[132px] shrink-0 cursor-pointer items-center justify-end gap-2.5">
        <span className={cn('text-[13px] font-semibold', p.disponible ? 'text-verde' : 'text-rojo')}>
          {p.disponible ? 'Disponible' : 'Agotado'}
        </span>
        <Switch
          checked={p.disponible}
          disabled={disponible.isPending}
          onCheckedChange={(valor) => disponible.mutate([p.id, valor])}
          aria-label={`${p.nombre}: disponible para vender`}
        />
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="relative z-10" aria-label={`Opciones de ${p.nombre}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={alEditar}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicar.mutate([p.id])}>
            <Copy /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem peligro onSelect={alDarDeBaja}>
            <Trash2 /> Quitar del menú
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
