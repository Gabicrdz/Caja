import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Search, X } from 'lucide-react';
import type { Producto } from '@compartido/tipos';
import { pesos } from '@compartido/dinero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, normalizar } from '@/lib/utils';
import { useAccion, useMenu } from '@/features/menu/consultas';
import { caja } from '@/lib/api';
import { useCarrito, type ItemCarrito } from './carrito';
import { useConfiguracion, useResumenDeHoy } from './consultas';
import { DialogoArmar } from './dialogo-armar';
import { DialogoCobro } from './dialogo-cobro';
import { GrillaProductos } from './grilla-productos';
import { PanelPedido } from './panel-pedido';
import { useTotales } from './totales';

export function PaginaVender() {
  const menu = useMenu();
  const configuracion = useConfiguracion();
  const resumen = useResumenDeHoy();
  const carrito = useCarrito();
  const [categoria, setCategoria] = useState<number | 'todas'>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [armando, setArmando] = useState<{ producto: Producto; editando: ItemCarrito | null } | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);
  const cargarEjemplo = useAccion(caja().menu.cargarEjemplo, { exito: 'Menú de ejemplo cargado' });

  const envioPorDefecto = configuracion.data?.envioCentavos ?? 0;
  const totales = useTotales(menu.data, carrito.items, carrito.tipo, carrito.envioCentavos ?? envioPorDefecto);

  // Solo se vende lo de las categorías visibles.
  const visibles = useMemo(() => {
    if (!menu.data) return { categorias: [], productos: [] };
    const categorias = menu.data.categorias.filter((c) => c.activa);
    const ids = new Set(categorias.map((c) => c.id));
    return { categorias, productos: menu.data.productos.filter((p) => ids.has(p.categoriaId)) };
  }, [menu.data]);

  const texto = normalizar(busqueda.trim());
  const mostrados = texto
    ? visibles.productos.filter((p) => normalizar(`${p.nombre} ${p.codigo}`).includes(texto))
    : visibles.productos.filter((p) => categoria === 'todas' || p.categoriaId === categoria);

  const enfocarBuscador = useCallback(() => setTimeout(() => buscador.current?.focus(), 0), []);

  const tocar = useCallback(
    (p: Producto) => {
      if (!p.disponible) return;
      if (p.variantes.length === 0 && p.gruposIds.length === 0) {
        carrito.agregar({ productoId: p.id, varianteId: null, opcionesIds: [], cantidad: 1, nota: '' });
        enfocarBuscador();
      } else {
        setArmando({ producto: p, editando: null });
      }
    },
    [carrito, enfocarBuscador],
  );

  /** Enter en el buscador: código exacto, o el único resultado. */
  function alEnter() {
    const exacto = visibles.productos.find((p) => p.codigo && p.codigo.toLowerCase() === busqueda.trim().toLowerCase());
    const elegido = exacto ?? (mostrados.length === 1 ? mostrados[0] : undefined);
    if (elegido) {
      setBusqueda('');
      tocar(elegido);
    }
  }

  const falta =
    carrito.tipo === 'delivery' && !carrito.clienteDireccion.trim()
      ? 'Para delivery falta la dirección.'
      : carrito.tipo === 'mesa' && !carrito.mesa.trim()
        ? 'Falta el número de mesa.'
        : null;
  const puedeCobrar = carrito.items.length > 0 && !totales.hayProblemas && falta === null;
  // F2 = cobrar, desde cualquier parte de la pantalla.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'F2' && puedeCobrar && !armando) {
        e.preventDefault();
        setCobrando(true);
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [puedeCobrar, armando]);

  if (menu.isPending) return <p className="p-10 text-tinta-suave">Cargando el menú…</p>;
  if (menu.isError) return <p className="p-10 text-rojo">No se pudo cargar el menú: {menu.error.message}</p>;

  if (visibles.productos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <h1 className="font-display text-3xl font-semibold">Todavía no hay nada para vender</h1>
        <p className="max-w-md text-tinta-suave">Primero cargá los productos en el Menú, o cargá el menú de ejemplo para probar.</p>
        <div className="mt-2 flex gap-2">
          <Button asChild>
            <Link to="/menu">Ir al Menú</Link>
          </Button>
          {menu.data.productos.length === 0 && (
            <Button variant="outline" disabled={cargarEjemplo.isPending} onClick={() => cargarEjemplo.mutate([])}>
              Cargar menú de ejemplo
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_400px]">
      {/* ── Catálogo ── */}
      <section aria-label="Productos" className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-col gap-4 px-7 pt-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-tinta-suave" />
              <Input
                ref={buscador}
                autoFocus
                type="search"
                aria-label="Buscar producto o código"
                placeholder="Buscar o escribir el código (H1, P2…) y Enter"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    alEnter();
                  } else if (e.key === 'Escape') setBusqueda('');
                }}
                className="h-12 pr-12 pl-12 text-base [&::-webkit-search-cancel-button]:hidden"
              />
              {busqueda && (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => {
                    setBusqueda('');
                    enfocarBuscador();
                  }}
                  className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-tinta-suave hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {resumen.data && (
              <p className="shrink-0 text-right text-[13px] leading-tight text-tinta-suave">
                Hoy · {resumen.data.pedidos} {resumen.data.pedidos === 1 ? 'pedido' : 'pedidos'}
                <br />
                <span className="numeros font-display text-[17px] font-semibold text-tinta">{pesos(resumen.data.totalCentavos)}</span>
              </p>
            )}
          </div>
          {!texto && (
            <nav aria-label="Categorías" className="flex flex-wrap gap-2">
              {[{ id: 'todas' as const, nombre: 'Todo' }, ...visibles.categorias].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoria === c.id}
                  onClick={() => setCategoria(c.id)}
                  className={cn(
                    'h-10 rounded-full border px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
                    categoria === c.id
                      ? 'border-tinta bg-tinta text-white'
                      : 'border-linea bg-superficie text-tinta hover:border-linea-fuerte',
                  )}
                >
                  {c.nombre}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
          {mostrados.length > 0 ? (
            <GrillaProductos productos={mostrados} alTocar={tocar} />
          ) : (
            <p className="py-16 text-center text-tinta-suave">Nada coincide con “{busqueda}”.</p>
          )}
        </div>
      </section>

      <PanelPedido
        {...totales}
        falta={falta}
        envioPorDefecto={envioPorDefecto}
        alEditar={(item) => {
          const producto = menu.data.productos.find((p) => p.id === item.productoId);
          if (producto) setArmando({ producto, editando: item });
        }}
        alCobrar={() => setCobrando(true)}
      />

      {armando && (
        <DialogoArmar
          menu={menu.data}
          producto={armando.producto}
          editando={armando.editando}
          alCerrar={() => {
            setArmando(null);
            enfocarBuscador();
          }}
          alConfirmar={(item) => {
            if (armando.editando) carrito.reemplazar(armando.editando.clave, item);
            else carrito.agregar(item);
            setArmando(null);
            enfocarBuscador();
          }}
        />
      )}

      <DialogoCobro
        abierto={cobrando}
        totalCentavos={totales.totalCentavos}
        armarPedido={() => ({
          tipo: carrito.tipo,
          mesa: carrito.mesa,
          clienteNombre: carrito.clienteNombre,
          clienteTelefono: carrito.clienteTelefono,
          clienteDireccion: carrito.clienteDireccion,
          envioCentavos: totales.envioCentavos,
          items: carrito.items.map(({ productoId, varianteId, opcionesIds, cantidad, nota }) => ({
            productoId,
            varianteId,
            opcionesIds,
            cantidad,
            nota,
          })),
          totalEsperadoCentavos: totales.totalCentavos,
        })}
        alCerrar={() => {
          setCobrando(false);
          enfocarBuscador();
        }}
        alTerminar={() => {
          carrito.vaciar();
          setCobrando(false);
          setCategoria('todas');
          enfocarBuscador();
        }}
      />
    </div>
  );
}
