import { Pencil, Plus } from 'lucide-react';
import type { GrupoAgregados } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { plural, precioAdicional, reglaDelGrupo } from './textos';

interface Props {
  grupos: GrupoAgregados[];
  alCrear: () => void;
  alEditar: (g: GrupoAgregados) => void;
}

export function PanelAgregados({ grupos, alCrear, alEditar }: Props) {
  if (grupos.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-16 text-center">
        <h2 className="font-display text-2xl font-semibold">Sin agregados todavía</h2>
        <p className="text-tinta-suave">
          Un grupo de agregados es una pregunta que se hace al vender: el punto de la carne, los
          extras de una hamburguesa, la guarnición de una milanesa. Lo armás una vez y lo usás en
          todos los productos que quieras.
        </p>
        <Button className="mt-2" onClick={alCrear}>
          <Plus /> Crear grupo
        </Button>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
      {grupos.map((g) => (
        <article key={g.id} className="flex flex-col rounded-xl border border-linea bg-superficie">
          <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-lg font-semibold tracking-tight">{g.nombre}</h3>
              <p className="text-[13px] text-tinta-suave">
                {reglaDelGrupo(g)} · {g.cantidadProductos === 0 ? 'ningún producto lo usa' : `lo usan ${plural(g.cantidadProductos, 'producto', 'productos')}`}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${g.nombre}`} onClick={() => alEditar(g)}>
              <Pencil />
            </Button>
          </header>
          <ul className="border-t border-linea px-5 py-2">
            {g.opciones.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-1.5 text-[15px]">
                <span>{o.nombre}</span>
                <span className={o.precioCentavos === 0 ? 'text-[13px] text-tinta-suave' : 'numeros font-semibold'}>
                  {precioAdicional(o.precioCentavos)}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
