import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarRange, Minus } from 'lucide-react';
import { pesos, pesosCortos } from '@compartido/dinero';
import { NOMBRE_MEDIO, NOMBRE_TIPO, type Reporte } from '@compartido/tipos';
import { esquemaRango } from '@compartido/esquemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GraficoColumnas, type Columna } from '@/components/graficos/columnas';
import { BarrasHorizontales, porcentaje } from '@/components/graficos/barras';
import { TarjetaGrafico } from '@/components/graficos/tarjeta-grafico';
import { cn } from '@/lib/utils';
import { useExportarLibro, useLibroDeVentas, useReporte } from './consultas';
import { PERIODOS, columnasDeVentas, rangoDe, tablaDeVentas, textoAnterior, textoPedidos, textoRango, type Periodo, type Rango } from './rangos';
import { TablaLibro } from './tabla-libro';
import { TablaProductos } from './tabla-productos';

export function PaginaReportes() {
  const [periodo, setPeriodo] = useState<Periodo | 'elegido'>('7dias');
  const [rango, setRango] = useState<Rango>(() => rangoDe('7dias'));
  const [pestana, setPestana] = useState('resumen');
  const reporte = useReporte(rango);
  const libro = useLibroDeVentas(rango);
  const exportar = useExportarLibro();
  const r = reporte.data;

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-8 pt-7 pb-10">
      <header>
        <h1 className="font-display text-[34px] leading-none font-semibold tracking-tight">Reportes</h1>
        <p className="mt-2 text-tinta-suave first-letter:uppercase">
          {textoRango(rango)}
          {r && r.pedidos > 0 && ` · ${textoPedidos(r.pedidos)}`}
        </p>
      </header>

      <Filtros
        periodo={periodo}
        rango={rango}
        alElegir={(p) => {
          setPeriodo(p);
          setRango(rangoDe(p));
        }}
        alElegirFechas={(nuevo) => {
          setPeriodo('elegido');
          setRango(nuevo);
        }}
      />

      {reporte.isError && <p role="alert" className="font-semibold text-rojo">{reporte.error.message}</p>}
      {reporte.isPending && <p className="text-tinta-suave">Cargando…</p>}

      {r && (
        <Tabs value={pestana} onValueChange={setPestana} className={cn('gap-5 transition-opacity', reporte.isPlaceholderData && 'opacity-60')}>
          <TabsList>
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="libro">Libro de ventas</TabsTrigger>
          </TabsList>
          <TabsContent value="resumen" className="flex flex-col gap-5">
            <Datos r={r} />
            {r.pedidos === 0 ? (
              <SinVentas />
            ) : (
              <Resumen r={r} alVerProductos={() => setPestana('productos')} />
            )}
          </TabsContent>
          <TabsContent value="productos">
            <TablaProductos productos={r.productos} />
          </TabsContent>
          <TabsContent value="libro">
            {libro.isError && <p role="alert" className="font-semibold text-rojo">{libro.error.message}</p>}
            {libro.data && <TablaLibro libro={libro.data} exportando={exportar.isPending} alExportar={() => exportar.mutate(rango)} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ───────────────────────── Filtros ─────────────────────────

function Filtros({
  periodo,
  rango,
  alElegir,
  alElegirFechas,
}: {
  periodo: Periodo | 'elegido';
  rango: Rango;
  alElegir: (p: Periodo) => void;
  alElegirFechas: (r: Rango) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [desde, setDesde] = useState(rango.desde);
  const [hasta, setHasta] = useState(rango.hasta);
  const [error, setError] = useState('');

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const r = esquemaRango.safeParse({ desde, hasta });
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Revisá las fechas.');
    setError('');
    alElegirFechas(r.data);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Período" className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={periodo === p.id}
            onClick={() => {
              setEligiendo(false);
              alElegir(p.id);
            }}
            className={cn(
              'h-9 rounded-lg px-3.5 text-[14px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-tinta/30',
              periodo === p.id ? 'bg-superficie text-tinta shadow-sm' : 'text-tinta-suave hover:text-tinta',
            )}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      <Button
        variant={periodo === 'elegido' || eligiendo ? 'oscuro' : 'outline'}
        size="sm"
        className="h-11"
        aria-expanded={eligiendo}
        onClick={() => {
          setDesde(rango.desde);
          setHasta(rango.hasta);
          setEligiendo((v) => !v);
        }}
      >
        <CalendarRange /> Elegir fechas
      </Button>
      {eligiendo && (
        <form onSubmit={aplicar} className="flex flex-wrap items-center gap-2">
          <Input type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-11 w-[160px]" />
          <span className="text-tinta-suave">al</span>
          <Input type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-11 w-[160px]" />
          <Button type="submit" size="sm" className="h-11">
            Ver
          </Button>
          {error && <p role="alert" className="text-sm font-semibold text-rojo">{error}</p>}
        </form>
      )}
    </div>
  );
}

// ───────────────────────── Números principales ─────────────────────────

function Variacion({ actual, anterior, dias }: { actual: number; anterior: number; dias: number }) {
  const contra = `vs. ${textoAnterior(dias)}`;
  if (anterior === 0) {
    return <p className="text-[13px] text-tinta-suave">{actual > 0 ? `Sin ventas en ${textoAnterior(dias)}` : '—'}</p>;
  }
  const cambio = (actual - anterior) / anterior;
  const redondeado = Math.round(cambio * 100);
  const Icono = redondeado > 0 ? ArrowUpRight : redondeado < 0 ? ArrowDownRight : Minus;
  return (
    <p className="text-[13px] leading-snug">
      <span className={cn('mr-1 inline-flex items-center gap-0.5 font-semibold whitespace-nowrap', redondeado > 0 ? 'text-verde' : redondeado < 0 ? 'text-rojo' : 'text-tinta-suave')}>
        <Icono className="size-4" aria-hidden="true" />
        {redondeado > 0 ? '+' : ''}
        {redondeado} %
      </span>
      <span className="text-tinta-suave">{contra}</span>
    </p>
  );
}

function Dato({ etiqueta, valor, pie, grande = false }: { etiqueta: string; valor: string; pie?: ReactNode; grande?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-linea bg-superficie px-5 py-4">
      <p className="text-[14px] text-tinta-suave">{etiqueta}</p>
      <p className={cn('leading-none font-semibold tracking-tight', grande ? 'text-[48px]' : 'text-[30px]')}>{valor}</p>
      <div className="mt-auto pt-1">{pie}</div>
    </div>
  );
}

function Datos({ r }: { r: Reporte }) {
  return (
    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4">
      <Dato
        grande
        etiqueta="Ventas"
        valor={pesos(r.ventasCentavos)}
        pie={
          <>
            <Variacion actual={r.ventasCentavos} anterior={r.anterior.ventasCentavos} dias={r.dias} />
            {r.sinCobrar.cantidad > 0 && (
              <p className="mt-1 text-[13px] text-tinta-suave">Incluye {pesos(r.sinCobrar.totalCentavos)} a cobrar</p>
            )}
          </>
        }
      />
      <Dato etiqueta="Pedidos" valor={r.pedidos.toLocaleString('es-AR')} pie={<Variacion actual={r.pedidos} anterior={r.anterior.pedidos} dias={r.dias} />} />
      <Dato etiqueta="Ticket promedio" valor={pesos(r.ticketPromedioCentavos)} pie={<p className="text-[13px] text-tinta-suave">Lo que gasta cada pedido</p>} />
      <Dato
        etiqueta="Anulados"
        valor={r.anulados.cantidad.toLocaleString('es-AR')}
        pie={<p className="text-[13px] text-tinta-suave">{r.anulados.cantidad ? `${pesos(r.anulados.totalCentavos)} que no suman` : 'Ninguno'}</p>}
      />
    </div>
  );
}

function SinVentas() {
  return (
    <section className="flex flex-col items-center gap-2 rounded-2xl border border-linea bg-superficie px-8 py-14 text-center">
      <h2 className="font-display text-2xl font-semibold tracking-tight">No hay ventas en este período</h2>
      <p className="max-w-md text-tinta-suave">Probá con otro período, o cargá algunos pedidos en Vender para ver los gráficos.</p>
    </section>
  );
}

// ───────────────────────── Gráficos ─────────────────────────

function Resumen({ r, alVerProductos }: { r: Reporte; alVerProductos: () => void }) {
  const unDia = r.dias === 1;
  const columnasVentas: Columna[] = unDia ? columnasPorHora(r, 'ventas') : columnasDeVentas(r.porDia);
  const horas = columnasPorHora(r, 'pedidos');
  const cobrado = r.porMedio.reduce((s, m) => s + m.montoCentavos, 0);
  const top = r.productos.slice(0, 8);

  return (
    <>
      <TarjetaGrafico
        titulo={unDia ? 'Ventas por hora' : r.dias > 62 ? 'Ventas por mes' : 'Ventas por día'}
        descripcion="Pasá el mouse por una columna para ver el detalle"
        tabla={tablaDeVentas(columnasVentas)}
      >
        <GraficoColumnas
          nombre={unDia ? 'Ventas por hora' : 'Ventas por día'}
          columnas={columnasVentas}
          formatear={pesos}
          formatearEje={pesosCortos}
          alto={260}
        />
      </TarjetaGrafico>

      <div className="grid grid-cols-2 gap-5">
        {!unDia && horas.length > 0 && (
          <TarjetaGrafico
            titulo="Horarios con más pedidos"
            descripcion={`Pedidos de cada hora, sumando los ${r.dias} días`}
            tabla={{ columnas: ['Hora', 'Pedidos', 'Ventas'], filas: horas.map((h) => [h.titulo, h.valor, h.detalle ?? '']) }}
          >
            <GraficoColumnas
              nombre="Pedidos por hora"
              columnas={horas}
              formatear={(v) => textoPedidos(v)}
              formatearEje={(v) => v.toLocaleString('es-AR')}
              alto={220}
            />
          </TarjetaGrafico>
        )}

        <TarjetaGrafico
          titulo="Medios de pago"
          descripcion={`Cobrado: ${pesos(cobrado)}${r.sinCobrar.cantidad ? ` · ${pesos(r.sinCobrar.totalCentavos)} todavía a cobrar` : ''}`}
          tabla={{
            columnas: ['Medio', 'Cobros', 'Monto', '%'],
            filas: r.porMedio.map((m) => [NOMBRE_MEDIO[m.medio], m.cobros, pesos(m.montoCentavos), porcentaje(m.montoCentavos, cobrado)]),
          }}
        >
          <BarrasHorizontales
            conPorcentaje
            formatear={pesos}
            barras={r.porMedio.map((m) => ({
              clave: m.medio,
              etiqueta: NOMBRE_MEDIO[m.medio],
              valor: m.montoCentavos,
              detalle: m.cobros === 1 ? '1 cobro' : `${m.cobros} cobros`,
            }))}
          />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Lo más vendido"
          descripcion="Por plata vendida (incluye agregados)"
          acciones={
            <Button variant="ghost" size="sm" className="text-tinta-suave" onClick={alVerProductos}>
              Ver todos
            </Button>
          }
          tabla={{
            columnas: ['Producto', 'Cantidad', 'Ventas'],
            filas: top.map((p) => [p.nombre, p.cantidad, pesos(p.ventasCentavos)]),
          }}
        >
          <BarrasHorizontales
            formatear={pesos}
            barras={top.map((p) => ({ clave: String(p.productoId), etiqueta: p.nombre, valor: p.ventasCentavos, detalle: `× ${p.cantidad}` }))}
          />
        </TarjetaGrafico>

        <div className="flex flex-col gap-5">
          <TarjetaGrafico
            titulo="Tipo de pedido"
            descripcion={
              r.porTipo.find((t) => t.tipo === 'delivery')?.pedidos
                ? `Envíos: ${pesos(r.envioCentavos)} · ${r.clientes.conPedidos} ${r.clientes.conPedidos === 1 ? 'cliente' : 'clientes'} de delivery (${r.clientes.nuevos} ${r.clientes.nuevos === 1 ? 'nuevo' : 'nuevos'})`
                : undefined
            }
            tabla={{
              columnas: ['Tipo', 'Pedidos', 'Ventas'],
              filas: r.porTipo.map((t) => [NOMBRE_TIPO[t.tipo], t.pedidos, pesos(t.ventasCentavos)]),
            }}
          >
            <BarrasHorizontales
              conPorcentaje
              formatear={pesos}
              barras={r.porTipo.map((t) => ({ clave: t.tipo, etiqueta: NOMBRE_TIPO[t.tipo], valor: t.ventasCentavos, detalle: textoPedidos(t.pedidos) }))}
            />
          </TarjetaGrafico>

          {r.porUsuario.length > 0 && (
            <TarjetaGrafico
              titulo="Ventas por usuario"
              descripcion="Quién tomó cada pedido"
              tabla={{
                columnas: ['Usuario', 'Pedidos', 'Ventas'],
                filas: r.porUsuario.map((u) => [u.nombre, u.pedidos, pesos(u.ventasCentavos)]),
              }}
            >
              <BarrasHorizontales
                conPorcentaje
                formatear={pesos}
                barras={r.porUsuario.map((u) => ({ clave: String(u.usuarioId), etiqueta: u.nombre, valor: u.ventasCentavos, detalle: textoPedidos(u.pedidos) }))}
              />
            </TarjetaGrafico>
          )}
        </div>
      </div>
    </>
  );
}

/** Las horas entre el primer y el último pedido (no tiene sentido mostrar las 4 de la mañana). */
function columnasPorHora(r: Reporte, medida: 'ventas' | 'pedidos'): Columna[] {
  const conPedidos = r.porHora.filter((h) => h.pedidos > 0);
  if (!conPedidos.length) return [];
  const primera = conPedidos[0]!.hora;
  const ultima = conPedidos[conPedidos.length - 1]!.hora;
  return r.porHora
    .filter((h) => h.hora >= primera && h.hora <= ultima)
    .map((h) => ({
      clave: String(h.hora),
      etiqueta: `${h.hora} h`,
      titulo: `De ${h.hora}:00 a ${h.hora}:59`,
      valor: medida === 'ventas' ? h.ventasCentavos : h.pedidos,
      detalle: medida === 'ventas' ? textoPedidos(h.pedidos) : pesos(h.ventasCentavos),
    }));
}
