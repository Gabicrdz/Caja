import { useMemo, useState } from 'react';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import type { Categoria, GrupoAgregados, Producto } from '@compartido/tipos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { caja } from '@/lib/api';
import { cn, normalizar } from '@/lib/utils';
import { Confirmar, type Confirmacion } from './confirmar';
import { useAccion, useMenu } from './consultas';
import { DialogoCategoria } from './dialogo-categoria';
import { EditorGrupo } from './editor-grupo';
import { EditorProducto } from './editor-producto';
import { ListaProductos } from './lista-productos';
import { PanelAgregados } from './panel-agregados';
import { PanelCategorias, type Seleccion } from './panel-categorias';
import { plural } from './textos';

type Filtro = 'todos' | 'disponibles' | 'agotados';
type Pestana = 'productos' | 'agregados';

export function PaginaMenu() {
  const menu = useMenu();
  const [pestana, setPestana] = useState<Pestana>('productos');
  const [seleccion, setSeleccion] = useState<Seleccion>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [editorProducto, setEditorProducto] = useState<{ producto: Producto | null } | null>(null);
  const [dialogoCategoria, setDialogoCategoria] = useState<{ categoria: Categoria | null } | null>(null);
  const [editorGrupo, setEditorGrupo] = useState<{ grupo: GrupoAgregados | null } | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  const darDeBajaProducto = useAccion(caja().productos.darDeBaja, { exito: 'Producto quitado del menú' });
  const darDeBajaGrupo = useAccion(caja().grupos.darDeBaja, { exito: 'Grupo eliminado' });
  const cargarEjemplo = useAccion(caja().menu.cargarEjemplo, { exito: 'Menú de ejemplo cargado' });

  const datos = menu.data;
  const categoriaSeleccionada =
    seleccion === 'todas' ? null : (datos?.categorias.find((c) => c.id === seleccion) ?? null);

  const secciones = useMemo(() => {
    if (!datos) return [];
    const texto = normalizar(busqueda.trim());
    const coincide = (p: Producto) =>
      (filtro === 'todos' || (filtro === 'disponibles' ? p.disponible : !p.disponible)) &&
      (!texto || normalizar(`${p.nombre} ${p.codigo} ${p.descripcion}`).includes(texto));
    return datos.categorias
      .filter((c) => seleccion === 'todas' || c.id === seleccion)
      .map((categoria) => ({
        categoria,
        productos: datos.productos.filter((p) => p.categoriaId === categoria.id && coincide(p)),
      }))
      .filter((s) => s.productos.length > 0);
  }, [datos, busqueda, filtro, seleccion]);

  if (menu.isPending) {
    return <p className="p-10 text-tinta-suave">Cargando el menú…</p>;
  }
  if (menu.isError) {
    return (
      <div className="p-10">
        <p className="font-semibold text-rojo">No se pudo cargar el menú.</p>
        <p className="text-tinta-suave">{menu.error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => menu.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const { categorias, productos, grupos } = menu.data;
  const agotados = productos.filter((p) => !p.disponible).length;
  const nuevoProducto = () => setEditorProducto({ producto: null });
  const hayFiltros = busqueda.trim() !== '' || filtro !== 'todos';

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col px-10 pt-8 pb-16">
      {/* ── Encabezado ── */}
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">Menú</h1>
          <p className="mt-2 text-tinta-suave">
            {categorias.length === 0
              ? 'Lo que se vende y a cuánto.'
              : `${plural(productos.length, 'producto', 'productos')} en ${plural(categorias.length, 'categoría', 'categorías')}` +
                (agotados > 0 ? ` · ${plural(agotados, 'agotado', 'agotados')}` : '')}
          </p>
        </div>
        {categorias.length > 0 && (
          <div className="flex gap-2">
            {pestana === 'productos' ? (
              <>
                <Button variant="outline" onClick={() => setDialogoCategoria({ categoria: null })}>
                  <Plus /> Categoría
                </Button>
                <Button onClick={nuevoProducto}>
                  <Plus /> Nuevo producto
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditorGrupo({ grupo: null })}>
                <Plus /> Nuevo grupo
              </Button>
            )}
          </div>
        )}
      </header>

      {categorias.length === 0 ? (
        <MenuVacio
          cargando={cargarEjemplo.isPending}
          alCrearCategoria={() => setDialogoCategoria({ categoria: null })}
          alCargarEjemplo={() => cargarEjemplo.mutate([])}
        />
      ) : (
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)} className="mt-6">
          <TabsList>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="agregados">
              Agregados
              <span className="numeros rounded-full bg-secondary px-2 text-[12px] text-tinta-suave">{grupos.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="productos" className="mt-6 grid grid-cols-[248px_1fr] gap-8">
            <PanelCategorias
              categorias={categorias}
              totalProductos={productos.length}
              seleccion={seleccion}
              alSeleccionar={setSeleccion}
              alCrear={() => setDialogoCategoria({ categoria: null })}
              alRenombrar={(categoria) => setDialogoCategoria({ categoria })}
            />

            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="relative max-w-md flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-tinta-suave" />
                  <Input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setBusqueda('')}
                    placeholder="Buscar por nombre o código"
                    aria-label="Buscar productos"
                    className="pr-10 pl-10 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {busqueda && (
                    <button
                      type="button"
                      aria-label="Borrar búsqueda"
                      onClick={() => setBusqueda('')}
                      className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-tinta-suave hover:bg-accent"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                <div role="radiogroup" aria-label="Mostrar" className="inline-flex rounded-lg bg-secondary p-1">
                  {(
                    [
                      ['todos', 'Todos'],
                      ['disponibles', 'Disponibles'],
                      ['agotados', `Agotados${agotados ? ` (${agotados})` : ''}`],
                    ] as const
                  ).map(([valor, texto]) => (
                    <button
                      key={valor}
                      type="button"
                      role="radio"
                      aria-checked={filtro === valor}
                      onClick={() => setFiltro(valor)}
                      className={cn(
                        'h-9 rounded-md px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                        filtro === valor ? 'bg-superficie shadow-sm' : 'text-tinta-suave hover:text-tinta',
                      )}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              </div>

              {secciones.length > 0 ? (
                <ListaProductos
                  secciones={secciones}
                  grupos={grupos}
                  alEditar={(producto) => setEditorProducto({ producto })}
                  alDarDeBaja={(p) =>
                    setConfirmacion({
                      titulo: `¿Quitar "${p.nombre}" del menú?`,
                      descripcion:
                        'Deja de aparecer para vender. Si solo se terminó por hoy, mejor marcalo como agotado.',
                      boton: 'Quitar del menú',
                      alConfirmar: () => darDeBajaProducto.mutate([p.id]),
                    })
                  }
                />
              ) : (
                <SinResultados
                  hayFiltros={hayFiltros}
                  categoria={categoriaSeleccionada}
                  alLimpiar={() => {
                    setBusqueda('');
                    setFiltro('todos');
                  }}
                  alCrear={nuevoProducto}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="agregados" className="mt-6">
            <PanelAgregados
              grupos={grupos}
              alCrear={() => setEditorGrupo({ grupo: null })}
              alEditar={(grupo) => setEditorGrupo({ grupo })}
            />
          </TabsContent>
        </Tabs>
      )}

      <EditorProducto
        abierto={editorProducto !== null}
        producto={editorProducto?.producto ?? null}
        categoriaInicial={categoriaSeleccionada?.id ?? categorias.find((c) => c.activa)?.id ?? null}
        categorias={categorias}
        grupos={grupos}
        alCerrar={() => setEditorProducto(null)}
        alIrAAgregados={() => {
          setEditorProducto(null);
          setPestana('agregados');
        }}
      />
      <DialogoCategoria
        abierto={dialogoCategoria !== null}
        categoria={dialogoCategoria?.categoria ?? null}
        alCerrar={() => setDialogoCategoria(null)}
        alCrear={(id) => setSeleccion(id)}
      />
      <EditorGrupo
        abierto={editorGrupo !== null}
        grupo={editorGrupo?.grupo ?? null}
        alCerrar={() => setEditorGrupo(null)}
        alDarDeBaja={(g) =>
          setConfirmacion({
            titulo: `¿Eliminar "${g.nombre}"?`,
            descripcion:
              g.cantidadProductos > 0
                ? `Se va a sacar de ${plural(g.cantidadProductos, 'producto', 'productos')} que lo usan.`
                : 'Ningún producto lo usa.',
            boton: 'Eliminar grupo',
            alConfirmar: () => {
              darDeBajaGrupo.mutate([g.id]);
              setEditorGrupo(null);
            },
          })
        }
      />
      <Confirmar confirmacion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </div>
  );
}

function MenuVacio({
  cargando,
  alCrearCategoria,
  alCargarEjemplo,
}: {
  cargando: boolean;
  alCrearCategoria: () => void;
  alCargarEjemplo: () => void;
}) {
  return (
    <section className="mt-10 grid grid-cols-2 overflow-hidden rounded-2xl border border-linea bg-superficie">
      <div className="flex flex-col gap-4 p-10">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Armá tu menú</h2>
        <p className="max-w-md text-[17px] text-tinta-suave">
          Empezá por las categorías (Hamburguesas, Pizzas, Bebidas…) y después cargá cada producto
          con su precio, sus tamaños y sus agregados.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button size="lg" onClick={alCrearCategoria}>
            <Plus /> Crear la primera categoría
          </Button>
          <Button size="lg" variant="outline" onClick={alCargarEjemplo} disabled={cargando}>
            <Sparkles /> Cargar menú de ejemplo
          </Button>
        </div>
        <p className="text-[13px] text-tinta-suave">
          El ejemplo trae 24 productos de un local de comidas. Sirve para probar y después lo editás.
        </p>
      </div>
      <ol className="flex flex-col justify-center gap-5 border-l border-linea bg-[#fafaf8] p-10">
        {[
          ['Categorías', 'Ordenan el menú en la pantalla de venta.'],
          ['Productos', 'Con precio único o por tamaño: chica, grande, docena…'],
          ['Agregados', 'Extras, punto de la carne, guarniciones. Con o sin cargo.'],
        ].map(([titulo, texto], i) => (
          <li key={titulo} className="flex gap-4">
            <span className="numeros flex size-9 shrink-0 items-center justify-center rounded-full bg-tinta font-display font-semibold text-mostaza">
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">{titulo}</span>
              <span className="text-tinta-suave">{texto}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SinResultados({
  hayFiltros,
  categoria,
  alLimpiar,
  alCrear,
}: {
  hayFiltros: boolean;
  categoria: Categoria | null;
  alLimpiar: () => void;
  alCrear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-linea-fuerte px-6 py-14 text-center">
      {hayFiltros ? (
        <>
          <p className="font-display text-xl font-semibold">No hay productos que coincidan</p>
          <p className="text-tinta-suave">Probá con otra palabra o mirá todos los productos.</p>
          <Button variant="outline" onClick={alLimpiar}>
            Ver todos
          </Button>
        </>
      ) : (
        <>
          <p className="font-display text-xl font-semibold">
            {categoria ? `${categoria.nombre} todavía no tiene productos` : 'Todavía no hay productos'}
          </p>
          <Button onClick={alCrear}>
            <Plus /> Nuevo producto
          </Button>
        </>
      )}
    </div>
  );
}
