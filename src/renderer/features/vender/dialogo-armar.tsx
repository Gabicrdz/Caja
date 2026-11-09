import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { GrupoAgregados, Menu, Producto } from '@compartido/tipos';
import { armarLinea, revisarGrupo } from '@compartido/precios';
import { pesos } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { precioAdicional, reglaDelGrupo } from '@/features/menu/textos';
import type { ItemCarrito, NuevoItem } from './carrito';

interface Props {
  menu: Menu;
  /** Producto a armar (nuevo renglón) o renglón del carrito a editar. */
  producto: Producto | null;
  editando: ItemCarrito | null;
  alCerrar: () => void;
  alConfirmar: (item: NuevoItem) => void;
}

/** Elegir tamaño, agregados, cantidad y nota antes de sumarlo al pedido. */
export function DialogoArmar({ menu, producto, editando, alCerrar, alConfirmar }: Props) {
  const [varianteId, setVarianteId] = useState<number | null>(null);
  const [opciones, setOpciones] = useState<number[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    if (!producto) return;
    setVarianteId(editando?.varianteId ?? (producto.variantes.length === 1 ? producto.variantes[0]!.id : null));
    setOpciones(editando?.opcionesIds ?? []);
    setCantidad(editando?.cantidad ?? 1);
    setNota(editando?.nota ?? '');
    setIntento(false);
  }, [producto, editando]);

  const grupos = useMemo(
    () =>
      (producto?.gruposIds ?? [])
        .map((id) => menu.grupos.find((g) => g.id === id))
        .filter((g): g is GrupoAgregados => g !== undefined),
    [producto, menu.grupos],
  );

  if (!producto) return null;

  const seleccion = { productoId: producto.id, varianteId, opcionesIds: opciones, cantidad };
  const resultado = armarLinea(menu, seleccion);
  const faltaTamano = producto.variantes.length > 0 && varianteId === null;

  function tocarOpcion(grupo: GrupoAgregados, opcionId: number) {
    setOpciones((actuales) => {
      if (actuales.includes(opcionId)) return actuales.filter((id) => id !== opcionId);
      // En los grupos de "uno solo", elegir otra reemplaza a la anterior.
      if (grupo.maximo === 1) {
        const delGrupo = new Set(grupo.opciones.map((o) => o.id));
        return [...actuales.filter((id) => !delGrupo.has(id)), opcionId];
      }
      return [...actuales, opcionId];
    });
  }

  function confirmar() {
    setIntento(true);
    if (!resultado.ok) return;
    alConfirmar({ ...seleccion, nota: nota.trim() });
  }

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && alCerrar()}>
      <DialogContent className="max-w-[720px]">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            confirmar();
          }}
        >
          <DialogHeader>
            <DialogTitle>{producto.nombre}</DialogTitle>
            <DialogDescription>{producto.descripcion || 'Elegí cómo lo quiere.'}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-7">
            {producto.variantes.length > 0 && (
              <section aria-label="Tamaño" className="flex flex-col gap-3">
                <Titulo
                  texto="Tamaño"
                  regla="Elegir 1 · obligatorio"
                  error={intento && faltaTamano ? 'Elegí un tamaño.' : null}
                />
                <div role="radiogroup" aria-label="Tamaño" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                  {producto.variantes.map((v) => (
                    <Ficha
                      key={v.id}
                      rol="radio"
                      elegida={varianteId === v.id}
                      onClick={() => setVarianteId(v.id)}
                      nombre={v.nombre}
                      detalle={pesos(v.precioCentavos)}
                      grande
                    />
                  ))}
                </div>
              </section>
            )}

            {grupos.map((g) => {
              const elegidas = g.opciones.filter((o) => opciones.includes(o.id)).length;
              const lleno = g.maximo !== null && g.maximo > 1 && elegidas >= g.maximo;
              const error = intento ? revisarGrupo(g, elegidas) : null;
              return (
                <section key={g.id} aria-label={g.nombre} className="flex flex-col gap-3">
                  <Titulo texto={g.nombre} regla={reglaDelGrupo(g)} error={error} />
                  <div
                    role={g.maximo === 1 ? 'radiogroup' : 'group'}
                    aria-label={g.nombre}
                    className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2"
                  >
                    {g.opciones.map((o) => {
                      const elegida = opciones.includes(o.id);
                      return (
                        <Ficha
                          key={o.id}
                          rol={g.maximo === 1 ? 'radio' : 'checkbox'}
                          elegida={elegida}
                          deshabilitada={lleno && !elegida}
                          onClick={() => tocarOpcion(g, o.id)}
                          nombre={o.nombre}
                          detalle={precioAdicional(o.precioCentavos)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <div className="grid grid-cols-[auto_1fr] items-end gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Cantidad</span>
                <Contador valor={cantidad} alCambiar={setCantidad} />
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold">Nota para la cocina</span>
                <Input value={nota} maxLength={80} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: sin sal, cortado al medio" />
              </label>
            </div>
          </DialogBody>

          <DialogFooter className="justify-between">
            <p className="text-sm text-tinta-suave" aria-live="polite">
              {intento && !resultado.ok ? <span className="font-semibold text-rojo">{resultado.error}</span> : null}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={alCerrar}>
                Cancelar
              </Button>
              <Button type="submit" size="lg" className="min-w-[220px] justify-between">
                <span>{editando ? 'Guardar' : 'Agregar'}</span>
                <span className="numeros font-display">
                  {resultado.ok ? pesos(resultado.valor.totalCentavos) : '—'}
                </span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Titulo({ texto, regla, error }: { texto: string; regla: string; error: string | null }) {
  return (
    <div className="flex items-baseline gap-3">
      <h3 className="font-display text-lg font-semibold tracking-tight">{texto}</h3>
      <span className={cn('text-[13px]', error ? 'font-semibold text-rojo' : 'text-tinta-suave')}>{error ?? regla}</span>
    </div>
  );
}

function Ficha({
  rol,
  elegida,
  deshabilitada = false,
  onClick,
  nombre,
  detalle,
  grande = false,
}: {
  rol: 'radio' | 'checkbox';
  elegida: boolean;
  deshabilitada?: boolean;
  onClick: () => void;
  nombre: string;
  detalle: string;
  grande?: boolean;
}) {
  return (
    <button
      type="button"
      role={rol}
      aria-checked={elegida}
      disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start gap-0.5 rounded-lg border px-3.5 text-left outline-none transition-colors',
        'focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-40',
        grande ? 'min-h-[64px] py-3' : 'min-h-[56px] py-2.5',
        elegida
          ? 'border-tinta bg-tinta text-white'
          : 'border-linea bg-superficie hover:border-linea-fuerte',
      )}
    >
      <span className={cn('pr-6 font-semibold leading-tight', grande && 'font-display text-[17px]')}>{nombre}</span>
      <span className={cn('numeros text-[13px]', elegida ? 'text-white/75' : 'text-tinta-suave')}>{detalle}</span>
      {elegida && <Check className="absolute top-2.5 right-2.5 size-4 text-mostaza" strokeWidth={3} />}
    </button>
  );
}

export function Contador({
  valor,
  alCambiar,
  minimo = 1,
  chico = false,
  etiqueta = 'Cantidad',
}: {
  valor: number;
  alCambiar: (n: number) => void;
  minimo?: number;
  chico?: boolean;
  etiqueta?: string;
}) {
  return (
    <div className={cn('inline-flex items-center rounded-lg border border-linea-fuerte bg-superficie', chico ? 'h-9' : 'h-11')}>
      <button
        type="button"
        aria-label={`Restar uno (${etiqueta})`}
        disabled={valor <= minimo}
        onClick={() => alCambiar(valor - 1)}
        className={cn('flex h-full items-center justify-center rounded-l-lg outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-35', chico ? 'w-9' : 'w-11')}
      >
        <Minus className="size-4" />
      </button>
      <span aria-live="polite" aria-label={etiqueta} className={cn('numeros text-center font-display font-semibold', chico ? 'w-7 text-[15px]' : 'w-10 text-lg')}>
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Sumar uno (${etiqueta})`}
        disabled={valor >= 99}
        onClick={() => alCambiar(valor + 1)}
        className={cn('flex h-full items-center justify-center rounded-r-lg outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-35', chico ? 'w-9' : 'w-11')}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
